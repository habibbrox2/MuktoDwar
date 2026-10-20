/**
 * Application assembly.
 *
 * Builds the Fastify instance, registers the security hooks, and mounts the
 * public API, the admin API and the static admin UI.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { ConfigStore } from './config/store.js';
import type { GatewayConfig } from './config/schema.js';
import { HealthTracker } from './providers/health.js';
import { Router } from './providers/router.js';
import { SecretStore } from './security/secret-store.js';
import { AdminSessionStore } from './security/auth.js';
import { assertLoopbackBind, isAllowedHostHeader } from './security/localhost.js';
import { registerPublicRoutes } from './api/routes.js';
import { registerAdminRoutes } from './api/admin.js';
import { redactRequestSummary, redactValue } from './security/redact.js';

/** Everything the application needs, injected so tests can substitute it. */
export interface AppDependencies {
  readonly configStore: ConfigStore;
  readonly secrets: SecretStore;
  readonly health: HealthTracker;
  readonly sessions: AdminSessionStore;
}

/** The assembled application. */
export interface GatewayApp {
  readonly app: FastifyInstance;
  readonly router: Router;
  readonly config: () => GatewayConfig;
  readonly health: HealthTracker;
  readonly sessions: AdminSessionStore;
}

/** Locate the static UI directory. */
function findUiDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', 'ui'),
    resolve(here, '..', '..', 'src', 'ui'),
    resolve(process.cwd(), 'src', 'ui'),
    resolve(process.cwd(), 'ui'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

/**
 * Build the gateway application.
 *
 * The listener is not started here; the caller decides when and where to
 * bind, after the localhost guard has run.
 */
export async function buildApp(deps: AppDependencies): Promise<GatewayApp> {
  const config = deps.configStore.get();

  // Fail closed if the configuration does not guarantee a loopback bind.
  assertLoopbackBind(config.gateway.host);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Never let a secret reach the log stream.
      serializers: {
        req: (request: { method: string; url: string }) =>
          redactRequestSummary({ method: request.method, url: request.url }),
      },
    },
    // Bounded request size. A larger body is rejected by Fastify itself.
    bodyLimit: config.gateway.maxBodyBytes,
    // The gateway is local-only; do not advertise the server version.
    trustProxy: false,
    // Bound the time a request may occupy a connection.
    requestTimeout: config.gateway.requestTimeoutMs,
    connectionTimeout: 30_000,
    keepAliveTimeout: 15_000,
  });

  const health = deps.health;
  const sessions = deps.sessions;

  const router = new Router({
    config: deps.configStore.get(),
    secrets: deps.secrets,
    health,
  });

  /** Rebuild the router after a configuration change. */
  const currentRouter = (): Router => {
    const latest = deps.configStore.get();
    // The router reads its configuration through the store, so a new router
    // is only needed when the provider set changes shape. Creating it per
    // call is cheap and guarantees consistency.
    return new Router({ config: latest, secrets: deps.secrets, health });
  };

  // Cookies carry the admin session; the static plugin serves the admin UI.
  await app.register(fastifyCookie);
  const uiDir = findUiDir() ?? resolve(process.cwd(), 'src', 'ui');
  await app.register(fastifyStatic, {
    root: uiDir,
    prefix: '/ui/',
    index: false,
  });
  await app.register(fastifyStatic, {
    root: resolve(process.cwd(), 'assets', 'brand'),
    prefix: '/brand/',
    index: false,
    decorateReply: false,
  });

  // The admin shell is read once at startup and served from memory.
  const shell = await readFile(join(uiDir, 'index.html'), 'utf8').catch(() => null);

  /**
   * Reject requests whose Host header is not loopback.
   *
   * This blocks DNS rebinding, where a remote page resolves an
   * attacker-controlled hostname to 127.0.0.1 and then talks to the gateway
   * as if it were a trusted local origin.
   */
  app.addHook('onRequest', async (request, reply) => {
    if (!isAllowedHostHeader(request.headers.host)) {
      reply.code(421).send({
        error: { message: 'The gateway only accepts requests addressed to the loopback interface.', type: 'misdirected_request' },
      });
    }
  });

  /**
   * Redact anything that reaches the log.
   */
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      redactValue({
        ...redactRequestSummary({
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          durationMs: reply.elapsedTime,
        }),
      }),
    );
  });

  await registerPublicRoutes(app, {
    getConfig: () => deps.configStore.get(),
    getRouter: currentRouter,
    secrets: deps.secrets,
  });

  await registerAdminRoutes(app, {
    getConfig: () => deps.configStore.get(),
    updateConfig: (next) => deps.configStore.update(next),
    secrets: deps.secrets,
    sessions,
    getRouter: currentRouter,
  });

  // Serve the admin UI shell from the same origin as the API.
  if (shell !== null) {
    app.get('/', async (_request, reply) => {
      reply.type('text/html; charset=utf-8');
      return reply.send(shell);
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/v1/') || request.url.startsWith('/admin/')) {
      reply.code(404).send({
        error: { message: 'Not found.', type: 'invalid_request_error', code: 'unknown_route' },
      });
      return;
    }
    reply.code(404).send({ error: { message: 'Not found.' } });
  });

  app.setErrorHandler(async (error: unknown, request, reply) => {
    const candidate = error as { statusCode?: number; message?: string };
    const statusCode = candidate.statusCode && candidate.statusCode >= 400 ? candidate.statusCode : 500;
    request.log.error(
      redactValue({ err: error, statusCode, url: request.url }),
    );
    if (reply.sent) return;
    reply.code(statusCode).send({
      error: {
        message:
          statusCode >= 500
            ? 'The gateway encountered an internal error.'
            : (candidate.message ?? 'The request was rejected.'),
        type: statusCode >= 500 ? 'api_error' : 'invalid_request_error',
      },
    });
  });

  return {
    app,
    router,
    config: () => deps.configStore.get(),
    health,
    sessions,
  };
}
