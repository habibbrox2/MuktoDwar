/**
 * Hybrid router.
 *
 * The router picks a provider for a request. It combines four signals:
 *  - Administrator priority: an explicit, ordered preference.
 *  - Measured latency: an EWMA of real response times.
 *  - Health: the success ratio and recent failure streak of a key.
 *  - Availability: cooldown and circuit-breaker state.
 *
 * Two rules constrain everything the router does:
 *  1. Only models the administrator allowlisted *and* marked free are ever
 *     candidates. There is no code path that selects a non-free model.
 *  2. The number of attempts is bounded. A request tries at most
 *     `maxAttempts` candidates and then fails.
 */

import type { GatewayConfig, ModelEntry, ProviderConfig } from '../config/schema.js';
import { HealthTracker } from './health.js';
import { OpenAiCompatibleAdapter } from './adapter.js';
import type { AdapterProfile } from './adapter.js';
import { catalogFor } from './catalog.js';
import { ProviderError } from './types.js';
import type {
  ChatCompletionRequest,
  ProviderAdapter,
  ProviderCallOptions,
  ProviderCompletionResult,
  ProviderStreamResult,
} from './types.js';
import { SecretStore } from '../security/secret-store.js';

/** One candidate route: a provider, a model and a key. */
export interface RouteCandidate {
  readonly provider: ProviderConfig;
  readonly model: ModelEntry;
  readonly keyId: string;
  readonly secretId: string;
  /** The score the router computed. Higher is better. */
  readonly score: number;
  /** True when this candidate is a circuit-breaker probe. */
  readonly probe: boolean;
}

/** Why a request could not be served. */
export class RoutingError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly attempts: Array<{ providerId: string; model: string; keyId: string; reason: string }>;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    attempts: Array<{ providerId: string; model: string; keyId: string; reason: string }> = [],
  ) {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
    this.statusCode = statusCode;
    this.attempts = attempts;
  }
}

/** Dependencies of the router. */
export interface RouterDependencies {
  readonly config: GatewayConfig;
  readonly secrets: SecretStore;
  readonly health: HealthTracker;
}

/**
 * Build the adapter profile for a provider, applying the documented
 * incompatibilities of that provider.
 */
function profileFor(provider: ProviderConfig): AdapterProfile {
  const catalog = catalogFor(provider.kind);
  const baseUrl = provider.baseUrl ?? catalog.baseUrl;
  return {
    baseUrl: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    useBearer: !provider.anonymous && catalog.requiresKey,
    supportsSamplingExtras: provider.kind !== 'groq',
    supportsPenalties: provider.kind !== 'sambanova',
    connectTimeoutMs: 30_000,
    ...(provider.kind === 'openrouter'
      ? {
          extraHeaders: {
            'HTTP-Referer': 'http://localhost:8787',
            'X-Title': 'Local AI Gateway',
          },
        }
      : {}),
    // BazaarLink can fall back to paid usage when an account holds a
    // balance. Paid fallback is prohibited, so we always pin it off.
    ...(provider.kind === 'bazaarlink' ? { extraHeaders: { 'X-Free-Fallback': 'false' } } : {}),
  };
}

/**
 * Normalise a requested model name.
 *
 * Clients vary in how they spell a model, so comparison is case-insensitive
 * and treats `-` and `_` as equivalent.
 */
function normaliseModel(model: string): string {
  return model.trim().toLowerCase().replace(/_/g, '-');
}

/** The hybrid router. */
export class Router {
  private readonly deps: RouterDependencies;

  constructor(deps: RouterDependencies) {
    this.deps = deps;
  }

  /** The health tracker, exposed for the admin status endpoint. */
  get health(): HealthTracker {
    return this.deps.health;
  }

  /** The configuration the router is working from. */
  get config(): GatewayConfig {
    return this.deps.config;
  }

  /**
   * Every allowlisted, free model the gateway can serve, across all enabled
   * providers that have at least one usable key.
   */
  availableModels(): Array<{ providerId: string; providerLabel: string; model: ModelEntry }> {
    const models: Array<{ providerId: string; providerLabel: string; model: ModelEntry }> = [];
    for (const provider of this.deps.config.providers) {
      if (!provider.enabled) continue;
      if (!this.hasUsableKey(provider)) continue;
      for (const model of provider.models) {
        if (!model.free) continue;
        models.push({ providerId: provider.id, providerLabel: provider.label, model });
      }
    }
    return models;
  }

  /** True when the provider has at least one enabled key. */
  private hasUsableKey(provider: ProviderConfig): boolean {
    return provider.keys.some((key) => key.enabled);
  }

