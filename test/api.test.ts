/**
 * Public API integration tests.
 *
 * These exercise the real Fastify application through `app.inject()`, which
 * runs every hook and route without binding a port. No test opens a socket.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayApp } from '../src/app.js';
import type { ProviderConfig, ProviderKeyConfig } from '../src/config/schema.js';
import { createTestContext, type TestContext } from './helpers.js';

const GATEWAY_TOKEN = 'test-gateway-token-value';
const ADMIN_TOKEN = 'test-admin-token-value';

function key(id: string, secretId: string, enabled = true): ProviderKeyConfig {
  return { id, secretId, enabled, priority: 100, failureThreshold: 3, cooldownMs: 60_000 };
}

function provider(overrides: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  const id = overrides.id;
  return {
    kind: 'groq',
    label: id,
    enabled: true,
    anonymous: false,
    priority: 100,
    baseUrl: `https://${id}.example.test/v1`,
    models: [{ id: 'model-a', free: true, verified: true, contextWindow: 8_000 }],
    keys: [key('key-1', `${id}-secret`)],
    ...overrides,
  };
}

function completionBody(content = 'hello'): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1,
    model: 'model-a',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
}

let fetchCalls: Array<{ url: string; headers: Record<string, string> }> = [];

function stubFetch(responses: Array<Response | (() => Response)>): void {
  fetchCalls = [];
  let index = 0;
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next === undefined) throw new Error('no stubbed response');
    return typeof next === 'function' ? next() : next;
  });
}

/** Build an app configured with a gateway token and providers. */
async function buildConfiguredApp(
  providers: ProviderConfig[],
  routing: Record<string, unknown> = {},
): Promise<{ ctx: TestContext; app: GatewayApp }> {
  const ctx = await createTestContext();
  // `update` accepts an unvalidated document and runs it through the schema,
  // which is exactly what a persisted configuration file goes through.
  await ctx.configStore.update({
    version: 1,
    routing: { defaultModel: 'model-a', ...routing },
    providers,
  });
  await ctx.secrets.set('gw-token', 'gateway-token', GATEWAY_TOKEN);
  await ctx.secrets.set('admin-token', 'admin-token', ADMIN_TOKEN);
  for (const providerConfig of providers) {
    for (const providerKey of providerConfig.keys) {
      await ctx.secrets.set(providerKey.secretId, 'provider-key', `key-for-${providerKey.secretId}`);
    }
  }
  return { ctx, app: ctx.app };
}

const authHeaders = { authorization: `Bearer ${GATEWAY_TOKEN}` };
const adminHeaders = { authorization: `Bearer ${ADMIN_TOKEN}` };

