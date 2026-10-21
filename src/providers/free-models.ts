/**
 * The models.dev free-model snapshot.
 *
 * The catalogue records what was confirmed by hand against official
 * documentation. The models.dev catalogue adds a second, machine-readable
 * confirmation: it publishes every model with its price, and a model whose
 * input *and* output price are zero is free.
 *
 * Both lists are merged here. The hand-written entries keep their own
 * provenance; the snapshot adds the models it knows to be free, with the
 * snapshot itself recorded as the source.
 */

import {
  MODELS_DEV_PROVIDERS,
  MODELS_DEV_RETRIEVED_AT,
  MODELS_DEV_SOURCE,
} from './models-dev.generated.js';
import type { CatalogModel } from './catalog.js';
import type { ProviderKind } from '../config/schema.js';

/** The source string recorded for every model taken from the snapshot. */
export const MODELS_DEV_MODEL_SOURCE = `${MODELS_DEV_SOURCE} (price 0, retrieved ${MODELS_DEV_RETRIEVED_AT})`;

/**
 * Merge the hand-confirmed models with the models.dev snapshot.
 *
 * A model that both lists know keeps its hand-written entry, because that
 * entry carries the documentation link; the snapshot only fills in the
 * context window and the output limit when the hand list has none. The
 * snapshot contributes the models the hand list does not have, with the
 * snapshot itself recorded as the source.
 */
export function mergeModelsDev(
  kind: ProviderKind,
  models: readonly CatalogModel[],
): readonly CatalogModel[] {
  const snapshot = MODELS_DEV_PROVIDERS[kind];
  if (!snapshot || snapshot.length === 0) return models;

  const byId = new Map(snapshot.map((model) => [model.id.toLowerCase(), model]));
  const known = new Set(models.map((model) => model.id.toLowerCase()));
  const merged: CatalogModel[] = [];
  const added: CatalogModel[] = [];

  for (const model of models) {
    const match = byId.get(model.id.toLowerCase());
    if (!match) {
      merged.push(model);
      continue;
    }
    const contextWindow = model.contextWindow ?? match.contextWindow;
    const maxOutputTokens = model.maxOutputTokens ?? match.maxOutputTokens;
    merged.push({
      ...model,
      ...(contextWindow !== undefined ? { contextWindow } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    });
  }

  for (const entry of snapshot) {
    if (known.has(entry.id.toLowerCase())) continue;
    known.add(entry.id.toLowerCase());
    added.push({
      id: entry.id,
      free: true,
      verified: true,
      ...(typeof entry.contextWindow === 'number' ? { contextWindow: entry.contextWindow } : {}),
      ...(typeof entry.maxOutputTokens === 'number' ? { maxOutputTokens: entry.maxOutputTokens } : {}),
      source: MODELS_DEV_MODEL_SOURCE,
    });
  }

  return [...merged, ...added];
}

/**
 * True when the snapshot knows this provider kind.
 *
 * The console uses this to tell the administrator where a model list came
 * from.
 */
export function hasModelsDevSnapshot(kind: ProviderKind): boolean {
  return (MODELS_DEV_PROVIDERS[kind]?.length ?? 0) > 0;
}