  /**
   * Resolve the model a request should use.
   *
   * An empty model falls back to the configured default. The default must
   * itself be allowlisted and free.
   */
  private resolveRequestedModel(requested: string | undefined): string {
    const candidate = requested?.trim() || this.deps.config.routing.defaultModel.trim();
    if (!candidate) {
      throw new RoutingError(
        'no_model_requested',
        'No model was requested and no default model is configured.',
        400,
      );
    }
    return candidate;
  }

  /**
   * Compute the candidate list for a model, in ranked order.
   *
   * A candidate is only produced when the provider is enabled, the model is
   * allowlisted *and* marked free, and the key is enabled.
   */
  async candidates(requestedModel: string): Promise<RouteCandidate[]> {
    const model = this.resolveRequestedModel(requestedModel);
    const target = normaliseModel(model);
    const results: RouteCandidate[] = [];

    for (const provider of this.deps.config.providers) {
      if (!provider.enabled) continue;

      for (const entry of provider.models) {
        // Free-only enforcement. This is the single choke point that keeps
        // the gateway from ever contacting a paid model.
        if (!entry.free) continue;
        if (normaliseModel(entry.id) !== target) continue;

        for (const key of provider.keys) {
          if (!key.enabled) continue;
          const available = this.deps.health.isAvailable(provider.id, key.id);
          const probe = this.deps.health.isProbeEligible(provider.id, key.id);
          if (!available && !probe) continue;

          results.push({
            provider,
            model: entry,
            keyId: key.id,
            secretId: key.secretId,
            score: this.score(provider, key.id, entry),
            probe,
          });
        }
      }
    }

    results.sort((a, b) => {
      // Probes go last so a healthy candidate is preferred.
      if (a.probe !== b.probe) return a.probe ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      if (a.provider.priority !== b.provider.priority) return a.provider.priority - b.provider.priority;
      if (a.keyId !== b.keyId) return a.keyId < b.keyId ? -1 : 1;
      return 0;
    });

    return results;
  }

  /**
   * Score a candidate.
   *
   * The score is a weighted sum of normalised signals. Higher is better.
   * The weighting comes from the routing configuration.
   */
  private score(provider: ProviderConfig, keyId: string, model: ModelEntry): number {
    const { weights } = this.deps.config.routing;
    const health = this.deps.health;

    // Priority: lower number is better, so invert it.
    const priorityScore = 1 - Math.min(provider.priority, 1000) / 1000;

    // Latency: 0 ms scores 1, 5 s scores 0. Unknown latency is neutral.
    const state = health.state(provider.id, keyId);
    const latencyScore =
      state.latencyMs === null ? 0.5 : Math.max(0, 1 - state.latencyMs / 5000);

    const healthScore = health.healthScore(provider.id, keyId);

    // A model with a larger context window is mildly preferred, because it
    // is more likely to satisfy a long conversation.
    const contextScore = model.contextWindow
      ? Math.min(1, model.contextWindow / 200_000)
      : 0.5;

    return (
      weights.priority * priorityScore +
      weights.latency * latencyScore +
      weights.health * healthScore +
      0.5 * contextScore
    );
  }

  /**
   * Build an adapter for a candidate, resolving the API key.
   *
   * The key is decrypted only when the candidate is actually attempted, so
   * a request that succeeds on its first choice decrypts exactly one key.
   */
  private async adapterFor(candidate: RouteCandidate): Promise<ProviderAdapter> {
    let apiKey: string | undefined;
    try {
      const resolved = await this.deps.secrets.get(candidate.secretId);
      apiKey = resolved === null ? undefined : resolved;
    } catch {
      apiKey = undefined;
    }
    const profile = profileFor(candidate.provider);
    // An anonymous provider needs no key; a provider that requires one but
    // has none must not be called with a blank credential.
    if (profile.useBearer && !apiKey) {
      throw new ProviderError('The provider key is not available.', {
        authFailure: true,
        retryable: false,
      });
    }
    return new OpenAiCompatibleAdapter({
      kind: candidate.provider.kind,
      providerId: candidate.provider.id,
      keyId: candidate.keyId,
      model: candidate.model.id,
      profile,
      apiKey,
    });
  }

