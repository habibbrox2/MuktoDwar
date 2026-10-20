/**
 * Secret store tests.
 *
 * The store must never persist plaintext, must fail closed when DPAPI is
 * unavailable, and must keep its in-memory cache honest.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { SecretStore } from '../src/security/secret-store.js';
import { FailingDpapiDriver, FakeDpapiDriver, useTempStateDir } from './helpers.js';

describe('SecretStore', () => {
  it('stores a secret and reads it back', async () => {
    await useTempStateDir();
    const driver = new FakeDpapiDriver();
    const store = new SecretStore(driver);
    await store.load();

    await store.set('sk_test', 'provider-key', 'super-secret-value');
    expect(await store.get('sk_test')).toBe('super-secret-value');
  });

  it('never writes plaintext to disk', async () => {
    await useTempStateDir();
    const driver = new FakeDpapiDriver();
    const store = new SecretStore(driver);
    await store.load();
    await store.set('sk_test', 'provider-key', 'super-secret-value');

    const { secretsPath } = await import('../src/config/paths.js');
    const onDisk = await readFile(secretsPath(), 'utf8');
    expect(onDisk).not.toContain('super-secret-value');
    expect(onDisk).toContain('ciphertext');
  });

  it('fails closed when the driver cannot encrypt', async () => {
    await useTempStateDir();
    const store = new SecretStore(new FailingDpapiDriver());
    await store.load();

    await expect(store.set('sk_test', 'provider-key', 'super-secret-value')).rejects.toMatchObject({
      code: 'SECRET_ENCRYPT_FAILED',
    });
  });

  it('fails closed when the driver cannot decrypt', async () => {
    await useTempStateDir();
    const driver = new FakeDpapiDriver();
    const store = new SecretStore(driver);
    await store.load();
    await store.set('sk_test', 'provider-key', 'super-secret-value');

    driver.failMode = true;
    // Drop the cache so the read has to reach the now-failing driver.
    store.clearCache();
    await expect(store.get('sk_test')).rejects.toMatchObject({
      code: 'SECRET_DECRYPT_FAILED',
    });
  });

  it('caches decrypted values and reuses them', async () => {
    await useTempStateDir();
    const driver = new FakeDpapiDriver();
    const store = new SecretStore(driver);
    await store.load();
    await store.set('sk_test', 'provider-key', 'cached-value');

    const before = driver.unprotectCalls;
    await store.get('sk_test');
    await store.get('sk_test');
    expect(driver.unprotectCalls).toBe(before);
  });

  it('evicts a cached value when it expires', async () => {
    await useTempStateDir();
    const driver = new FakeDpapiDriver();
    const store = new SecretStore(driver, { cacheTtlMs: 1 });
    await store.load();
    await store.set('sk_test', 'provider-key', 'cached-value');

    await new Promise((resolve) => setTimeout(resolve, 15));
    const before = driver.unprotectCalls;
    expect(await store.get('sk_test')).toBe('cached-value');
    expect(driver.unprotectCalls).toBe(before + 1);
  });

  it('invalidates the cache when a secret is removed', async () => {
    await useTempStateDir();
    const store = new SecretStore(new FakeDpapiDriver());
    await store.load();
    await store.set('sk_test', 'provider-key', 'cached-value');
    expect(store.cacheSize).toBe(1);

    await store.remove('sk_test');
    expect(store.cacheSize).toBe(0);
    expect(await store.get('sk_test')).toBeNull();
  });

  it('replaces a secret in place, keeping its creation time', async () => {
    await useTempStateDir();
    const store = new SecretStore(new FakeDpapiDriver());
    await store.load();
    const first = await store.set('sk_test', 'provider-key', 'first-value');
    const second = await store.set('sk_test', 'provider-key', 'second-value');

    expect(second.createdAt).toBe(first.createdAt);
    expect(await store.get('sk_test')).toBe('second-value');
    expect(store.list()).toHaveLength(1);
  });

  it('lists metadata without the ciphertext', async () => {
    await useTempStateDir();
    const store = new SecretStore(new FakeDpapiDriver());
    await store.load();
    await store.set('sk_test', 'provider-key', 'value', 'A label');

    const [record] = store.list();
    expect(record).toBeDefined();
    expect(record).not.toHaveProperty('ciphertext');
    expect(record?.label).toBe('A label');
  });

  it('decrypts many secrets in a single batch', async () => {
    await useTempStateDir();
    const driver = new FakeDpapiDriver();
    const store = new SecretStore(driver);
    await store.load();
    await store.set('a', 'provider-key', 'value-a');
    await store.set('b', 'provider-key', 'value-b');

    // Drop the cache so the batch path is exercised.
    store.clearCache();
    const before = driver.unprotectBatchCalls;
    const values = await store.getMany(['a', 'b']);
    expect(values.get('a')).toBe('value-a');
    expect(values.get('b')).toBe('value-b');
    // One batched round-trip, not one call per secret.
    expect(driver.unprotectBatchCalls).toBe(before + 1);
  });

  it('serves a batch from the cache without touching the driver', async () => {
    await useTempStateDir();
    const driver = new FakeDpapiDriver();
    const store = new SecretStore(driver);
    await store.load();
    await store.set('a', 'provider-key', 'value-a');
    await store.set('b', 'provider-key', 'value-b');

    const before = driver.unprotectBatchCalls;
    const values = await store.getMany(['a', 'b']);
    expect(values.get('a')).toBe('value-a');
    expect(driver.unprotectBatchCalls).toBe(before);
  });

  it('rejects an empty secret', async () => {
    await useTempStateDir();
    const store = new SecretStore(new FakeDpapiDriver());
    await store.load();
    await expect(store.set('sk_test', 'provider-key', '')).rejects.toMatchObject({
      code: 'SECRET_EMPTY',
    });
  });
});
