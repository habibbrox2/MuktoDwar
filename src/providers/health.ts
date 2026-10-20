/**
 * Provider health tracking.
 *
 * The router uses this to decide which provider to try next. Three signals
 * are tracked per key:
 *  - Measured latency, as an exponentially weighted moving average. A single
 *    slow call cannot dominate the estimate.
 *  - Cooldown, entered after repeated failures. A key in cooldown is skipped
 *    until the cooldown expires.
 *  - A circuit breaker, which opens after sustained failures and lets a
 *    single probe through once the open period elapses.
 *
 * All state is in memory and is intentionally lost on restart: a fresh
 * process has no history and therefore no stale opinions.
 */

/** Latency smoothing factor. Lower means more weight on recent samples. */
const EWMA_ALPHA = 0.3;

/** Latency samples above this are treated as outliers and ignored. */
const MAX_LATENCY_SAMPLE_MS = 120_000;

/** Health state of a single provider key. */
export interface KeyHealth {
  readonly keyId: string;
  readonly providerId: string;
  /** Consecutive failures. */
  consecutiveFailures: number;
  /** Total successes observed. */
  successes: number;
  /** Total failures observed. */
  failures: number;
  /** Exponentially weighted moving average of latency, in milliseconds. */
  latencyMs: number | null;
  /** Number of latency samples folded into the average. */
  samples: number;
  /** Epoch milliseconds until which the key is in cooldown. */
  cooldownUntil: number;
  /** Epoch milliseconds until which the circuit breaker is open. */
  breakerOpenUntil: number;
  /** Consecutive failures that caused the breaker to open. */
  breakerFailures: number;
  /** True while the breaker is half-open and a probe is allowed through. */
  probing: boolean;
  /** Epoch milliseconds of the most recent outcome. */
  lastOutcomeAt: number;
  /** The most recent error, for diagnostics. */
  lastError: string | undefined;
}

/** Configuration for the health tracker. */
export interface HealthTrackerOptions {
  /** Failures before a key enters cooldown. */
  readonly failureThreshold: number;
  /** Cooldown duration, in milliseconds. */
  readonly cooldownMs: number;
  /** Failures before the circuit breaker opens. */
  readonly breakerThreshold: number;
  /** How long the breaker stays open, in milliseconds. */
  readonly breakerOpenMs: number;
}

/** Default health settings, matching the configuration defaults. */
export const DEFAULT_HEALTH_OPTIONS: HealthTrackerOptions = {
  failureThreshold: 3,
  cooldownMs: 60_000,
  breakerThreshold: 5,
  breakerOpenMs: 30_000,
};

/** Tracks health, latency and availability for provider keys. */
export class HealthTracker {
  private readonly states = new Map<string, KeyHealth>();
  private readonly options: HealthTrackerOptions;

  constructor(options: HealthTrackerOptions = DEFAULT_HEALTH_OPTIONS) {
    this.options = options;
  }

  /** Get or create the health state for a key. */
  state(providerId: string, keyId: string): KeyHealth {
    const id = `${providerId}:${keyId}`;
    let state = this.states.get(id);
    if (!state) {
      state = {
        keyId,
        providerId,
        consecutiveFailures: 0,
        successes: 0,
        failures: 0,
        latencyMs: null,
        samples: 0,
        cooldownUntil: 0,
        breakerOpenUntil: 0,
        breakerFailures: 0,
        probing: false,
        lastOutcomeAt: 0,
        lastError: undefined,
      };
      this.states.set(id, state);
    }
    return state;
  }

  /**
   * True when the key is currently usable.
   *
   * A key in cooldown is never usable. A key whose breaker is open is
   * unusable until the open period ends, after which it becomes a probe.
   */
  isAvailable(providerId: string, keyId: string, now = Date.now()): boolean {
    const state = this.state(providerId, keyId);
    if (state.cooldownUntil > now) return false;
    if (state.breakerOpenUntil > now) return false;
    return true;
  }

  /** True when the breaker is open and the open period has elapsed. */
  isProbeEligible(providerId: string, keyId: string, now = Date.now()): boolean {
    const state = this.state(providerId, keyId);
    return state.breakerOpenUntil > 0 && state.breakerOpenUntil <= now && !state.probing;
  }

  /** Record a successful call. */
  recordSuccess(providerId: string, keyId: string, latencyMs: number): void {
    const state = this.state(providerId, keyId);
    state.successes += 1;
    state.consecutiveFailures = 0;
    state.breakerFailures = 0;
    state.cooldownUntil = 0;
    state.breakerOpenUntil = 0;
    state.probing = false;
    state.lastOutcomeAt = Date.now();
    state.lastError = undefined;

    if (latencyMs >= 0 && latencyMs <= MAX_LATENCY_SAMPLE_MS) {
      state.latencyMs =
        state.latencyMs === null ? latencyMs : EWMA_ALPHA * latencyMs + (1 - EWMA_ALPHA) * state.latencyMs;
      state.samples += 1;
    }
  }

  /**
   * Record a failed call.
   *
   * Authentication failures are not counted as transient failures: a bad key
   * does not become healthy by waiting, and retrying it would waste quota.
   */
  recordFailure(
    providerId: string,
    keyId: string,
    error: { message: string; authFailure?: boolean; rateLimited?: boolean },
  ): void {
    const state = this.state(providerId, keyId);
    state.failures += 1;
    state.lastOutcomeAt = Date.now();
    state.lastError = error.message.slice(0, 200);

    if (error.authFailure) {
      // Put the key into a long cooldown; it will not recover on its own.
      state.cooldownUntil = Date.now() + this.options.cooldownMs * 10;
      state.consecutiveFailures += 1;
      state.breakerFailures += 1;
      return;
    }

    state.consecutiveFailures += 1;
    state.breakerFailures += 1;

    if (state.consecutiveFailures >= this.options.failureThreshold) {
      state.cooldownUntil = Date.now() + this.options.cooldownMs;
    }
    if (state.breakerFailures >= this.options.breakerThreshold) {
      state.breakerOpenUntil = Date.now() + this.options.breakerOpenMs;
      state.probing = false;
    }
  }

  /** Reset the breaker and cooldown, for example after a configuration change. */
  reset(providerId: string, keyId: string): void {
    const state = this.state(providerId, keyId);
    state.consecutiveFailures = 0;
    state.breakerFailures = 0;
    state.cooldownUntil = 0;
    state.breakerOpenUntil = 0;
    state.probing = false;
    state.lastError = undefined;
  }

  /** Clear all tracked state. */
  clear(): void {
    this.states.clear();
  }

  /**
   * A health score between 0 and 1.
   *
   * 1 means a key that has been succeeding consistently. The score decays
   * with the failure ratio and with recent consecutive failures.
   */
  healthScore(providerId: string, keyId: string): number {
    const state = this.state(providerId, keyId);
    const total = state.successes + state.failures;
    if (total === 0) return 0.5; // Unknown: neither trusted nor distrusted.
    const successRatio = state.successes / total;
    const penalty = Math.min(state.consecutiveFailures, 5) * 0.1;
    return Math.max(0, Math.min(1, successRatio - penalty));
  }

  /** A snapshot of every tracked key, for the admin UI. */
  snapshot(): KeyHealth[] {
    return [...this.states.values()].map((state) => ({ ...state }));
  }
}
