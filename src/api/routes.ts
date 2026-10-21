/**
 * Public API routes: the OpenAI-compatible surface.
 *
 * These routes are the contract that OpenCode, PHP clients and JavaScript
 * clients program against. They mirror the OpenAI Chat Completions API
 * closely enough that the official SDKs work unchanged.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GATEWAY_AUTO_MODEL, Router, RoutingError } from '../providers/router.js';
import { ProviderError } from '../providers/types.js';
import type { ChatCompletionRequest } from '../providers/types.js';
import { SecretStore } from '../security/secret-store.js';
import { assertGatewayToken } from '../security/auth.js';
import type { GatewayConfig } from '../config/schema.js';
import { GATEWAY_VERSION } from '../version.js';
import { registerSecretValue } from '../security/redact.js';

/** Schema for the chat completions request body. */
const chatRequestSchema = z.object({
  model: z.string().max(200).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool', 'developer']),
        content: z.unknown().optional(),
        name: z.string().max(120).optional(),
        tool_call_id: z.string().max(120).optional(),
        tool_calls: z.array(z.record(z.string(), z.unknown())).optional(),
      }),
    )
    .min(1, 'At least one message is required.'),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().max(1_000_000).optional(),
  max_completion_tokens: z.number().int().positive().max(1_000_000).optional(),
  stop: z.union([z.string().max(200), z.array(z.string().max(200)).max(8)]).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional(),
  n: z.number().int().min(1).max(8).optional(),
  tools: z.array(z.record(z.string(), z.unknown())).max(64).optional(),
  tool_choice: z.unknown().optional(),
  response_format: z.record(z.string(), z.unknown()).optional(),
  user: z.string().max(200).optional(),
});

/** Dependencies of the public routes. */
export interface PublicRouteDependencies {
  readonly getConfig: () => GatewayConfig;
  readonly getRouter: () => Router;
  readonly secrets: SecretStore;
}

/** Convert a validation failure into an OpenAI-shaped error body. */
function validationErrorBody(error: z.ZodError): Record<string, unknown> {
  return {
    error: {
      message: error.issues.map((issue) => issue.message).join('; '),
      type: 'invalid_request_error',
      param: error.issues[0]?.path.join('.') ?? null,
      code: 'invalid_request',
    },
  };
}

