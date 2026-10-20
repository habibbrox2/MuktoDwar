/**
 * Configuration store.
 *
 * Loads the configuration from disk, validates it, and writes it back
 * atomically. The store keeps an in-memory copy so that the router sees a
 * consistent snapshot while a request is in flight.
 */

import { atomicWriteFile, configPath, readFileIfExists, restrictToCurrentUser } from './paths.js';
import { ConfigError, defaultConfig, parseConfig } from './schema.js';
import type { GatewayConfig } from './schema.js';

/** A configuration store backed by a JSON file. */
export class ConfigStore {
  private current: GatewayConfig | null = null;

  /**
   * Load the configuration, creating a default document on first run.
   */
  async load(): Promise<GatewayConfig> {
    const raw = await readFileIfExists(configPath());
    if (raw === null) {
      this.current = defaultConfig();
      await this.persist(this.current);
      return this.current;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ConfigError('The configuration file is not valid JSON.');
    }
    this.current = parseConfig(parsed);
    return this.current;
  }

  /** The loaded configuration. Throws when the store has not been loaded. */
  get(): GatewayConfig {
    if (!this.current) {
      throw new ConfigError('The configuration has not been loaded.');
    }
    return this.current;
  }

  /** Replace the configuration and persist it. */
  async update(next: unknown): Promise<GatewayConfig> {
    const validated = parseConfig(next);
    this.current = validated;
    await this.persist(validated);
    return validated;
  }

  /** Apply a change to the current configuration. */
  async mutate(mutator: (config: GatewayConfig) => GatewayConfig | void): Promise<GatewayConfig> {
    const draft = structuredClone(this.get());
    const result = mutator(draft) ?? draft;
    return this.update(result);
  }

  /** Write the configuration to disk atomically. */
  private async persist(config: GatewayConfig): Promise<void> {
    await atomicWriteFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, 0o600);
    await restrictToCurrentUser(configPath());
  }
}
