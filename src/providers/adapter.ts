/**
 * OpenAI-compatible provider adapter.
 *
 * Every provider the gateway supports exposes the OpenAI Chat Completions
 * API, so one adapter serves them all. The differences between providers are
 * expressed as data (base URL, headers, path) rather than as separate
 * classes, with a few behavioural switches for the documented incompatibilities.
 */

import { Readable } from 'node:stream';
import type { ProviderStreamResult } from './types.js';
import { ProviderError } from './types.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProviderAdapter,
  ProviderCallOptions,
  ProviderCompletionResult,
} from './types.js';

/** Behavioural switches for the documented provider incompatibilities. */
export interface AdapterProfile {
  /** Base URL ending in a slash, e.g. `https://api.groq.com/openai/v1/`. */
  readonly baseUrl: string;
  /** Send the key as a bearer token. When false, no auth header is sent. */
  readonly useBearer: boolean;
  /** Extra headers, e.g. OpenRouter's attribution headers. */
  readonly extraHeaders?: Readonly<Record<string, string>>;
  /** Groq rejects `n` above 1 and several sampling parameters. */
  readonly supportsSamplingExtras: boolean;
  /** SambaNova ignores presence/frequency penalties. */
  readonly supportsPenalties: boolean;
  /** Maximum time to wait for upstream response headers. */
  readonly connectTimeoutMs: number;
  /** Default model when request does not specify one. */
  readonly defaultModel?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Hard cap on a single upstream error body we will read. */
const MAX_ERROR_BODY_BYTES = 8 * 1024;

/** Build the request body for an upstream chat completion. */
function buildUpstreamBody(
  request: ChatCompletionRequest,
  profile: AdapterProfile,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    stream: request.stream ?? false,
  };

  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.top_p !== undefined) body.top_p = request.top_p;
  if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
  if (request.max_completion_tokens !== undefined) {
    body.max_completion_tokens = request.max_completion_tokens;
  }
  if (request.stop !== undefined) body.stop = request.stop;
  if (request.seed !== undefined) body.seed = request.seed;
  if (request.tools !== undefined) body.tools = request.tools;
  if (request.tool_choice !== undefined) body.tool_choice = request.tool_choice;
  if (request.response_format !== undefined) body.response_format = request.response_format;
  if (request.user !== undefined) body.user = request.user;

  if (request.n !== undefined && request.n > 1 && profile.supportsSamplingExtras) {
    body.n = request.n;
  }
  if (request.presence_penalty !== undefined && profile.supportsPenalties) {
    body.presence_penalty = request.presence_penalty;
  }
  if (request.frequency_penalty !== undefined && profile.supportsPenalties) {
    body.frequency_penalty = request.frequency_penalty;
  }
  return body;
}

/** Build the request body for an upstream embedding. */
function buildEmbedBody(
  request: { model?: string; input: string },
  profile: AdapterProfile,
): Record<string, unknown> {
  const model = request.model ?? profile.defaultModel;
  const body: Record<string, unknown> = {
    model: model ?? 'unknown',
    input: request.input,
  };
  return body;
}

/** Build the request body for an upstream image generation. */
function buildImageBody(
  request: { prompt: string; size?: string; model?: string },
  profile: AdapterProfile,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model ?? profile.defaultModel,
    prompt: request.prompt,
    size: request.size,
  };
  return body;
}

/** Build the request body for an upstream Responses API call. */
function buildResponsesBody(
  request: {
    model: string;
    instructions: string;
    input: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    instructions: request.instructions,
    input: request.input,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
    // The gateway's Responses route is non-streaming: always ask the
    // provider for a complete JSON body so it can be parsed and returned.
    stream: false,
  };
  return body;
}

