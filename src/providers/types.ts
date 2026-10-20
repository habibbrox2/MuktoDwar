/**
 * Provider adapter types.
 *
 * Every provider the gateway supports exposes an OpenAI-compatible
 * Chat Completions API, so the adapter surface is deliberately small. The
 * differences between providers (headers, path quirks, parameter support)
 * are captured by {@link ProviderAdapter} rather than by branching in the
 * router.
 */

import type { Readable } from 'node:stream';

/** A chat message in OpenAI wire format. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer';
  content: string | Array<Record<string, unknown>> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<Record<string, unknown>>;
}

/** The request body accepted by `/v1/chat/completions`. */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  n?: number;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: unknown;
  response_format?: Record<string, unknown>;
  user?: string;
}

/** A non-streaming chat completion. */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string | null };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** A single streamed chunk. */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Record<string, unknown>;
    finish_reason: string | null;
  }>;
}

/** Normalised upstream failure. */
export class ProviderError extends Error {
  /** HTTP status returned by the provider, when there was one. */
  readonly statusCode: number | undefined;
  /** Provider-specific error code, when there was one. */
  readonly code: string | undefined;
  /** True when retrying the same provider could plausibly succeed. */
  readonly retryable: boolean;
  /** True when the failure is an authentication problem. */
  readonly authFailure: boolean;
  /** True when the provider reported a rate limit. */
  readonly rateLimited: boolean;
  /** Seconds the provider asked us to wait, when it said so. */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    message: string,
    options: {
      statusCode?: number | undefined;
      code?: string | undefined;
      retryable?: boolean | undefined;
      authFailure?: boolean | undefined;
      rateLimited?: boolean | undefined;
      retryAfterSeconds?: number | undefined;
    } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.authFailure = options.authFailure ?? false;
    this.rateLimited = options.rateLimited ?? false;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** The result of a non-streaming provider call. */
export interface ProviderCompletionResult {
  readonly body: ChatCompletionResponse;
  readonly latencyMs: number;
}

/** A live stream of provider chunks. */
export interface ProviderStreamResult {
  readonly body: Readable;
  readonly latencyMs: number;
  /** Releases upstream resources when the client disconnects. */
  readonly dispose: () => void;
}

/** Per-call options. */
export interface ProviderCallOptions {
  /** Aborts the upstream request when the client goes away. */
  readonly signal: AbortSignal;
  /** Overall time budget for this call, in milliseconds. */
  readonly timeoutMs: number;
}

/**
 * The adapter contract.
 *
 * An adapter is bound to one provider and one API key. The router creates
 * adapters per candidate and discards them afterwards, so an adapter may
 * cache nothing.
 */
export interface ProviderAdapter {
  /** Provider kind this adapter serves. */
  readonly kind: string;
  /** Provider instance id from the configuration. */
  readonly providerId: string;
  /** Key id this adapter uses. */
  readonly keyId: string;
  /** Model id this adapter will request upstream. */
  readonly model: string;
  /** Perform a non-streaming completion. */
  complete(
    request: ChatCompletionRequest,
    options: ProviderCallOptions,
  ): Promise<ProviderCompletionResult>;
  /** Perform a streaming completion. */
  stream(
    request: ChatCompletionRequest,
    options: ProviderCallOptions,
  ): Promise<ProviderStreamResult>;
  /** Create an embedding vector. */
  embed(
    request: { model?: string; input: string },
    options: ProviderCallOptions,
  ): Promise<{ result: { object: string; data: Array<{ embedding: number[]; index: number }>; usage: { prompt_tokens: number; completion_tokens?: number; }; model: string; }; latencyMs: number }>;
  /** Generate an image. */
  imageGenerate(
    request: { prompt: string; size?: string; model?: string },
    options: ProviderCallOptions,
  ): Promise<{ result: { url: string; b64_json?: string; revised_prompt?: string; }; latencyMs: number }>;
  /** Create a response using the Responses API. */
  responseCreate(
    request: {
      model: string;
      instructions: string;
      input: string;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    },
    options: ProviderCallOptions,
  ): Promise<any>;
}
