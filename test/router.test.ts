/**
 * Router tests.
 *
 * The router decides which provider serves a request. The two properties
 * that matter most are enforced here:
 *  - A model that is not marked free is never contacted.
 *  - The number of upstream attempts is bounded.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router, RoutingError } from '../src/providers/router.js';
import { HealthTracker } from '../src/providers/health.js';
import { SecretStore } from '../src/security/secret-store.js';
import { parseConfig } from '../src/config/schema.js';
import type { GatewayConfig, ProviderConfig, ProviderKeyConfig } from '../src/config/schema.js';
import type { ChatCompletionRequest } from '../src/providers/types.js';
import { FakeDpapiDriver, useTempStateDir } from './helpers.js';

/** A provider key with every defaulted field filled in. */
function key(id: string, secretId: string, enabled = true): ProviderKeyConfig {
  return { id, secretId, enabled, priority: 100, failureThreshold: 3, cooldownMs: 60_000 };
}

/** A provider that offers `model-a` and `model-b` for free. */
function provider(overrides: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  const id = overrides.id;
  return {
    kind: 'groq',
    label: id,
    enabled: true,
    anonymous: false,
    priority: 100,
    baseUrl: `https://${id}.example.test/v1`,
    models: [
      { id: 'model-a', free: true, verified: true, contextWindow: 8_000 },
      { id: 'model-b', free: true, verified: true, contextWindow: 8_000 },
    ],
    keys: [key('key-1', `${id}-secret`)],
    ...overrides,
  };
}

/** Build a configuration from a provider list. */
function configWith(providers: ProviderConfig[], routing: Record<string, unknown> = {}): GatewayConfig {
  return parseConfig({
    version: 1,
    routing: { defaultModel: 'model-a', maxAttempts: 3, ...routing },
    providers,
  });
}

/** A single-turn chat request with the expected static type. */
function chatRequest(model: string, extra: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return { model, messages: [{ role: 'user', content: 'hi' }], ...extra };
}

/** A successful OpenAI-shaped chat completion. */
function completionBody(model = 'model-a'): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
  });
}

/** Records every upstream request so tests can assert on routing. */
interface FetchLog {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly authorization: string | undefined;
  readonly body: Record<string, unknown>;
}

let fetchLog: FetchLog[] = [];

/** Install a fetch stub that replays a queue of responses. */
function stubFetch(responses: Array<Response | (() => Response | Promise<Response>)>): void {
  fetchLog = [];
  let index = 0;
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const headers = (init?.headers ?? {}) as Record<string, string>;
    fetchLog.push({ url: String(url), headers, authorization: headers.authorization, body });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next === undefined) throw new Error('no stubbed response');
    return typeof next === 'function' ? next() : next;
  });
}

/** Build a router over a fake secret store. */
async function makeRouter(
  config: GatewayConfig,
  health = new HealthTracker(),
): Promise<{ router: Router; secrets: SecretStore }> {
  const driver = new FakeDpapiDriver();
  const secrets = new SecretStore(driver);
  await secrets.load();
  for (const providerConfig of config.providers) {
    for (const providerKey of providerConfig.keys) {
      await secrets.set(providerKey.secretId, 'provider-key', `key-for-${providerKey.secretId}`);
    }
  }
  const router = new Router({ config, secrets, health });
  return { router, secrets };
}

const callOptions = { signal: new AbortController().signal, timeoutMs: 5_000 };

