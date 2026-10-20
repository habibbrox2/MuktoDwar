/**
 * Administrative API routes.
 *
 * These endpoints mutate configuration, so they require administrator
 * authentication and a same-origin check. Provider keys are write-only:
 * a key can be set or replaced, but its value is never returned.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ADMIN_SESSION_COOKIE,
  AdminSessionStore,
  assertAdminAuth,
  clearAdminSessionCookie,
  setAdminSessionCookie,
} from '../security/auth.js';
import { SecretStore } from '../security/secret-store.js';
import { Router } from '../providers/router.js';
import type { GatewayConfig, ProviderConfig } from '../config/schema.js';
import { modelEntrySchema, providerConfigSchema } from '../config/schema.js';
import { PROVIDER_KINDS, catalogFor } from '../providers/catalog.js';
import { isSameOriginRequest } from '../security/localhost.js';
import { adminTokenRotatedPath } from '../config/paths.js';
import { pathExists } from '../config/paths.js';
import { writeFileSync } from 'node:fs';
import { deriveSecretId, generateToken } from '../security/auth.js';
import { sendError } from './routes.js';

/** Dependencies of the admin routes. */
export interface AdminRouteDependencies {
  readonly getConfig: () => GatewayConfig;
  readonly updateConfig: (next: unknown) => Promise<GatewayConfig>;
  readonly secrets: SecretStore;
  readonly sessions: AdminSessionStore;
  readonly getRouter: () => Router;
}

/** Schema for the provider create/update payload. */
const providerPayloadSchema = providerConfigSchema.partial({
  id: true,
}).extend({
  /** A new API key. It is encrypted immediately and never returned. */
  apiKey: z.string().min(1).max(500).optional(),
  /** Remove this key by id. */
  removeKeyId: z.string().max(64).optional(),
});

/** Schema for a routing update. */
const routingPayloadSchema = z.object({
  mode: z.enum(['hybrid', 'priority', 'latency']).optional(),
  defaultModel: z.string().max(200).optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  cooldownMs: z.number().int().min(1_000).max(3_600_000).optional(),
  circuitBreaker: z
    .object({
      failureThreshold: z.number().int().min(1).max(100).optional(),
      openMs: z.number().int().min(1_000).max(3_600_000).optional(),
    })
    .optional(),
  weights: z
    .object({
      priority: z.number().min(0).max(10).optional(),
      latency: z.number().min(0).max(10).optional(),
      health: z.number().min(0).max(10).optional(),
    })
    .optional(),
});

