/**
 * Shared test helpers.
 *
 * Each test runs against an isolated temporary state directory, so the
 * developer's real configuration under %LOCALAPPDATA% is never touched.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { ConfigStore } from '../src/config/store.js';
import { SecretStore } from '../src/security/secret-store.js';
import { HealthTracker } from '../src/providers/health.js';
import { AdminSessionStore } from '../src/security/auth.js';
import { buildApp, type GatewayApp } from '../src/app.js';
import type { DpapiDriver } from '../src/security/dpapi.js';

/** A driver that reverses plaintext, for tests that do not need real DPAPI. */
export class FakeDpapiDriver implements DpapiDriver {
  readonly id = 'fake';
  /** When true, every operation throws. */
  failMode = false;
  /** Number of calls, so tests can assert on caching. */
  protectCalls = 0;
  unprotectCalls = 0;
  /** Number of batch calls, so tests can assert on subprocess batching. */
  protectBatchCalls = 0;
  unprotectBatchCalls = 0;

  async protect(plaintext: string): Promise<string> {
    this.protectCalls += 1;
    if (this.failMode) throw new Error('DPAPI unavailable');
    return Buffer.from(`enc:${plaintext}`, 'utf8').toString('base64');
  }

  async unprotect(ciphertext: string): Promise<string> {
    this.unprotectCalls += 1;
    if (this.failMode) throw new Error('DPAPI unavailable');
    const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
    if (!decoded.startsWith('enc:')) throw new Error('bad ciphertext');
    return decoded.slice(4);
  }

  async protectBatch(plaintexts: readonly string[]): Promise<readonly string[]> {
    this.protectBatchCalls += 1;
    return Promise.all(plaintexts.map((value) => this.protect(value)));
  }

  async unprotectBatch(ciphertexts: readonly string[]): Promise<readonly string[]> {
    this.unprotectBatchCalls += 1;
    return Promise.all(ciphertexts.map((value) => this.unprotect(value)));
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}

/** A driver that always throws, for failure-path tests. */
export class FailingDpapiDriver implements DpapiDriver {
  readonly id = 'failing';
  async protect(): Promise<string> {
    throw new Error('DPAPI unavailable');
  }
  async unprotect(): Promise<string> {
    throw new Error('DPAPI unavailable');
  }
  async protectBatch(): Promise<readonly string[]> {
    throw new Error('DPAPI unavailable');
  }
  async unprotectBatch(): Promise<readonly string[]> {
    throw new Error('DPAPI unavailable');
  }
  async close(): Promise<void> {
    // Nothing to release.
  }
}

/** A prepared test environment. */
export interface TestContext {
  readonly stateDir: string;
  readonly configStore: ConfigStore;
  readonly secrets: SecretStore;
  readonly health: HealthTracker;
  readonly sessions: AdminSessionStore;
  readonly driver: FakeDpapiDriver;
  readonly app: GatewayApp;
}

/** Track temporary directories so they can be removed after each test. */
const tempDirs: string[] = [];

/** Point the state directory at a fresh temporary folder. */
export async function useTempStateDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lag-test-'));
  tempDirs.push(dir);
  const previous = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = dir;
  afterEach(() => {
    process.env.LOCALAPPDATA = previous;
  });
  return dir;
}

/** Remove every temporary directory created during the test. */
export async function cleanupTempDirs(): Promise<void> {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
}

/** Build a fully wired application against a temporary state directory. */
export async function createTestContext(
  options: { driver?: FakeDpapiDriver } = {},
): Promise<TestContext> {
  await useTempStateDir();

  const driver = options.driver ?? new FakeDpapiDriver();
  const configStore = new ConfigStore();
  await configStore.load();

  const secrets = new SecretStore(driver);
  await secrets.load();

  const health = new HealthTracker();
  const sessions = new AdminSessionStore();

  const app = await buildApp({ configStore, secrets, health, sessions });
  return { stateDir: process.env.LOCALAPPDATA ?? '', configStore, secrets, health, sessions, driver, app };
}

/** Set up and tear down the environment around a test file. */
export function withTempState(): void {
  beforeEach(async () => {
    await useTempStateDir();
  });
  afterEach(async () => {
    await cleanupTempDirs();
  });
}