describe('Router', () => {
  beforeEach(async () => {
    await useTempStateDir();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('candidate selection', () => {
    it('lists only free models from enabled providers with keys', async () => {
      const config = configWith([
        provider({ id: 'p1' }),
        provider({ id: 'p2', enabled: false }),
        provider({ id: 'p3', models: [{ id: 'paid-model', free: false, verified: false }] }),
      ]);
      const { router } = await makeRouter(config);

      const models = router.availableModels();
      expect(models.map((m) => m.model.id)).toEqual(['model-a', 'model-b']);
      expect(models.every((m) => m.providerId === 'p1')).toBe(true);
    });

    it('never selects a model that is not marked free', async () => {
      const config = configWith([
        provider({ id: 'p1', models: [{ id: 'model-a', free: false, verified: false }] }),
      ]);
      const { router } = await makeRouter(config);

      expect(await router.candidates('model-a')).toHaveLength(0);
      expect(router.availableModels()).toHaveLength(0);
      await expect(router.complete(chatRequest('model-a'), callOptions)).rejects.toMatchObject({
        code: 'no_candidate',
        statusCode: 404,
      });
    });

    it('yields no candidates for a model that is not allowlisted', async () => {
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config);
      expect(await router.candidates('not-allowlisted')).toEqual([]);
    });

    it('rejects a request for a model that is not allowlisted', async () => {
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config);

      await expect(router.complete(chatRequest('not-allowlisted'), callOptions)).rejects.toBeInstanceOf(
        RoutingError,
      );
      await expect(router.complete(chatRequest('not-allowlisted'), callOptions)).rejects.toMatchObject({
        code: 'no_candidate',
        statusCode: 404,
      });
    });

    it('skips a provider whose key is disabled', async () => {
      const config = configWith([
        provider({ id: 'p1', keys: [key('key-1', 'p1-secret', false)] }),
      ]);
      const { router } = await makeRouter(config);
      expect(await router.candidates('model-a')).toHaveLength(0);
    });

    it('matches model names case-insensitively and treats _ as -', async () => {
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config);
      expect(await router.candidates('MODEL_A')).toHaveLength(1);
    });

    it('prefers the provider with the lower priority number', async () => {
      const config = configWith([
        provider({ id: 'low', priority: 10 }),
        provider({ id: 'high', priority: 90 }),
      ]);
      const { router } = await makeRouter(config);
      const candidates = await router.candidates('model-a');
      expect(candidates[0]?.provider.id).toBe('low');
    });

    it('falls back to the configured default model', async () => {
      const config = configWith([provider({ id: 'p1' })], { defaultModel: 'model-b' });
      const { router } = await makeRouter(config);
      const candidates = await router.candidates('');
      expect(candidates[0]?.model.id).toBe('model-b');
    });
  });

  describe('failover', () => {
    it('tries the next provider when the first one fails', async () => {
      const config = configWith([
        provider({ id: 'first', priority: 10 }),
        provider({ id: 'second', priority: 20 }),
      ]);
      const { router } = await makeRouter(config);
      stubFetch([
        new Response('upstream exploded', { status: 500 }),
        new Response(completionBody(), { status: 200 }),
      ]);

      const { candidate, result } = await router.complete(chatRequest('model-a'), callOptions);

      expect(candidate.provider.id).toBe('second');
      expect(result.body.choices[0]?.message.content).toBe('hello');
      expect(fetchLog).toHaveLength(2);
    });

    it('does not retry a rejected credential, even under another key', async () => {
      const config = configWith([
        provider({
          id: 'p1',
          priority: 10,
          keys: [key('key-1', 'shared-secret'), key('key-2', 'shared-secret')],
        }),
        provider({ id: 'p2', priority: 20 }),
      ]);
      const { router } = await makeRouter(config);
      stubFetch([
        new Response(JSON.stringify({ error: { message: 'Invalid key' } }), { status: 401 }),
        new Response(completionBody(), { status: 200 }),
      ]);

      const { candidate } = await router.complete(chatRequest('model-a'), callOptions);

      // key-1 and key-2 share one credential, so the second is skipped and
      // the other provider serves the request.
      expect(candidate.provider.id).toBe('p2');
      expect(fetchLog).toHaveLength(2);
      expect(fetchLog.filter((entry) => entry.url.includes('p1.example.test'))).toHaveLength(1);
    });

    it('bounds the number of upstream attempts', async () => {
      const config = configWith(
        [
          provider({ id: 'p1', priority: 10 }),
          provider({ id: 'p2', priority: 20 }),
          provider({ id: 'p3', priority: 30 }),
        ],
        { maxAttempts: 1 },
      );
      const { router } = await makeRouter(config);
      stubFetch([new Response('boom', { status: 500 })]);

      await expect(router.complete(chatRequest('model-a'), callOptions)).rejects.toMatchObject({
        code: 'all_attempts_failed',
        statusCode: 502,
      });

      expect(fetchLog).toHaveLength(1);
    });

    it('reports each failed attempt in the error', async () => {
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response('boom', { status: 500 })]);

      try {
        await router.complete(chatRequest('model-a'), callOptions);
        throw new Error('expected the router to reject');
      } catch (error) {
        const routingError = error as RoutingError;
        expect(routingError.attempts).toHaveLength(1);
        expect(routingError.attempts[0]?.providerId).toBe('p1');
      }
    });
  });

  describe('health and cooldown', () => {
    it('skips a key that is in cooldown', async () => {
      const health = new HealthTracker({
        failureThreshold: 1,
        cooldownMs: 60_000,
        breakerThreshold: 5,
        breakerOpenMs: 30_000,
      });
      const config = configWith([
        provider({ id: 'p1', priority: 10 }),
        provider({ id: 'p2', priority: 20 }),
      ]);
      const { router } = await makeRouter(config, health);
      health.recordFailure('p1', 'key-1', { message: 'boom' });

      const candidates = await router.candidates('model-a');
      expect(candidates.map((c) => c.provider.id)).toEqual(['p2']);
    });

    it('puts a key with repeated failures into cooldown', async () => {
      const health = new HealthTracker({
        failureThreshold: 2,
        cooldownMs: 60_000,
        breakerThreshold: 10,
        breakerOpenMs: 30_000,
      });
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config, health);
      stubFetch([new Response('boom', { status: 500 })]);

      await expect(router.complete(chatRequest('model-a'), callOptions)).rejects.toBeTruthy();
      await expect(router.complete(chatRequest('model-a'), callOptions)).rejects.toBeTruthy();

      expect(health.state('p1', 'key-1').cooldownUntil).toBeGreaterThan(Date.now());
    });

    it('opens the circuit breaker after sustained failures', async () => {
      const health = new HealthTracker({
        failureThreshold: 10,
        cooldownMs: 1_000,
        breakerThreshold: 2,
        breakerOpenMs: 30_000,
      });
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config, health);
      stubFetch([new Response('boom', { status: 500 })]);

      await expect(router.complete(chatRequest('model-a'), callOptions)).rejects.toBeTruthy();
      await expect(router.complete(chatRequest('model-a'), callOptions)).rejects.toBeTruthy();

      expect(health.state('p1', 'key-1').breakerOpenUntil).toBeGreaterThan(Date.now());
    });

    it('recovers a key after a success', async () => {
      const health = new HealthTracker({
        failureThreshold: 1,
        cooldownMs: 60_000,
        breakerThreshold: 5,
        breakerOpenMs: 30_000,
      });
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config, health);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(chatRequest('model-a'), callOptions);
      const state = health.state('p1', 'key-1');
      expect(state.successes).toBe(1);
      expect(state.consecutiveFailures).toBe(0);
    });
  });

  describe('upstream request shaping', () => {
    it('sends the bearer token and the model id', async () => {
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(chatRequest('model-a'), callOptions);

      const entry = fetchLog[0];
      expect(entry?.url).toBe('https://p1.example.test/v1/chat/completions');
      expect(entry?.authorization).toBe('Bearer key-for-p1-secret');
      expect(entry?.body.model).toBe('model-a');
      expect(entry?.body.stream).toBe(false);
    });

    it('omits the Authorization header for an anonymous provider', async () => {
      const config = configWith([provider({ id: 'p1', kind: 'opencode', anonymous: true })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(chatRequest('model-a'), callOptions);
      expect(fetchLog[0]?.authorization).toBeUndefined();
    });

    it('drops n for Groq, which rejects values above 1', async () => {
      const config = configWith([provider({ id: 'p1', kind: 'groq' })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(chatRequest('model-a', { n: 3 }), callOptions);
      expect(fetchLog[0]?.body.n).toBeUndefined();
    });

    it('drops penalties for SambaNova, which ignores them', async () => {
      const config = configWith([provider({ id: 'p1', kind: 'sambanova' })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(
        chatRequest('model-a', { presence_penalty: 0.5, frequency_penalty: 0.5 }),
        callOptions,
      );
      expect(fetchLog[0]?.body.presence_penalty).toBeUndefined();
      expect(fetchLog[0]?.body.frequency_penalty).toBeUndefined();
    });

    it('sends the OpenRouter attribution headers', async () => {
      const config = configWith([provider({ id: 'p1', kind: 'openrouter' })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(chatRequest('model-a'), callOptions);
      expect(fetchLog[0]?.headers['HTTP-Referer']).toBe('http://localhost:8787');
      expect(fetchLog[0]?.headers['X-Title']).toBe('Local AI Gateway');
    });

    it('does not send attribution headers for other providers', async () => {
      const config = configWith([provider({ id: 'p1', kind: 'groq' })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(chatRequest('model-a'), callOptions);
      expect(fetchLog[0]?.headers['HTTP-Referer']).toBeUndefined();
    });

    it('pins paid fallback off for BazaarLink', async () => {
      const config = configWith([provider({ id: 'p1', kind: 'bazaarlink' })]);
      const { router } = await makeRouter(config);
      stubFetch([new Response(completionBody(), { status: 200 })]);

      await router.complete(chatRequest('model-a'), callOptions);
      expect(fetchLog[0]?.headers['X-Free-Fallback']).toBe('false');
    });

    it('routes embeds, images and responses to their own upstream paths', async () => {
      const config = configWith([provider({ id: 'p1' })]);
      const { router } = await makeRouter(config);
      stubFetch([
        new Response(
          JSON.stringify({
            object: 'list',
            data: [{ embedding: [0.1], index: 0 }],
            usage: { prompt_tokens: 1 },
            model: 'model-a',
          }),
          { status: 200 },
        ),
        new Response(
          JSON.stringify({ created: 1, data: [{ url: 'https://img.example.test/a.png' }] }),
          { status: 200 },
        ),
        new Response(JSON.stringify({ id: 'resp_1', object: 'response', output: [] }), {
          status: 200,
        }),
      ]);

      await router.embed({ model: 'model-a', input: 'hello' }, callOptions);
      await router.imageGenerate({ model: 'model-a', prompt: 'a cat' }, callOptions);
      await router.responseCreate(
        { model: 'model-a', instructions: 'be brief', input: 'hi' },
        callOptions,
      );

      expect(fetchLog.map((entry) => entry.url)).toEqual([
        'https://p1.example.test/v1/embeddings',
        'https://p1.example.test/v1/images/generations',
        'https://p1.example.test/v1/responses',
      ]);
    });
  });

  describe('streaming', () => {
    it('selects a provider before the first frame is written', async () => {
      const config = configWith([
        provider({ id: 'first', priority: 10 }),
        provider({ id: 'second', priority: 20 }),
      ]);
      const { router } = await makeRouter(config);
      stubFetch([
        new Response('data: {"id":"1"}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ]);

      const { candidate, result } = await router.stream(
        chatRequest('model-a', { stream: true }),
        callOptions,
      );

      expect(candidate.provider.id).toBe('first');
      expect(fetchLog[0]?.body.stream).toBe(true);

      const chunks: string[] = [];
      for await (const chunk of result.body) {
        chunks.push(String(chunk));
      }
      expect(chunks.join('')).toContain('data:');
    });

    it('fails over to another provider when the first stream fails', async () => {
      const config = configWith([
        provider({ id: 'first', priority: 10 }),
        provider({ id: 'second', priority: 20 }),
      ]);
      const { router } = await makeRouter(config);
      stubFetch([
        new Response('nope', { status: 500 }),
        new Response('data: {"id":"1"}\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ]);

      const { candidate } = await router.stream(
        chatRequest('model-a', { stream: true }),
        callOptions,
      );
      expect(candidate.provider.id).toBe('second');
    });
  });
});
