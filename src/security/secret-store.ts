/**
 * Secret store: persists API keys and tokens as DPAPI ciphertext.
 *
 * Invariants:
 *  - Plaintext key material only ever exists in memory, and only inside this
 *    module's cache.
 *  - The persisted document contains DPAPI ciphertext only. A plaintext
 *    fallback is not implemented and cannot be reached.
 *  - Any DPAPI failure is fatal. We never degrade to storing plaintext.
 *  - Decrypted values are cached with a TTL and an explicit invalidation path.
 */

import { z } from 'zod';
import { DpapiError } from './dpapi.js';
import type { DpapiDriver } from './dpapi.js';
import { atomicWriteFile, readFileIfExists, restrictToCurrentUser, secretsPath } from '../config/paths.js';

/** Kinds of secret the gateway stores. */
export const secretKindSchema = z.enum(['provider-key', 'gateway-token', 'admin-token']);
export type SecretKind = z.infer<typeof secretKindSchema>;

/** One persisted secret. `ciphertext` is base64 DPAPI output. */
export const secretRecordSchema = z.object({
  id: z.string().min(1).max(64),
  kind: secretKindSchema,
  label: z.string().max(120).optional(),
  ciphertext: z.string().min(1),
  createdAt: z.string().max(40),
  lastUsedAt: z.string().max(40).optional(),
});

export type SecretRecord = z.infer<typeof secretRecordSchema>;

const secretDocumentSchema = z.object({
  version: z.literal(1),
  secrets: z.array(secretRecordSchema).max(500),
});

/** Raised for secret-store problems. Never carries secret material. */
export class SecretStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SecretStoreError';
    this.code = code;
  }
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/** Options for {@link SecretStore}. */
export interface SecretStoreOptions {
  /** How long a decrypted secret may stay in memory, in milliseconds. */
  readonly cacheTtlMs?: number;
  /** Maximum number of decrypted secrets held in memory at once. */
  readonly maxCacheEntries?: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_CACHE_ENTRIES = 64;

/**
 * A DPAPI-protected store for API keys and tokens.
 */
export class SecretStore {
  private readonly driver: DpapiDriver;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly cache = new Map<string, CacheEntry>();
  private records: SecretRecord[] = [];
  private loaded = false;

  constructor(driver: DpapiDriver, options: SecretStoreOptions = {}) {
    this.driver = driver;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  }

