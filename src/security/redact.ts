/**
 * Log redaction.
 *
 * The gateway logs request metadata, provider ids and error text. It must
 * never log an API key, a token, or the value of an Authorization header.
 *
 * Two complementary mechanisms are used:
 *  1. Pattern redaction, which catches well-known credential shapes.
 *  2. Value redaction, which catches exact secret strings the process knows
 *     about. Values are registered when a secret is decrypted and removed when
 *     it is evicted, so the registry stays small.
 */

/** Minimum length before a value is treated as redactable. */
const MIN_REDACTABLE_LENGTH = 8;

/** The text substituted for any redacted value. */
export const REDACTED = '[REDACTED]';

/** Patterns for common credential shapes. */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  // OpenAI-style keys, including project/org-prefixed variants.
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  // Google API keys.
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  // Bearer tokens in headers or text.
  /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  // Authorization headers in JSON or log output.
  /("?(?:authorization|api[-_]?key|apikey|x-api-key|token|secret|password)"?\s*[:=]\s*)("?)[^\s"',}]{8,}\2/gi,
  // Bare key=value pairs in query strings.
  /([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"']{8,}/gi,
  // JSON Web Tokens.
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
];

/** Registry of exact secret values that must never appear in output. */
const secretValues = new Set<string>();

/**
 * Register a secret value so it is redacted from all future output.
 *
 * Short values are ignored: redacting a 3-character string would corrupt
 * unrelated output without protecting anything meaningful.
 */
export function registerSecretValue(value: string | null | undefined): void {
  if (!value) return;
  const trimmed = value.trim();
  if (trimmed.length < MIN_REDACTABLE_LENGTH) return;
  secretValues.add(trimmed);
}

/** Forget a previously registered secret value. */
export function unregisterSecretValue(value: string | null | undefined): void {
  if (!value) return;
  secretValues.delete(value.trim());
}

/** Forget every registered secret value. */
export function clearSecretValues(): void {
  secretValues.clear();
}

/** Number of registered secret values. */
export function registeredSecretCount(): number {
  return secretValues.size;
}

/**
 * Redact secrets from an arbitrary string.
 *
 * Registered values are replaced first, because they are the most reliable
 * signal, then pattern redaction runs over the result.
 */
export function redactString(input: string): string {
  if (!input) return input;
  let output = input;

  // Longest first, so a secret that contains another is replaced whole.
  const sorted = [...secretValues].sort((a, b) => b.length - a.length);
  for (const secret of sorted) {
    if (output.includes(secret)) {
      output = output.split(secret).join(REDACTED);
    }
  }

  for (const pattern of CREDENTIAL_PATTERNS) {
    output = output.replace(pattern, (_match: string, prefix?: string) => {
      if (prefix === undefined) return REDACTED;
      return `${prefix}${REDACTED}`;
    });
  }

  return output;
}

/**
 * Redact secrets from an unknown value for structured logging.
 *
 * Objects are walked and their string values redacted. Keys are preserved so
 * logs stay useful.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (typeof value === 'string') return redactString(value);
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = redactValue(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

/**
 * Redact the sensitive parts of an HTTP request for logging.
 *
 * Returns only non-sensitive metadata: method, path, status and duration.
 */
export function redactRequestSummary(summary: {
  method: string;
  url: string;
  statusCode?: number;
  durationMs?: number;
}): Record<string, unknown> {
  let path = summary.url;
  const queryIndex = path.indexOf('?');
  if (queryIndex >= 0) path = path.slice(0, queryIndex);
  return {
    method: summary.method,
    path: redactString(path),
    ...(summary.statusCode === undefined ? {} : { statusCode: summary.statusCode }),
    ...(summary.durationMs === undefined ? {} : { durationMs: Math.round(summary.durationMs) }),
  };
}