/** Extract a useful message from an upstream error body. */
function describeUpstreamError(status: number, bodyText: string): { message: string; code?: string | undefined } {
  let code: string | undefined;
  let message = bodyText.slice(0, 500);
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const errorNode = record.error;
      if (errorNode && typeof errorNode === 'object') {
        const errorRecord = errorNode as Record<string, unknown>;
        if (typeof errorRecord.message === 'string') message = errorRecord.message;
        if (typeof errorRecord.code === 'string') code = errorRecord.code;
        if (typeof errorRecord.type === 'string' && code === undefined) code = errorRecord.type;
      } else if (typeof errorNode === 'string') {
        message = errorNode;
      } else if (typeof record.message === 'string') {
        message = record.message;
      }
      if (typeof record.detail === 'string' && message === bodyText) message = record.detail;
    }
  } catch {
    // Body is not JSON; keep the raw text.
  }
  return { message: message || `Upstream returned HTTP ${status}.`, code: code ?? undefined };
}

/** Classify an HTTP status into a {@link ProviderError}. */
function toProviderError(status: number, bodyText: string, retryAfter: string | null): ProviderError {
  const { message, code } = describeUpstreamError(status, bodyText);
  const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : undefined;

  if (status === 401 || status === 403) {
    return new ProviderError(`The provider rejected the API key: ${message}`, {
      statusCode: status,
      code,
      authFailure: true,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ProviderError(`The provider rate limited this request: ${message}`, {
      statusCode: status,
      code,
      rateLimited: true,
      retryable: true,
      ...(retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)
        ? { retryAfterSeconds }
        : {}),
    });
  }
  if (status === 404) {
    return new ProviderError(`The provider does not expose this model: ${message}`, {
      statusCode: status,
      code,
      retryable: false,
    });
  }
  if (status >= 500) {
    return new ProviderError(`The provider failed with HTTP ${status}: ${message}`, {
      statusCode: status,
      code,
      retryable: true,
    });
  }
  if (status === 400) {
    return new ProviderError(`The provider rejected the request: ${message}`, {
      statusCode: status,
      code,
      retryable: false,
    });
  }
  return new ProviderError(`The provider returned HTTP ${status}: ${message}`, {
    statusCode: status,
    code,
    retryable: false,
  });
}

/** A provider adapter bound to one provider, key and model. */
export class OpenAiCompatibleAdapter implements ProviderAdapter {
  readonly kind: string;
  readonly providerId: string;
  readonly keyId: string;
  readonly model: string;
  private readonly profile: AdapterProfile;
  private readonly apiKey: string | undefined;

  constructor(options: {
    kind: string;
    providerId: string;
    keyId: string;
    model: string;
    profile: AdapterProfile;
    apiKey: string | undefined;
  }) {
    this.kind = options.kind;
    this.providerId = options.providerId;
    this.keyId = options.keyId;
    this.model = options.model;
    this.profile = options.profile;
    this.apiKey = options.apiKey;
  }

  async complete(
    request: ChatCompletionRequest,
    options: ProviderCallOptions,
  ): Promise<ProviderCompletionResult> {
    const startedAt = Date.now();
    const body = buildUpstreamBody({ ...request, stream: false }, this.profile);
    const response = await this.send(body, options, false);

    const text = await response.text();
    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(text) as ChatCompletionResponse;
    } catch {
      throw new ProviderError('The provider returned a response that was not valid JSON.', {
        statusCode: response.status,
        retryable: false,
      });
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.choices)) {
      throw new ProviderError('The provider returned a response without choices.', {
        statusCode: response.status,
        retryable: false,
      });
    }
    return { body: parsed, latencyMs: Date.now() - startedAt };
  }

  async embed(
    request: { model?: string; input: string },
    options: ProviderCallOptions,
  ): Promise<{ result: { object: string; data: Array<{ embedding: number[]; index: number }>; usage: { prompt_tokens: number; completion_tokens?: number }; model: string }; latencyMs: number }> {
    const startedAt = Date.now();
    const body = buildEmbedBody(request, this.profile);
    const response = await this.send(body, options, false, 'embeddings');

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError('The provider returned a response that was not valid JSON.', {
        statusCode: response.status,
        retryable: false,
      });
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.data)) {
      throw new ProviderError('The provider returned an embedding response without data.', {
        statusCode: response.status,
        retryable: false,
      });
    }
    return {
      result: {
        object: parsed.object ?? 'embedding',
        data: parsed.data.map((item: { embedding: number[]; index: number }) => ({
          embedding: item.embedding,
          index: item.index,
        })),
        usage: parsed.usage ?? { prompt_tokens: Math.round(text.length / 4), completion_tokens: undefined },
        model: parsed.model ?? this.model,
      },
      latencyMs: Date.now() - startedAt,
    };
  }

  async imageGenerate(
    request: { prompt: string; size?: string; model?: string },
    options: ProviderCallOptions,
  ): Promise<{ result: { url: string; b64_json?: string; revised_prompt?: string }; latencyMs: number }> {
    const startedAt = Date.now();
    const body = buildImageBody(request, this.profile);
    const response = await this.send(body, options, false, 'images/generations');

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError('The provider returned a response that was not valid JSON.', {
        statusCode: response.status,
        retryable: false,
      });
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new ProviderError('The provider returned an image response without a valid object.', {
        statusCode: response.status,
        retryable: false,
      });
    }
    return {
      result: {
        url: parsed.url ?? parsed.created ?? '',
        b64_json: parsed.b64_json ?? parsed.b64json,
        revised_prompt: parsed.revised_prompt ?? parsed.revisedPrompt,
      },
      latencyMs: Date.now() - startedAt,
    };
  }

  async responseCreate(
    request: {
      model: string;
      instructions: string;
      input: string;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    },
    options: ProviderCallOptions,
  ): Promise<any> {
    const body = buildResponsesBody(request);
    const response = await this.send(body, options, false, 'responses');

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError('The provider returned a response that was not valid JSON.', {
        statusCode: response.status,
        retryable: false,
      });
    }
    return parsed;
  }

  /** Perform a streaming completion. */
  async stream(
    request: ChatCompletionRequest,
    options: ProviderCallOptions,
  ): Promise<ProviderStreamResult> {
    const startedAt = Date.now();
    const body = buildUpstreamBody({ ...request, stream: true }, this.profile);
    const response = await this.send(body, options, true);

    if (!response.body) {
      throw new ProviderError('The provider returned a streaming response with no body.', {
        statusCode: response.status,
        retryable: false,
      });
    }

    // `fetch` gives a web ReadableStream; convert it to a Node Readable so
    // consumers (Fastify, tests) see Buffers with normal stream semantics.
    const nodeStream = Readable.fromWeb(
      response.body as unknown as import('node:stream/web').ReadableStream,
    );
    return {
      body: nodeStream,
      latencyMs: Date.now() - startedAt,
      dispose: () => {
        nodeStream.destroy();
      },
    };
  }

  /** Issue the upstream request with timeout and error handling. */
  private async send(
    body: Record<string, unknown>,
    options: ProviderCallOptions,
    streaming: boolean,
    path = 'chat/completions',
  ): Promise<Response> {
    const url = `${this.profile.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: streaming ? 'text/event-stream' : 'application/json',
      ...(this.profile.extraHeaders ?? {}),
    };
    if (this.profile.useBearer && this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }

    // The overall budget and the caller's abort signal are combined, so a
    // client disconnect and a timeout both cancel the upstream request.
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = AbortSignal.any([options.signal, timeoutSignal]);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (options.signal.aborted) {
        // The client went away. This is not a provider fault.
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown error';
      const timedOut = timeoutSignal.aborted;
      throw new ProviderError(
        timedOut
          ? `The provider did not respond within ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`
          : `The provider request failed: ${message}`,
        { retryable: true, code: timedOut ? 'upstream_timeout' : 'upstream_unreachable' },
      );
    }

    if (!response.ok) {
      const bodyText = await readBounded(response);
      throw toProviderError(response.status, bodyText, response.headers.get('retry-after'));
    }

    return response;
  }
}

/** Read at most {@link MAX_ERROR_BODY_BYTES} of an error response. */
async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length >= MAX_ERROR_BODY_BYTES) break;
    }
  } catch {
    // Ignore read errors; the status code is the useful signal.
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
  }
  return text.slice(0, MAX_ERROR_BODY_BYTES);
}
