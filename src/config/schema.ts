/**
 * Configuration schema and validation.
 *
 * Configuration is persisted as JSON under %LOCALAPPDATA%. Secrets are never
 * part of this document: API keys are referenced by id and stored separately,
 * encrypted with Windows DPAPI (see `src/security/secret-store.ts`).
 */

import { z } from 'zod';

/** Schema version, bumped when the persisted shape changes. */
export const CONFIG_VERSION = 1;

/** Providers the gateway knows how to talk to. */
export const providerKindSchema = z.enum([
  'gemini',
  'groq',
  'mistral',
  'sambanova',
  'openrouter',
  'kilo',
  'opencode',
  'opencodego',
  'zenmux',
  'requesty',
  'bazaarlink',
  'anyapi',
  'poolside',
  'cline',
  'zhipu',
  'siliconflow',
  'ollama',
  'lmstudio',
  'cloudflare',
  'custom',
]);

export type ProviderKind = z.infer<typeof providerKindSchema>;

/**
 * A model the administrator has allowlisted for a provider.
 *
 * `free` and `verified` are required rather than defaulted. The gateway must
 * never infer that a model is free, and it must never route to a model the
 * administrator has not explicitly approved.
 */
export const modelEntrySchema = z.object({
  /** Model id sent upstream. */
  id: z.string().min(1).max(200),
  /** True only when the model is genuinely free to use. */
  free: z.boolean(),
  /** True when the free status was confirmed against official documentation. */
  verified: z.boolean(),
  /** Optional context window, in tokens. */
  contextWindow: z.number().int().positive().max(10_000_000).optional(),
  /** Optional maximum completion length, in tokens. */
  maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
  /** Where the free status came from. */
  source: z.string().max(300).optional(),
});

export type ModelEntry = z.infer<typeof modelEntrySchema>;

/** One API key belonging to a provider. The key material lives in the secret store. */
export const providerKeySchema = z.object({
  id: z.string().min(1).max(64),
  /** Id of the DPAPI-encrypted secret holding the key material. */
  secretId: z.string().min(1).max(64),
  label: z.string().min(1).max(120).optional(),
  enabled: z.boolean().default(true),
  /** Lower numbers are tried first within a provider. */
  priority: z.number().int().min(0).max(1000).default(100),
  /** Consecutive failures before this key is put into cooldown. */
  failureThreshold: z.number().int().min(1).max(100).default(3),
  /** How long a key stays in cooldown, in milliseconds. */
  cooldownMs: z.number().int().min(1000).max(3_600_000).default(60_000),
});

export type ProviderKeyConfig = z.infer<typeof providerKeySchema>;

/** A configured provider. */
export const providerConfigSchema = z.object({
  id: z.string().min(1).max(64),
  kind: providerKindSchema,
  label: z.string().min(1).max(120),
  /** Providers are disabled until the administrator turns them on. */
  enabled: z.boolean().default(false),
  /** Lower numbers are tried first across providers. */
  priority: z.number().int().min(0).max(1000).default(100),
  /** Overrides the built-in base URL for this provider. */
  baseUrl: z.string().url().max(300).optional(),
  /** When true, requests are sent without an Authorization header. */
  anonymous: z.boolean().default(false),
  /** The administrator's allowlist of models for this provider. */
  models: z.array(modelEntrySchema).max(200).default([]),
  /** Keys usable for this provider. */
  keys: z.array(providerKeySchema).max(50).default([]),
  notes: z.string().max(500).optional(),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/** Server binding and request limits. */
export const gatewaySettingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(8787),
  /**
   * The gateway is local-only. The literal type makes any other bind address
   * a configuration error that fails validation at load time.
   */
  host: z.literal('127.0.0.1').default('127.0.0.1'),
  /** Upper bound on a non-streaming request, in milliseconds. */
  requestTimeoutMs: z.number().int().min(1_000).max(600_000).default(120_000),
  /** Upper bound on a streaming request, in milliseconds. */
  streamTimeoutMs: z.number().int().min(1_000).max(600_000).default(300_000),
  /** Upper bound on a request body, in bytes. */
  maxBodyBytes: z.number().int().min(1_024).max(50_000_000).default(2_000_000),
  /** Idle timeout between streamed chunks, in milliseconds. */
  streamIdleTimeoutMs: z.number().int().min(1_000).max(600_000).default(120_000),
});

export type GatewaySettings = z.infer<typeof gatewaySettingsSchema>;

/** Routing strategy. */
export const routingModeSchema = z.enum(['hybrid', 'priority', 'latency']);

export type RoutingMode = z.infer<typeof routingModeSchema>;

export const routingSettingsSchema = z.object({
  mode: routingModeSchema.default('hybrid'),
  /** Model used when a request does not name one. */
  defaultModel: z.string().max(200).default(''),
  /** Maximum number of provider attempts per request. */
  maxAttempts: z.number().int().min(1).max(5).default(3),
  /** How long a failed provider is skipped, in milliseconds. */
  cooldownMs: z.number().int().min(1_000).max(3_600_000).default(60_000),
  circuitBreaker: z
    .object({
      /** Consecutive failures before the breaker opens. */
      failureThreshold: z.number().int().min(1).max(100).default(5),
      /** How long the breaker stays open, in milliseconds. */
      openMs: z.number().int().min(1_000).max(3_600_000).default(30_000),
    })
    .default({ failureThreshold: 5, openMs: 30_000 }),
  weights: z
    .object({
      priority: z.number().min(0).max(10).default(3),
      latency: z.number().min(0).max(10).default(2),
      health: z.number().min(0).max(10).default(3),
    })
    .default({ priority: 3, latency: 2, health: 3 }),
});

export type RoutingSettings = z.infer<typeof routingSettingsSchema>;

/** The full persisted document. */
export const gatewayConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  gateway: gatewaySettingsSchema.default({
    port: 8787,
    host: '127.0.0.1',
    requestTimeoutMs: 120_000,
    streamTimeoutMs: 300_000,
    maxBodyBytes: 2_000_000,
    streamIdleTimeoutMs: 120_000,
  }),
  routing: routingSettingsSchema.default({
    mode: 'hybrid',
    defaultModel: '',
    maxAttempts: 3,
    cooldownMs: 60_000,
    circuitBreaker: { failureThreshold: 5, openMs: 30_000 },
    weights: { priority: 3, latency: 2, health: 3 },
  }),
  providers: z.array(providerConfigSchema).max(50).default([]),
});

export type GatewayConfig = z.infer<typeof gatewayConfigSchema>;

/** Raised when a configuration document is missing or invalid. */
export class ConfigError extends Error {
  readonly issues: readonly string[];
  constructor(message: string, issues: readonly string[] = []) {
    super(message);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Validate a raw configuration document.
 *
 * Returns a fully-populated config with every default applied. Throws
 * {@link ConfigError} with human-readable issue paths when the document is
 * invalid, so a corrupt file fails loudly instead of silently resetting.
 */
export function parseConfig(raw: unknown): GatewayConfig {
  const result = gatewayConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new ConfigError('The gateway configuration is invalid.', issues);
  }
  return result.data;
}

/** Build the default configuration for a fresh install. */
export function defaultConfig(): GatewayConfig {
  return parseConfig({ version: CONFIG_VERSION, providers: [] });
}