  /**
   * Execute a non-streaming request, trying candidates in ranked order.
   *
   * Failover is bounded by `routing.maxAttempts`. A candidate is skipped
   * without being attempted when the previous failure was an authentication
   * error on the same key, because retrying a rejected key is pointless.
   */
  async complete(
    request: ChatCompletionRequest,
    options: ProviderCallOptions,
  ): Promise<{ result: ProviderCompletionResult; candidate: RouteCandidate }> {
    const candidates = await this.candidates(request.model);
    if (candidates.length === 0) {
      throw new RoutingError(
        'no_candidate',
        `No enabled provider offers the free model "${request.model}".`,
        404,
      );
    }

    const maxAttempts = Math.min(this.deps.config.routing.maxAttempts, candidates.length);
    const attempts: Array<{ providerId: string; model: string; keyId: string; reason: string }> = [];
    // Secrets whose credentials were rejected. Two keys that share a secret
    // are the same credential, so an auth failure skips both.
    const failedSecrets = new Set<string>();

    for (const candidate of candidates.slice(0, maxAttempts)) {
      if (failedSecrets.has(candidate.secretId)) continue;

      try {
        const adapter = await this.adapterFor(candidate);
        const result = await adapter.complete({ ...request, model: candidate.model.id }, options);
        this.deps.health.recordSuccess(candidate.provider.id, candidate.keyId, result.latencyMs);
        return { result, candidate };
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError('The provider call failed.', { retryable: true });

        this.deps.health.recordFailure(candidate.provider.id, candidate.keyId, {
          message: providerError.message,
          authFailure: providerError.authFailure,
          rateLimited: providerError.rateLimited,
        });

        attempts.push({
          providerId: candidate.provider.id,
          model: candidate.model.id,
          keyId: candidate.keyId,
          reason: providerError.message.slice(0, 200),
        });

        if (providerError.authFailure) {
          // The credential is rejected. Retrying it, under this key or any
          // other that shares the secret, cannot succeed.
          failedSecrets.add(candidate.secretId);
        }
        if (!providerError.retryable) {
          // A non-retryable failure will not improve with another attempt at
          // the same model, but another provider may still work, so we
          // continue the loop rather than failing immediately.
          continue;
        }
      }
    }

    throw new RoutingError(
      'all_attempts_failed',
      `Every candidate failed for model "${request.model}".`,
      502,
      attempts,
    );
  }

  /**
   * Execute a streaming request.
   *
   * Provider selection completes before the first downstream byte: the
   * upstream connection is established and the adapter resolved before the
   * route writes any SSE frame.
   */
  async stream(
    request: ChatCompletionRequest,
    options: ProviderCallOptions,
  ): Promise<{ result: ProviderStreamResult; candidate: RouteCandidate }> {
    const candidates = await this.candidates(request.model);
    if (candidates.length === 0) {
      throw new RoutingError(
        'no_candidate',
        `No enabled provider offers the free model "${request.model}".`,
        404,
      );
    }

    const maxAttempts = Math.min(this.deps.config.routing.maxAttempts, candidates.length);
    const attempts: Array<{ providerId: string; model: string; keyId: string; reason: string }> = [];
    const failedSecrets = new Set<string>();

    for (const candidate of candidates.slice(0, maxAttempts)) {
      if (failedSecrets.has(candidate.secretId)) continue;

      try {
        const adapter = await this.adapterFor(candidate);
        const result = await adapter.stream({ ...request, model: candidate.model.id }, options);
        this.deps.health.recordSuccess(candidate.provider.id, candidate.keyId, result.latencyMs);
        return { result, candidate };
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError('The provider call failed.', { retryable: true });
        this.deps.health.recordFailure(candidate.provider.id, candidate.keyId, {
          message: providerError.message,
          authFailure: providerError.authFailure,
          rateLimited: providerError.rateLimited,
        });
        attempts.push({
          providerId: candidate.provider.id,
          model: candidate.model.id,
          keyId: candidate.keyId,
          reason: providerError.message.slice(0, 200),
        });
        if (providerError.authFailure) failedSecrets.add(candidate.secretId);
      }
    }

    throw new RoutingError(
      'all_attempts_failed',
      `Every candidate failed for model "${request.model}".`,
      502,
      attempts,
    );
  }

  /**
   * Create an embedding vector, trying candidates in ranked order.
   *
   * Failover is bounded by `routing.maxAttempts`.
   */
  async embed(
    request: { model?: string; input: string },
    options: ProviderCallOptions,
  ): Promise<{ result: { object: string; data: Array<{ embedding: number[]; index: number }>; usage: { prompt_tokens: number; completion_tokens?: number }; model: string }; latencyMs: number; candidate: RouteCandidate }> {
    const model = this.resolveRequestedModel(request.model);
    const candidates = await this.candidates(model);
    if (candidates.length === 0) {
      throw new RoutingError(
        'no_candidate',
        `No enabled provider offers the free model "${request.model}".`,
        404,
      );
    }

    const maxAttempts = Math.min(this.deps.config.routing.maxAttempts, candidates.length);
    const attempts: Array<{ providerId: string; model: string; keyId: string; reason: string }> = [];
    const failedSecrets = new Set<string>();

    for (const candidate of candidates.slice(0, maxAttempts)) {
      if (failedSecrets.has(candidate.secretId)) continue;

      try {
        const adapter = await this.adapterFor(candidate);
        const result = await adapter.embed({ ...request, model: candidate.model.id }, options);
        this.deps.health.recordSuccess(candidate.provider.id, candidate.keyId, result.latencyMs);
        return { result: result.result, latencyMs: result.latencyMs, candidate };
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError('The provider call failed.', { retryable: true });
        this.deps.health.recordFailure(candidate.provider.id, candidate.keyId, {
          message: providerError.message,
          authFailure: providerError.authFailure,
          rateLimited: providerError.rateLimited,
        });
        attempts.push({
          providerId: candidate.provider.id,
          model: candidate.model.id,
          keyId: candidate.keyId,
          reason: providerError.message.slice(0, 200),
        });
        if (providerError.authFailure) failedSecrets.add(candidate.secretId);
      }
    }

    throw new RoutingError(
      'all_attempts_failed',
      `Every candidate failed for model "${request.model}".`,
      502,
      attempts,
    );
  }