/** Register the public API routes. */
export async function registerPublicRoutes(
  app: FastifyInstance,
  deps: PublicRouteDependencies,
): Promise<void> {
  /**
   * Liveness and readiness.
   *
   * Deliberately unauthenticated: it exposes no secret and no configuration
   * detail, and clients need it before they have a token.
   */
  app.get('/health', async () => {
    const config = deps.getConfig();
    const router = deps.getRouter();
    const models = router.availableModels();
    return {
      status: 'ok',
      version: GATEWAY_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      providers: config.providers.filter((provider) => provider.enabled).length,
      models: models.length,
    };
  });

  const embedRequestSchema = z.object({
  model: z.string().max(200).optional(),
  input: z.string().max(1_000_000),
});

  /**
   * List the free models the gateway can serve.
   */
  app.get('/v1/models', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await assertGatewayToken(request, deps.secrets);
    } catch (error) {
      reply.code(401).send({
        error: {
          message: error instanceof Error ? error.message : 'Unauthorized.',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      });
      return;
    }

    const router = deps.getRouter();
    const config = deps.getConfig();
    const created = Math.floor(Date.now() / 1000);
    const data = router.availableModels().map((entry) => ({
      id: entry.model.id,
      object: 'model',
      created,
      owned_by: entry.providerId,
      // Expose the free status so clients can assert on it.
      free: true,
      verified: entry.model.verified,
    }));

    // The gateway's own auto model comes first: it is the id a client can
    // be configured with once and keep using when the allowlist changes.
    if (data.length > 0) {
      data.unshift({
        id: GATEWAY_AUTO_MODEL,
        object: 'model',
        created,
        owned_by: 'muktodwar',
        free: true,
        verified: true,
      });
    }

    // The gateway's own auto model comes first: it is the id a client can
    // be configured with once and keep using when the allowlist changes.
    // The configured default follows, then the rest alphabetically.
    const defaultModel = config.routing.defaultModel;
    data.sort((a, b) => {
      if (a.id === GATEWAY_AUTO_MODEL) return -1;
      if (b.id === GATEWAY_AUTO_MODEL) return 1;
      if (a.id === defaultModel) return -1;
      if (b.id === defaultModel) return 1;
      return a.id.localeCompare(b.id);
    });

    reply.send({ object: 'list', data });
  });

  /**
   * Create an embedding vector.
   */
  app.post('/v1/embeddings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await assertGatewayToken(request, deps.secrets);
    } catch (error) {
      reply.code(401).send({
        error: {
          message: error instanceof Error ? error.message : 'Unauthorized.',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      });
      return;
    }

    const parsed = embedRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(validationErrorBody(parsed.error));
      return;
    }

    const body = parsed.data as { model?: string; input: string };
    const router = deps.getRouter();
    const config = deps.getConfig();
    const requestSignal = request.raw.signal ?? new AbortController().signal;
    const timeoutMs = config.gateway.requestTimeoutMs;
    try {
      const { result } = await router.embed(body, { signal: requestSignal, timeoutMs });

      const payload = {
        object: 'embedding',
        model: result.model,
        created: Math.floor(Date.now() / 1000),
        data: result.data.map((item) => ({
          object: 'embedding',
          embedding: item.embedding,
          index: item.index,
        })),
        usage: result.usage,
      };
      reply.send(payload);
    } catch (error) {
      if (reply.sent) return;
      sendError(reply, error);
    }
  });

  const imageRequestSchema = z.object({
  prompt: z.string().max(1000),
  size: z.enum(['256x256', '512x512', '1024x1024']).optional(),
  model: z.string().max(100).optional(),
});

  const responsesRequestSchema = z.object({
    model: z.string().max(200),
    instructions: z.string().max(4000),
    input: z.string().max(10000),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(1_000_000).optional(),
    stream: z.boolean().optional(),
});

  /**
   * Chat completions, streaming and non-streaming.
   */
  app.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await assertGatewayToken(request, deps.secrets);
    } catch (error) {
      reply.code(401).send({
        error: {
          message: error instanceof Error ? error.message : 'Unauthorized.',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      });
      return;
    }

    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(validationErrorBody(parsed.error));
      return;
    }

    const body = parsed.data as ChatCompletionRequest;
    const config = deps.getConfig();
    const router = deps.getRouter();
    const streaming = body.stream === true;

    // The client abort signal cancels the upstream request. A real
    // `http.IncomingMessage` always carries one; fall back to an inert
    // signal so the adapter never receives undefined.
    const requestSignal = request.raw.signal ?? new AbortController().signal;
    const timeoutMs = streaming ? config.gateway.streamTimeoutMs : config.gateway.requestTimeoutMs;

    try {
      if (streaming) {
        await streamCompletion(reply, router, body, requestSignal, timeoutMs, config);
      } else {
        await completeOnce(reply, router, body, requestSignal, timeoutMs);
      }
    } catch (error) {
      if (reply.sent) return;
      sendError(reply, error);
    }
  });

  /**
   * Create an image.
   */
  app.post('/v1/images/generations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await assertGatewayToken(request, deps.secrets);
    } catch (error) {
      reply.code(401).send({
        error: {
          message: error instanceof Error ? error.message : 'Unauthorized.',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      });
      return;
    }

    const parsed = imageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(validationErrorBody(parsed.error));
      return;
    }

    const body = parsed.data as { prompt: string; size?: string; model?: string };
    const router = deps.getRouter();
    const config = deps.getConfig();
    const requestSignal = request.raw.signal ?? new AbortController().signal;
    const timeoutMs = config.gateway.requestTimeoutMs;

    try {
      const { result } = await router.imageGenerate(body, { signal: requestSignal, timeoutMs });

      const payload = {
        created: Math.floor(Date.now() / 1000),
        data: [{
          url: result.url,
          b64_json: result.b64_json,
          revised_prompt: result.revised_prompt,
        }],
      };
      reply.send(payload);
    } catch (error) {
      if (reply.sent) return;
      sendError(reply, error);
    }
  });

  /**
   * List model capabilities for the Responses API.
   */
  app.post('/v1/responses', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await assertGatewayToken(request, deps.secrets);
    } catch (error) {
      reply.code(401).send({
        error: {
          message: error instanceof Error ? error.message : 'Unauthorized.',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      });
      return;
    }

    const parsed = responsesRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(validationErrorBody(parsed.error));
      return;
    }

    const body = parsed.data as { model: string; instructions: string; input: string; temperature?: number; max_tokens?: number; stream?: boolean };
    const router = deps.getRouter();
    const config = deps.getConfig();
    const requestSignal = request.raw.signal ?? new AbortController().signal;
    const timeoutMs = config.gateway.requestTimeoutMs;

    try {
      const { result } = await router.responseCreate(body, { signal: requestSignal, timeoutMs });

      reply.send(result);
    } catch (error) {
      if (reply.sent) return;
      sendError(reply, error);
    }
  });
}

