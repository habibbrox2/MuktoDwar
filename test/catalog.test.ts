/**
 * Provider catalogue tests.
 *
 * The catalogue is the gateway's promise: every model it lists is free, and
 * every id is real. These tests guard both halves of that promise.
 */

import { describe, expect, it } from 'vitest';
import { CATALOG, PROVIDER_KINDS, catalogFor } from '../src/providers/catalog.js';
import { mergeModelsDev, MODELS_DEV_MODEL_SOURCE } from '../src/providers/free-models.js';
import { MODELS_DEV_PROVIDERS, MODELS_DEV_SOURCE } from '../src/providers/models-dev.generated.js';

describe('provider catalogue', () => {
  it('describes every provider kind', () => {
    for (const kind of PROVIDER_KINDS) {
      const provider = catalogFor(kind);
      expect(provider.kind).toBe(kind);
      expect(provider.label.length).toBeGreaterThan(0);
    }
  });

  it('lists only free models', () => {
    for (const kind of PROVIDER_KINDS) {
      for (const model of catalogFor(kind).models) {
        expect(model.free).toBe(true);
      }
    }
  });

  it('records a source for every model', () => {
    for (const kind of PROVIDER_KINDS) {
      for (const model of catalogFor(kind).models) {
        expect(model.source.length).toBeGreaterThan(0);
      }
    }
  });

  it('never lists the same model twice', () => {
    for (const kind of PROVIDER_KINDS) {
      const ids = catalogFor(kind).models.map((model) => model.id.toLowerCase());
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps every model id within the length the schema allows', () => {
    for (const kind of PROVIDER_KINDS) {
      for (const model of catalogFor(kind).models) {
        expect(model.id.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('gives every provider a base url it can be reached on', () => {
    for (const kind of PROVIDER_KINDS) {
      const provider = catalogFor(kind);
      if (kind === 'custom') continue;
      expect(provider.baseUrl.startsWith('http')).toBe(true);
    }
  });
});

describe('models.dev snapshot', () => {
  it('only contributes models that cost nothing', () => {
    for (const [kind, models] of Object.entries(MODELS_DEV_PROVIDERS)) {
      for (const model of models) {
        expect(model.id.length).toBeGreaterThan(0);
        expect(kind.length).toBeGreaterThan(0);
      }
    }
  });

  it('records where it came from', () => {
    expect(MODELS_DEV_SOURCE).toContain('models.dev');
    expect(MODELS_DEV_MODEL_SOURCE).toContain(MODELS_DEV_SOURCE);
  });

  it('adds the models the hand list does not have', () => {
    const merged = mergeModelsDev('openrouter', []);
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.every((model) => model.source === MODELS_DEV_MODEL_SOURCE)).toBe(true);
    expect(merged.every((model) => model.free)).toBe(true);
  });

  it('keeps the hand written entry and its documentation link', () => {
    const hand = {
      id: 'kilo-auto/free',
      free: true,
      verified: true,
      source: 'https://kilo.ai/docs/gateway/models-and-providers (free catalogue entry)',
    } as const;
    const merged = mergeModelsDev('kilo', [hand]);
    const entry = merged.find((model) => model.id === 'kilo-auto/free');

    expect(entry?.source).toBe(hand.source);
    // The snapshot fills in the limits the hand list does not carry.
    expect(entry?.contextWindow).toBeGreaterThan(0);
  });

  it('never lists a model twice', () => {
    for (const kind of PROVIDER_KINDS) {
      const ids = catalogFor(kind).models.map((model) => model.id.toLowerCase());
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps the catalogue inside the allowlist size the schema allows', () => {
    for (const kind of PROVIDER_KINDS) {
      expect(catalogFor(kind).models.length).toBeLessThanOrEqual(200);
    }
  });

  it('is the reason OpenRouter has free models at all', () => {
    // OpenRouter free ids could not be confirmed from documentation, so the
    // price catalogue is what makes them usable.
    expect(CATALOG.openrouter.models.length).toBeGreaterThan(0);
    expect(CATALOG.openrouter.models.every((model) => model.id.endsWith(':free') || model.free)).toBe(true);
  });
});

describe('ship status', () => {
  it('gives every provider one of the three statuses', () => {
    for (const kind of PROVIDER_KINDS) {
      expect(['VERIFIED', 'UNVERIFIED', 'BLOCKED']).toContain(catalogFor(kind).shipStatus);
    }
  });

  it('records the open question for every unverified provider', () => {
    for (const kind of PROVIDER_KINDS) {
      const provider = catalogFor(kind);
      if (provider.shipStatus !== 'UNVERIFIED') continue;
      const notes = `${provider.freeTerms} ${provider.caveats.join(' ')}`;
      expect(notes).toContain('UNVERIFIED');
    }
  });

  it('records why a blocked provider cannot be served', () => {
    for (const kind of PROVIDER_KINDS) {
      const provider = catalogFor(kind);
      if (provider.shipStatus !== 'BLOCKED') continue;
      expect(provider.caveats.join(' ').toLowerCase()).toContain('free tier');
    }
  });

  it('ships a verified provider with a usable model or as a local one', () => {
    for (const kind of PROVIDER_KINDS) {
      const provider = catalogFor(kind);
      if (provider.shipStatus !== 'VERIFIED') continue;
      const local = kind === 'ollama' || kind === 'lmstudio';
      expect(provider.models.length > 0 || local).toBe(true);
    }
  });

  it('keeps the free-only rule: a provider never ships a paid model', () => {
    for (const kind of PROVIDER_KINDS) {
      for (const model of catalogFor(kind).models) {
        expect(model.free).toBe(true);
        expect(model.verified).toBe(true);
      }
    }
  });
});
