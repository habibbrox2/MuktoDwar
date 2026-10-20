/**
 * Configuration tests.
 *
 * A corrupt or hostile configuration document must fail loudly at load time
 * rather than silently resetting or accepting an unsafe value.
 */

import { describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigStore } from '../src/config/store.js';
import { ConfigError, CONFIG_VERSION, defaultConfig, parseConfig } from '../src/config/schema.js';
import { configPath, stateDir } from '../src/config/paths.js';
import { useTempStateDir } from './helpers.js';

describe('configuration schema', () => {
  it('builds a valid default document', () => {
    const config = defaultConfig();
    expect(config.version).toBe(CONFIG_VERSION);
    expect(config.gateway.host).toBe('127.0.0.1');
    expect(config.gateway.port).toBe(8787);
    expect(config.providers).toEqual([]);
    expect(config.routing.maxAttempts).toBe(3);
  });

  it('applies defaults to a sparse document', () => {
    const config = parseConfig({ version: 1 });
    expect(config.gateway.maxBodyBytes).toBe(2_000_000);
    expect(config.routing.mode).toBe('hybrid');
    expect(config.routing.weights).toEqual({ priority: 3, latency: 2, health: 3 });
  });

  it('rejects an unknown schema version', () => {
    expect(() => parseConfig({ version: 99 })).toThrow(ConfigError);
  });

  it('refuses any bind host other than 127.0.0.1', () => {
    expect(() => parseConfig({ version: 1, gateway: { host: '0.0.0.0' } })).toThrow(ConfigError);
    expect(() => parseConfig({ version: 1, gateway: { host: 'localhost' } })).toThrow(ConfigError);
    expect(() => parseConfig({ version: 1, gateway: { host: '192.168.1.5' } })).toThrow(ConfigError);
  });

  it('rejects a port outside the configurable range', () => {
    expect(() => parseConfig({ version: 1, gateway: { port: 80 } })).toThrow(ConfigError);
    expect(() => parseConfig({ version: 1, gateway: { port: 70_000 } })).toThrow(ConfigError);
    expect(() => parseConfig({ version: 1, gateway: { port: 8787 } })).not.toThrow();
  });

  it('rejects an unknown provider kind', () => {
    expect(() =>
      parseConfig({ version: 1, providers: [{ id: 'p', kind: 'notreal', label: 'x' }] }),
    ).toThrow(ConfigError);
  });

  it('requires free and verified flags to be explicit', () => {
    expect(() =>
      parseConfig({
        version: 1,
        providers: [{ id: 'p', kind: 'groq', label: 'x', models: [{ id: 'm' }] }],
      }),
    ).toThrow(ConfigError);
  });

  it('rejects an unbounded maxAttempts', () => {
    expect(() => parseConfig({ version: 1, routing: { maxAttempts: 50 } })).toThrow(ConfigError);
    expect(() => parseConfig({ version: 1, routing: { maxAttempts: 0 } })).toThrow(ConfigError);
  });

  it('reports issue paths rather than a bare message', () => {
    try {
      parseConfig({ version: 1, gateway: { port: 5 } });
      throw new Error('expected a ConfigError');
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError.issues.length).toBeGreaterThan(0);
      expect(configError.issues.join(' ')).toContain('gateway.port');
    }
  });

  it('accepts every provider kind in the catalog', () => {
    const kinds = [
      'gemini', 'groq', 'mistral', 'sambanova', 'openrouter', 'kilo', 'opencode',
      'requesty', 'bazaarlink', 'anyapi', 'poolside', 'cline', 'zhipu',
      'siliconflow', 'ollama', 'lmstudio', 'custom',
    ];
    for (const kind of kinds) {
      const config = parseConfig({
        version: 1,
        providers: [{ id: `p-${kind}`, kind, label: kind }],
      });
      expect(config.providers[0]?.kind).toBe(kind);
      // Every provider ships disabled: nothing is live until an administrator turns it on.
      expect(config.providers[0]?.enabled).toBe(false);
    }
  });
});

describe('configuration store', () => {
  it('creates a default document on first run', async () => {
    await useTempStateDir();
    const store = new ConfigStore();
    const config = await store.load();

    expect(config.gateway.host).toBe('127.0.0.1');
    const onDisk = await readFile(configPath(), 'utf8');
    expect(JSON.parse(onDisk).version).toBe(CONFIG_VERSION);
  });

  it('reloads a document it previously wrote', async () => {
    await useTempStateDir();
    const store = new ConfigStore();
    await store.load();
    await store.mutate((draft) => {
      draft.gateway.port = 9999;
      return draft;
    });

    const fresh = new ConfigStore();
    const reloaded = await fresh.load();
    expect(reloaded.gateway.port).toBe(9999);
  });

  it('rejects a configuration file that is not valid JSON', async () => {
    await useTempStateDir();
    await mkdir(stateDir(), { recursive: true });
    await writeFile(configPath(), '{ this is not json', 'utf8');

    const store = new ConfigStore();
    await expect(store.load()).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects a configuration file that fails validation', async () => {
    await useTempStateDir();
    await mkdir(stateDir(), { recursive: true });
    await writeFile(configPath(), JSON.stringify({ version: 1, gateway: { host: '0.0.0.0' } }), 'utf8');

    const store = new ConfigStore();
    await expect(store.load()).rejects.toBeInstanceOf(ConfigError);
  });

  it('leaves the previous document intact when an update is rejected', async () => {
    await useTempStateDir();
    const store = new ConfigStore();
    await store.load();
    await store.mutate((draft) => {
      draft.gateway.port = 9999;
      return draft;
    });

    await expect(store.update({ version: 1, gateway: { host: '0.0.0.0' } })).rejects.toBeInstanceOf(
      ConfigError,
    );
    expect(store.get().gateway.port).toBe(9999);
    expect(store.get().gateway.host).toBe('127.0.0.1');
  });

  it('persists atomically, leaving no temp files behind', async () => {
    await useTempStateDir();
    const store = new ConfigStore();
    await store.load();
    await store.mutate((draft) => {
      draft.gateway.port = 9000;
      return draft;
    });

    const { readdir } = await import('node:fs/promises');
    const files = await readdir(stateDir());
    expect(files.filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(files).toContain('config.json');
  });

  it('refuses to get before load', () => {
    const store = new ConfigStore();
    expect(() => store.get()).toThrow(ConfigError);
  });

  it('stores the configuration file under the local app data directory', async () => {
    await useTempStateDir();
    expect(configPath().startsWith(stateDir())).toBe(true);
    expect(configPath()).toBe(join(stateDir(), 'config.json'));
  });
});