/** Perform a non-streaming completion and send the result. */
async function completeOnce(
  reply: FastifyReply,
  router: Router,
  body: ChatCompletionRequest,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  const { result, candidate } = await router.complete(body, { signal, timeoutMs });

  // Rewrite the model id to the one actually served, so clients see the
  // upstream model rather than an alias.
  const payload = {
    ...result.body,
    model: candidate.model.id,
  };
  reply.send(payload);
}

/**
 * Perform a streaming completion using Server-Sent Events.
 *
 * The upstream body is piped through without buffering the whole response.
 * The stream ends with the `[DONE]` sentinel that OpenAI clients expect.
 */
async function streamCompletion(
  reply: FastifyReply,
  router: Router,
  body: ChatCompletionRequest,
  signal: AbortSignal,
  timeoutMs: number,
  config: GatewayConfig,
): Promise<void> {
  const { result } = await router.stream(body, { signal, timeoutMs });

  // Hijack before writing, so Fastify hands over the raw socket and does
  // not try to serialise a reply body of its own.
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Tell nginx-style proxies not to buffer the stream.
    'x-accel-buffering': 'no',
  });

  const write = (chunk: string): boolean => reply.raw.write(chunk);

  // Forward upstream SSE frames verbatim. The upstream provider already
  // speaks the OpenAI SSE dialect, so no re-encoding is needed.
  const decoder = new TextDecoder();
  let pending = '';

  const iterator = result.body[Symbol.asyncIterator]();

  const onClientGone = (): void => {
    result.dispose();
    void iterator.return?.(undefined);
  };
  reply.raw.once('close', onClientGone);

  try {
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      if (signal.aborted) break;
      pending += decoder.decode(next.value as Uint8Array, { stream: true });

      // Forward complete lines as they arrive, without waiting for the
      // upstream response to finish.
      const boundary = pending.lastIndexOf('\n');
      if (boundary >= 0) {
        const chunk = pending.slice(0, boundary + 1);
        pending = pending.slice(boundary + 1);
        if (!write(chunk)) {
          await waitForDrain(reply.raw);
        }
      }
    }

    if (pending.length > 0 && !signal.aborted) {
      write(pending);
    }

    // The OpenAI dialect ends the stream with a `[DONE]` sentinel. Some
    // providers already send it; sending it twice is harmless for OpenAI
    // clients, which stop at the first occurrence.
    if (!signal.aborted) {
      write('data: [DONE]\n\n');
    }
    reply.raw.end();
  } catch (error) {
    if (!signal.aborted) {
      const message = error instanceof Error ? error.message : 'The stream failed.';
      write(`data: ${JSON.stringify({ error: { message, type: 'upstream_error' } })}\n\n`);
      write('data: [DONE]\n\n');
    }
    reply.raw.end();
  } finally {
    reply.raw.off('close', onClientGone);
    result.dispose();
  }

  // Keep the config reference meaningful for future idle-timeout handling.
  void config;
}

/** Wait for a writable stream to drain. */
function waitForDrain(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => {
    stream.once('drain', () => resolve());
  });
}

/** Translate an error into an OpenAI-shaped error response. */
export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof RoutingError) {
    reply.code(error.statusCode).send({
      error: {
        message: error.message,
        type: error.statusCode === 404 ? 'not_found_error' : 'api_error',
        code: error.code,
        ...(error.attempts.length > 0
          ? { attempts: error.attempts.map((a) => ({ ...a, reason: a.reason.slice(0, 200) })) }
          : {}),
      },
    });
    return;
  }
  if (error instanceof ProviderError) {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 502;
    reply.code(status).send({
      error: {
        message: error.message,
        type: error.rateLimited ? 'rate_limit_error' : 'api_error',
        code: error.code ?? 'provider_error',
      },
    });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  reply.code(500).send({
    error: { message, type: 'api_error', code: 'internal_error' },
  });
}

/** Register the secret values that must be redacted from logs. */
export function registerConfiguredSecrets(secrets: SecretStore): void {
  for (const record of secrets.list()) {
    void secrets.get(record.id).then((value) => registerSecretValue(value)).catch(() => undefined);
  }
}