describe('public API', () => {
  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('health', () => {
    it('answers without a token', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      const payload = response.json() as { status: string; models: number; providers: number };
      expect(payload.status).toBe('ok');
      expect(payload.providers).toBe(1);
      expect(payload.models).toBe(1);
    });

    it('exposes no secret material', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({ method: 'GET', url: '/health' });
      expect(response.payload).not.toContain(GATEWAY_TOKEN);
      expect(response.payload).not.toContain('key-for-p1-secret');
    });
  });

  describe('models', () => {
    it('rejects a request with no token', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({ method: 'GET', url: '/v1/models' });

      expect(response.statusCode).toBe(401);
      const payload = response.json() as { error: { type: string } };
      expect(payload.error.type).toBe('authentication_error');
    });

    it('rejects a wrong token', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: { authorization: 'Bearer wrong-token-value' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('lists allowlisted free models', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: authHeaders,
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json() as { object: string; data: Array<{ id: string; free: boolean }> };
      expect(payload.object).toBe('list');
      expect(payload.data.map((m) => m.id)).toEqual(['model-a']);
      expect(payload.data[0]?.free).toBe(true);
    });

    it('never lists a model that is not marked free', async () => {
      const { ctx } = await buildConfiguredApp([
        provider({
          id: 'p1',
          models: [
            { id: 'model-a', free: true, verified: true },
            { id: 'paid-model', free: false, verified: false },
          ],
        }),
      ]);
      const response = await ctx.app.app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: authHeaders,
      });
      const payload = response.json() as { data: Array<{ id: string }> };
      expect(payload.data.map((m) => m.id)).toEqual(['model-a']);
    });
  });

  describe('chat completions', () => {
    it('rejects a request with no token', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }] },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns a completion', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: authHeaders,
        payload: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }] },
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json() as {
        object: string;
        model: string;
        choices: Array<{ message: { content: string } }>;
      };
      expect(payload.object).toBe('chat.completion');
      expect(payload.model).toBe('model-a');
      expect(payload.choices[0]?.message.content).toBe('hello');
      expect(fetchCalls).toHaveLength(1);
    });

    it('rejects an unknown model with 404', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: authHeaders,
        payload: { model: 'not-a-real-model', messages: [{ role: 'user', content: 'hi' }] },
      });

      expect(response.statusCode).toBe(404);
      const payload = response.json() as { error: { code: string } };
      expect(payload.error.code).toBe('no_candidate');
      expect(fetchCalls).toHaveLength(0);
    });

    it('rejects a body with no messages', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: authHeaders,
        payload: { model: 'model-a', messages: [] },
      });

      expect(response.statusCode).toBe(400);
      const payload = response.json() as { error: { type: string; code: string } };
      expect(payload.error.type).toBe('invalid_request_error');
      expect(payload.error.code).toBe('invalid_request');
    });

    it('normalises an upstream failure into an OpenAI-shaped error', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      stubFetch([new Response('upstream exploded', { status: 500 })]);

      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: authHeaders,
        payload: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }] },
      });

      expect(response.statusCode).toBe(502);
      const payload = response.json() as { error: { type: string; code: string; attempts?: unknown[] } };
      expect(payload.error.type).toBe('api_error');
      expect(payload.error.code).toBe('all_attempts_failed');
      expect(payload.error.attempts).toHaveLength(1);
    });

    it('fails over to a second provider', async () => {
      const { ctx } = await buildConfiguredApp([
        provider({ id: 'first', priority: 10 }),
        provider({ id: 'second', priority: 20 }),
      ]);
      stubFetch([
        new Response('boom', { status: 500 }),
        new Response(completionBody('from-second'), { status: 200 }),
      ]);

      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: authHeaders,
        payload: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }] },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { choices: Array<{ message: { content: string } }> }).choices[0]?.message.content).toBe(
        'from-second',
      );
      expect(fetchCalls).toHaveLength(2);
    });
  });

  describe('streaming', () => {
    it('streams SSE frames and terminates with [DONE]', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      stubFetch([
        new Response(
          'data: {"id":"1","choices":[{"delta":{"content":"Hi"},"index":0,"finish_reason":null}]}\n\n' +
            'data: [DONE]\n\n',
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
      ]);

      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: authHeaders,
        payload: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }], stream: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.payload).toContain('data:');
      expect(response.payload).toContain('data: [DONE]');
      expect(fetchCalls[0]?.headers.accept).toBe('text/event-stream');
    });

    it('rejects a streaming request with no token', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: { model: 'model-a', messages: [{ role: 'user', content: 'hi' }], stream: true },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('local-only guard', () => {
    it('rejects a request whose Host header is not loopback', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'GET',
        url: '/health',
        headers: { host: 'attacker.example.com' },
      });

      expect(response.statusCode).toBe(421);
      const payload = response.json() as { error: { type: string } };
      expect(payload.error.type).toBe('misdirected_request');
    });

    it('accepts a loopback Host header', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'GET',
        url: '/health',
        headers: { host: '127.0.0.1:8787' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('returns 404 for an unknown /v1 route', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({ method: 'GET', url: '/v1/nope' });
      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: { code: string } }).error.code).toBe('unknown_route');
    });
  });

  describe('admin routes', () => {
    it('rejects an unauthenticated status request', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({ method: 'GET', url: '/admin/status' });
      expect(response.statusCode).toBe(401);
    });

    it('accepts the admin token', async () => {
      const { ctx } = await buildConfiguredApp([provider({ id: 'p1' })]);
      const response = await ctx.app.app.inject({
        method: 'GET',
        url: '/admin/status',
        headers: adminHeaders,
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