  /**
   * Generate an image, trying candidates in ranked order.
   *
   * Failover is bounded by `routing.maxAttempts`.
   */
  async imageGenerate(
    request: { prompt: string; size?: string; model?: string },
    options: ProviderCallOptions,
  ): Promise<{ result: { url: string; b64_json?: string; revised_prompt?: string }; latencyMs: number; candidate: RouteCandidate }> {
    const model = this.resolveRequestedModel(request.model);
    const candidates = await this.candidates(model);
    if (candidates.length === 0) {
      throw new RoutingError(
        'no_candidate',
        `No enabled provider offers the free model "${request.model}".`,
        404,
      );
    }

    const maxAttempts = Math.min(this.deps.config.routing.maxAttempts, candidates.length);
    const attempts: Array<{ providerId: string; model: string; keyId: string; reason: string }> = [];
    const failedSecrets = new Set<string>();

    for (const candidate of candidates.slice(0, maxAttempts)) {
      if (failedSecrets.has(candidate.secretId)) continue;

      try {
        const adapter = await this.adapterFor(candidate);
        const result = await adapter.imageGenerate({ ...request, model: candidate.model.id }, options);
        this.deps.health.recordSuccess(candidate.provider.id, candidate.keyId, result.latencyMs);
        return { result: result.result, latencyMs: result.latencyMs, candidate };
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError('The provider call failed.', { retryable: true });
        this.deps.health.recordFailure(candidate.provider.id, candidate.keyId, {
          message: providerError.message,
          authFailure: providerError.authFailure,
          rateLimited: providerError.rateLimited,
        });
        attempts.push({
          providerId: candidate.provider.id,
          model: candidate.model.id,
          keyId: candidate.keyId,
          reason: providerError.message.slice(0, 200),
        });
        if (providerError.authFailure) failedSecrets.add(candidate.secretId);
      }
    }

    throw new RoutingError(
      'all_attempts_failed',
      `Every candidate failed for model "${request.model}".`,
      502,
      attempts,
    );
  }

  /**
   * Create a response using the Responses API, trying candidates in ranked order.
   *
   * Failover is bounded by `routing.maxAttempts`.
   */
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
  ): Promise<{ result: any; candidate: RouteCandidate }> {
    const candidates = await this.candidates(request.model);

    if (candidates.length === 0) {
      throw new RoutingError(
        'no_candidate',
        `No enabled provider offers the free model "${request.model}".`,
        404,
      );
    }

    const maxAttempts = Math.min(this.deps.config.routing.maxAttempts, candidates.length);
    const attempts: Array<{ providerId: string; model: string; keyId: string; reason: string }> = [];
    const failedSecrets = new Set<string>();

    for (const candidate of candidates.slice(0, maxAttempts)) {
      if (failedSecrets.has(candidate.secretId)) continue;

      try {
        const adapter = await this.adapterFor(candidate);
        const startedAt = Date.now();
        const result = await adapter.responseCreate({ ...request, model: candidate.model.id }, options);
        this.deps.health.recordSuccess(candidate.provider.id, candidate.keyId, Date.now() - startedAt);
        return { result, candidate };
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError('The provider call failed.', { retryable: true });
        this.deps.health.recordFailure(candidate.provider.id, candidate.keyId, {
          message: providerError.message,
          authFailure: providerError.authFailure,
          rateLimited: providerError.rateLimited,
        });
        attempts.push({
          providerId: candidate.provider.id,
          model: candidate.model.id,
          keyId: candidate.keyId,
          reason: providerError.message.slice(0, 200),
        });
        if (providerError.authFailure) failedSecrets.add(candidate.secretId);
      }
    }

    throw new RoutingError(
      'all_attempts_failed',
      `Every candidate failed for model "${request.model}".`,
      502,
      attempts,
    );
  }
}