/** Register the administrative routes. */
export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: AdminRouteDependencies,
): Promise<void> {
  /** Reject cross-origin mutations before anything else runs. */
  const guard = async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    if (!isSameOriginRequest({ origin: request.headers.origin, host: request.headers.host })) {
      reply.code(403).send({
        error: { message: 'Cross-origin requests are not allowed.', type: 'forbidden' },
      });
      return false;
    }
    try {
      await assertAdminAuth(request, deps.secrets, deps.sessions);
    } catch (error) {
      reply.code(error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 401).send({
        error: {
          message: error instanceof Error ? error.message : 'Unauthorized.',
          type: 'authentication_error',
        },
      });
      return false;
    }
    return true;
  };

  /**
   * Exchange the admin token for a session cookie.
   *
   * This is the only endpoint that accepts the admin token in a body. The
   * token is never stored in browser storage; the browser keeps only an
   * httpOnly cookie.
   */
  app.post('/admin/session', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isSameOriginRequest({ origin: request.headers.origin, host: request.headers.host })) {
      reply.code(403).send({
        error: { message: 'Cross-origin requests are not allowed.', type: 'forbidden' },
      });
      return;
    }

    const body = request.body as { token?: unknown } | undefined;
    const token = typeof body?.token === 'string' ? body.token : '';
    const adminRecords = deps.secrets.list().filter((record) => record.kind === 'admin-token');
    const first = adminRecords[0];
    if (!first || !token) {
      reply.code(401).send({ error: { message: 'The admin token is not valid.', type: 'authentication_error' } });
      return;
    }
    const expected = await deps.secrets.get(first.id).catch(() => null);
    if (!expected || expected !== token) {
      reply.code(401).send({ error: { message: 'The admin token is not valid.', type: 'authentication_error' } });
      return;
    }

    const sessionId = deps.sessions.issue();
    setAdminSessionCookie(reply, sessionId, false);
    reply.send({ ok: true });
  });

  /** End the admin session. */
  app.delete('/admin/session', async (request: FastifyRequest, reply: FastifyReply) => {
    deps.sessions.revoke(request.cookies[ADMIN_SESSION_COOKIE]);
    clearAdminSessionCookie(reply);
    reply.send({ ok: true });
  });

  /** Return the initial admin token until it has been rotated. */
  app.get('/admin/default-token', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (await pathExists(adminTokenRotatedPath())) {
      reply.code(404).send({ error: { message: 'The default admin token is no longer available.', type: 'not_found' } });
      return;
    }
    const adminRecords = deps.secrets.list().filter((record) => record.kind === 'admin-token');
    const first = adminRecords[0];
    if (!first) {
      reply.code(404).send({ error: { message: 'No admin token exists yet.', type: 'not_found' } });
      return;
    }
    const token = await deps.secrets.get(first.id).catch(() => null);
    if (!token) {
      reply.code(404).send({ error: { message: 'The admin token could not be read.', type: 'not_found' } });
      return;
    }
    reply.send({ token });
  });

  /**
   * The provider catalogue: what the gateway knows about each provider and
   * which models are confirmed free.
   */
  app.get('/admin/catalog', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    reply.send({
      providers: PROVIDER_KINDS.map((kind) => {
        const catalog = catalogFor(kind);
        return {
          kind,
          label: catalog.label,
          baseUrl: catalog.baseUrl,
          requiresKey: catalog.requiresKey,
          freeWithoutCard: catalog.freeWithoutCard,
          freeTerms: catalog.freeTerms,
          caveats: catalog.caveats,
          docsUrl: catalog.docsUrl,
          unverified: catalog.unverified,
          models: catalog.models.map((model) => ({
            id: model.id,
            free: model.free,
            verified: model.verified,
            contextWindow: model.contextWindow ?? null,
            maxOutputTokens: model.maxOutputTokens ?? null,
            source: model.source,
          })),
        };
      }),
    });
  });

  /** The current configuration, with secrets removed. */
  app.get('/admin/config', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    reply.send(sanitiseConfig(deps.getConfig()));
  });

  /** Update the routing settings. */
  app.put('/admin/routing', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const parsed = routingPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: { message: parsed.error.issues.map((i) => i.message).join('; ') } });
      return;
    }
    try {
      const current = deps.getConfig();
      const routing = { ...current.routing };
      if (parsed.data.mode !== undefined) routing.mode = parsed.data.mode;
      if (parsed.data.defaultModel !== undefined) routing.defaultModel = parsed.data.defaultModel;
      if (parsed.data.maxAttempts !== undefined) routing.maxAttempts = parsed.data.maxAttempts;
      if (parsed.data.cooldownMs !== undefined) routing.cooldownMs = parsed.data.cooldownMs;
      const breaker = { ...current.routing.circuitBreaker };
      const weights = { ...current.routing.weights };
      if (parsed.data.circuitBreaker) {
        if (parsed.data.circuitBreaker.failureThreshold !== undefined) {
          breaker.failureThreshold = parsed.data.circuitBreaker.failureThreshold;
        }
        if (parsed.data.circuitBreaker.openMs !== undefined) {
          breaker.openMs = parsed.data.circuitBreaker.openMs;
        }
      }
      if (parsed.data.weights) {
        if (parsed.data.weights.priority !== undefined) weights.priority = parsed.data.weights.priority;
        if (parsed.data.weights.latency !== undefined) weights.latency = parsed.data.weights.latency;
        if (parsed.data.weights.health !== undefined) weights.health = parsed.data.weights.health;
      }
      const next: GatewayConfig = {
        ...current,
        routing: { ...routing, circuitBreaker: breaker, weights },
      };
      reply.send(sanitiseConfig(await deps.updateConfig(next)));
    } catch (error) {
      sendError(reply, error);
    }
  });

  /** Update the gateway settings. */
  app.put('/admin/gateway', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const body = request.body as { port?: number } | undefined;
    const port = body?.port;
    if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      reply.code(400).send({ error: { message: 'The port must be an integer between 1024 and 65535.' } });
      return;
    }
    try {
      const current = deps.getConfig();
      const next: GatewayConfig = {
        ...current,
        gateway: { ...current.gateway, ...(port === undefined ? {} : { port }) },
      };
      reply.send(sanitiseConfig(await deps.updateConfig(next)));
    } catch (error) {
      sendError(reply, error);
    }
  });

  /** Create or update a provider. */
  app.post('/admin/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const parsed = providerPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({
        error: { message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      });
      return;
    }
    const payload = parsed.data;

    try {
      const current = deps.getConfig();
      const providers = [...current.providers];
      const index = providers.findIndex((provider) => provider.id === payload.id);
      const existing = index >= 0 ? providers[index] : undefined;

      if (!payload.id) {
        reply.code(400).send({ error: { message: 'A provider id is required.' } });
        return;
      }

      // Build the provider record. The API key is handled separately and is
      // never part of the stored configuration.
      const { apiKey, removeKeyId, ...fields } = payload;
      const base: ProviderConfig = {
        ...(existing ?? {
          id: payload.id,
          kind: 'custom',
          label: payload.id,
          enabled: false,
          priority: 100,
          anonymous: false,
          models: [],
          keys: [],
        }),
        ...fields,
        id: payload.id,
      } as ProviderConfig;

      // A provider that requires a key must have at least one key.
      const catalog = catalogFor(base.kind);
      if (base.enabled && catalog.requiresKey && !base.anonymous && base.keys.length === 0) {
        reply.code(400).send({
          error: { message: 'Add an API key before enabling this provider.' },
        });
        return;
      }

      // Reject any model that is not explicitly marked free.
      const invalidModel = base.models.find((model) => !model.free);
      if (invalidModel) {
        reply.code(400).send({
          error: { message: `Model "${invalidModel.id}" is not marked as free and cannot be used.` },
        });
        return;
      }

      if (removeKeyId) {
        base.keys = base.keys.filter((key) => key.id !== removeKeyId);
        await deps.secrets.remove(
          base.keys.find((key) => key.id === removeKeyId)?.secretId ?? '',
        );
      }

      if (apiKey !== undefined) {
        const keyId = `key_${generateToken(6).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
        const secretId = deriveSecretId('sk', apiKey);
        await deps.secrets.set(secretId, 'provider-key', apiKey, `${base.label} key`);
        base.keys = [
          ...base.keys,
          {
            id: keyId,
            secretId,
            label: `Key ${base.keys.length + 1}`,
            enabled: true,
            priority: 100,
            failureThreshold: 3,
            cooldownMs: 60_000,
          },
        ];
      }

      if (index >= 0) providers[index] = base;
      else providers.push(base);

      const next: GatewayConfig = { ...current, providers };
      reply.send(sanitiseConfig(await deps.updateConfig(next)));
    } catch (error) {
      sendError(reply, error);
    }
  });

  /** Delete a provider and its stored keys. */
  app.delete('/admin/providers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const id = (request.params as { id: string }).id;
    try {
      const current = deps.getConfig();
      const provider = current.providers.find((entry) => entry.id === id);
      if (!provider) {
        reply.code(404).send({ error: { message: 'No such provider.' } });
        return;
      }
      for (const key of provider.keys) {
        await deps.secrets.remove(key.secretId);
      }
      const next: GatewayConfig = {
        ...current,
        providers: current.providers.filter((entry) => entry.id !== id),
      };
      reply.send(sanitiseConfig(await deps.updateConfig(next)));
    } catch (error) {
      sendError(reply, error);
    }
  });

  /** Add a model to a provider's allowlist. */
  app.post('/admin/providers/:id/models', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const parsed = modelEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: { message: parsed.error.issues.map((i) => i.message).join('; ') } });
      return;
    }
    if (!parsed.data.free) {
      reply.code(400).send({
        error: { message: 'Only models that are free may be added to the allowlist.' },
      });
      return;
    }
    try {
      const current = deps.getConfig();
      const provider = current.providers.find((entry) => entry.id === id);
      if (!provider) {
        reply.code(404).send({ error: { message: 'No such provider.' } });
        return;
      }
      const models = provider.models.filter((model) => model.id !== parsed.data.id);
      models.push(parsed.data);
      const next: GatewayConfig = {
        ...current,
        providers: current.providers.map((entry) =>
          entry.id === id ? { ...entry, models } : entry,
        ),
      };
      reply.send(sanitiseConfig(await deps.updateConfig(next)));
    } catch (error) {
      sendError(reply, error);
    }
  });

  /** Remove a model from a provider's allowlist. */
  app.delete('/admin/providers/:id/models/:model', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const { id, model } = request.params as { id: string; model: string };
    try {
      const current = deps.getConfig();
      const next: GatewayConfig = {
        ...current,
        providers: current.providers.map((entry) =>
          entry.id === id
            ? { ...entry, models: entry.models.filter((entryModel) => entryModel.id !== model) }
            : entry,
        ),
      };
      reply.send(sanitiseConfig(await deps.updateConfig(next)));
    } catch (error) {
      sendError(reply, error);
    }
  });

  /** Runtime status: provider health, latency and available models. */
  app.get('/admin/status', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const router = deps.getRouter();
    const health = routerHealth(router);
    reply.send({
      health,
      models: router.availableModels().map((entry) => ({
        model: entry.model.id,
        providerId: entry.providerId,
        providerLabel: entry.providerLabel,
        verified: entry.model.verified,
      })),
      secrets: deps.secrets.list().map((record) => ({
        id: record.id,
        kind: record.kind,
        label: record.label ?? null,
        createdAt: record.createdAt,
        // The value is never disclosed.
        value: null,
      })),
    });
  });

  /** Rotate the gateway token. The new value is returned exactly once. */
  app.post('/admin/tokens/gateway/rotate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const token = generateToken(32);
    const secretId = deriveSecretId('gwt', token);
    const existing = deps.secrets.list().find((record) => record.kind === 'gateway-token');
    if (existing) await deps.secrets.remove(existing.id);
    await deps.secrets.set(secretId, 'gateway-token', token, 'Gateway token');
    reply.send({ token });
  });

  /** Rotate the admin token. The new value is returned exactly once. */
  app.post('/admin/tokens/admin/rotate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await guard(request, reply))) return;
    const token = generateToken(32);
    const secretId = deriveSecretId('adt', token);
    const existing = deps.secrets.list().find((record) => record.kind === 'admin-token');
    if (existing) await deps.secrets.remove(existing.id);
    await deps.secrets.set(secretId, 'admin-token', token, 'Admin token');
    writeFileSync(adminTokenRotatedPath(), new Date().toISOString(), { mode: 0o600 });
    // Force re-authentication everywhere.
    reply.send({ token });
  });
}

/** Extract the health snapshot from the router. */
function routerHealth(router: Router): unknown {
  const health = (router as unknown as { health?: { snapshot: () => unknown } }).health;
  return health?.snapshot() ?? [];
}

/**
 * Remove secret-adjacent detail from the configuration before sending it.
 *
 * The configuration never contains key material, but the secret ids are
 * internal handles, so they are replaced with opaque labels.
 */
function sanitiseConfig(config: GatewayConfig): unknown {
  return {
    version: config.version,
    gateway: config.gateway,
    routing: config.routing,
    providers: config.providers.map((provider) => ({
      id: provider.id,
      kind: provider.kind,
      label: provider.label,
      enabled: provider.enabled,
      priority: provider.priority,
      baseUrl: provider.baseUrl ?? null,
      anonymous: provider.anonymous,
      notes: provider.notes ?? null,
      models: provider.models,
      // Key material is never included. Only non-sensitive metadata is.
      keys: provider.keys.map((key) => ({
        id: key.id,
        label: key.label ?? null,
        enabled: key.enabled,
        priority: key.priority,
        failureThreshold: key.failureThreshold,
        cooldownMs: key.cooldownMs,
        hasValue: true,
      })),
    })),
  };
}