  /** Load the persisted index. Safe to call repeatedly. */
  async load(): Promise<void> {
    const raw = await readFileIfExists(secretsPath());
    if (raw === null) {
      this.records = [];
      this.loaded = true;
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SecretStoreError('SECRETS_PARSE_FAILED', 'The secret index is not valid JSON.');
    }
    const result = secretDocumentSchema.safeParse(parsed);
    if (!result.success) {
      throw new SecretStoreError(
        'SECRETS_INVALID',
        `The secret index is invalid: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      );
    }
    this.records = result.data.secrets;
    this.loaded = true;
  }

  /** Ensure the index has been loaded. */
  private assertLoaded(): void {
    if (!this.loaded) {
      throw new SecretStoreError('SECRETS_NOT_LOADED', 'The secret store has not been loaded.');
    }
  }

  /** All persisted secret metadata, without ciphertext. */
  list(): Array<Omit<SecretRecord, 'ciphertext'>> {
    this.assertLoaded();
    return this.records.map(({ ciphertext: _ciphertext, ...rest }) => rest);
  }

  /** Look up a record without decrypting it. */
  find(id: string): SecretRecord | undefined {
    this.assertLoaded();
    return this.records.find((record) => record.id === id);
  }

  /**
   * Store a new secret.
   *
   * The plaintext is encrypted before it is returned to the caller; the
   * caller is responsible for discarding its copy.
   */
  async set(
    id: string,
    kind: SecretKind,
    plaintext: string,
    label?: string,
  ): Promise<Omit<SecretRecord, 'ciphertext'>> {
    this.assertLoaded();
    if (!plaintext) {
      throw new SecretStoreError('SECRET_EMPTY', 'The secret value is empty.');
    }

    let ciphertext: string;
    try {
      ciphertext = await this.driver.protect(plaintext);
    } catch (error) {
      // Fail closed. We never write a plaintext fallback.
      throw new SecretStoreError(
        'SECRET_ENCRYPT_FAILED',
        `The secret could not be encrypted: ${error instanceof DpapiError ? error.code : 'unknown error'}`,
      );
    }

    const now = new Date().toISOString();
    const record: SecretRecord = {
      id,
      kind,
      ...(label === undefined ? {} : { label }),
      ciphertext,
      createdAt: now,
    };

    const existing = this.records.findIndex((r) => r.id === id);
    if (existing >= 0) {
      record.createdAt = this.records[existing]?.createdAt ?? now;
      this.records[existing] = record;
    } else {
      this.records.push(record);
    }

    await this.persist();
    this.cache.set(id, { value: plaintext, expiresAt: Date.now() + this.cacheTtlMs });
    const { ciphertext: _c, ...meta } = record;
    return meta;
  }

  /**
   * Decrypt a secret, using the in-memory cache when it is still valid.
   *
   * The cache is a performance optimisation only. Every miss decrypts from
   * DPAPI, so a stale or evicted cache can never change the result.
   */
  async get(id: string): Promise<string | null> {
    this.assertLoaded();
    const record = this.records.find((r) => r.id === id);
    if (!record) return null;

    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    this.cache.delete(id);

    let plaintext: string;
    try {
      plaintext = await this.driver.unprotect(record.ciphertext);
    } catch (error) {
      throw new SecretStoreError(
        'SECRET_DECRYPT_FAILED',
        `The secret could not be decrypted: ${error instanceof DpapiError ? error.code : 'unknown error'}`,
      );
    }

    this.putInCache(id, plaintext);
    return plaintext;
  }

  /** Decrypt many secrets in one DPAPI round-trip. */
  async getMany(ids: readonly string[]): Promise<Map<string, string>> {
    this.assertLoaded();
    const result = new Map<string, string>();
    const pending: string[] = [];

    for (const id of ids) {
      const cached = this.cache.get(id);
      if (cached && cached.expiresAt > Date.now()) {
        result.set(id, cached.value);
      } else {
        pending.push(id);
      }
    }
    if (pending.length === 0) return result;

    const records = pending
      .map((id) => this.records.find((r) => r.id === id))
      .filter((r): r is SecretRecord => r !== undefined);
    if (records.length === 0) return result;

    let values: readonly string[];
    try {
      values = await this.driver.unprotectBatch(records.map((r) => r.ciphertext));
    } catch (error) {
      throw new SecretStoreError(
        'SECRET_DECRYPT_FAILED',
        `The secrets could not be decrypted: ${error instanceof DpapiError ? error.code : 'unknown error'}`,
      );
    }

    for (const [index, record] of records.entries()) {
      const value = values[index];
      if (value === undefined) continue;
      result.set(record.id, value);
      this.putInCache(record.id, value);
    }
    return result;
  }

  /** Remove a secret and evict it from the cache. */
  async remove(id: string): Promise<boolean> {
    this.assertLoaded();
    const index = this.records.findIndex((r) => r.id === id);
    if (index < 0) return false;
    this.records.splice(index, 1);
    this.cache.delete(id);
    await this.persist();
    return true;
  }

  /** Drop every decrypted value from memory. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Number of decrypted secrets currently held in memory. */
  get cacheSize(): number {
    return this.cache.size;
  }

  /** Insert into the cache, evicting the oldest entry when full. */
  private putInCache(id: string, value: string): void {
    if (this.cache.size >= this.maxCacheEntries) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(id, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }

  /** Persist the index atomically. */
  private async persist(): Promise<void> {
    const document = { version: 1, secrets: this.records };
    await atomicWriteFile(secretsPath(), `${JSON.stringify(document, null, 2)}\n`, 0o600);
    await restrictToCurrentUser(secretsPath());
  }
}
