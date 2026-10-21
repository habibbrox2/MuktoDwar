/**
 * Refresh the free-model snapshot from the models.dev catalogue.
 *
 * models.dev publishes every model it knows about together with its price.
 * A model whose input *and* output price are zero is free, which is exactly
 * the property this gateway is built on: it only ever routes to free models.
 *
 * The script writes a generated TypeScript module so the build never needs
 * network access, and so the provenance of every id stays in the repository.
 *
 * Usage: npm run sync:models
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'src', 'providers', 'models-dev.generated.ts');

const SOURCE_URL = 'https://models.dev/api.json';

/**
 * Provider kinds and the models.dev provider that describes them.
 *
 * A kind without an entry is left alone: models.dev has no OpenAI
 * compatible catalogue for it, or its models are local and depend on what
 * the administrator has loaded.
 *
 * Poolside and ZenMux are deliberately absent. Poolside's price catalogue
 * describes the OpenRouter ids, while the hosted endpoint the gateway
 * talks to serves a different, documented set of ids. ZenMux publishes its
 * own public catalogue, and models.dev still lists four ids that provider
 * has already retired.
 */
const PROVIDER_MAP = {
  kilo: 'kilo',
  opencode: 'opencode',
  opencodego: 'opencode-go',
  openrouter: 'openrouter',
  requesty: 'requesty',
  groq: 'groq',
  sambanova: 'sambanova',
  siliconflow: 'siliconflow',
  anyapi: 'anyapi',
  cloudflare: 'cloudflare-workers-ai',
};

/** A model as the catalogue describes it. */
function readModels(api) {
  const providers = api;
  const entries = [];

  for (const [kind, providerId] of Object.entries(PROVIDER_MAP)) {
    const provider = providers[providerId];
    if (!provider) {
      entries.push({ kind, providerId, models: [] });
      continue;
    }
    const free = Object.values(provider.models ?? {})
      .filter((model) => isFree(model))
      .filter((model) => model.status !== 'deprecated')
      .map((model) => ({
        id: model.id,
        contextWindow: model.limit?.context,
        maxOutputTokens: model.limit?.output,
      }))
      .filter((model) => typeof model.id === 'string' && model.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
    entries.push({ kind, providerId, models: free });
  }

  return entries;
}

/**
 * True when the model is free.
 *
 * Both directions must be zero. A model with a price on either side is not
 * free, and a model with no price at all is unknown, so it is not free
 * either.
 */
function isFree(model) {
  const cost = model?.cost;
  if (!cost) return false;
  return cost.input === 0 && cost.output === 0;
}

/** Render the generated module. */
function renderModule(entries, retrievedAt) {
  const lines = [];
  lines.push('/**');
  lines.push(' * Free models per provider, taken from the models.dev catalogue.');
  lines.push(' *');
  lines.push(' * GENERATED FILE - do not edit by hand.');
  lines.push(' * Run `npm run sync:models` to refresh it.');
  lines.push(' *');
  lines.push(` * Source: ${SOURCE_URL}`);
  lines.push(` * Retrieved: ${retrievedAt}`);
  lines.push(' */');
  lines.push('');
  lines.push('/** One free model, as the catalogue records it. */');
  lines.push('export interface ModelsDevModel {');
  lines.push('  readonly id: string;');
  lines.push('  readonly contextWindow?: number;');
  lines.push('  readonly maxOutputTokens?: number;');
  lines.push('}');
  lines.push('');
  lines.push('/** Where the snapshot came from. */');
  lines.push(`export const MODELS_DEV_SOURCE = '${SOURCE_URL}';`);
  lines.push('');
  lines.push('/** The day the snapshot was retrieved. */');
  lines.push(`export const MODELS_DEV_RETRIEVED_AT = '${retrievedAt}';`);
  lines.push('');
  lines.push('/** The free models of every provider kind, keyed by kind. */');
  lines.push('export const MODELS_DEV_PROVIDERS: Record<string, readonly ModelsDevModel[]> = {');
  for (const entry of entries) {
    lines.push(`  ${entry.kind}: [`);
    for (const model of entry.models) {
      const parts = [`id: ${JSON.stringify(model.id)}`];
      if (typeof model.contextWindow === 'number') parts.push(`contextWindow: ${model.contextWindow}`);
      if (typeof model.maxOutputTokens === 'number') parts.push(`maxOutputTokens: ${model.maxOutputTokens}`);
      lines.push(`    { ${parts.join(', ')} },`);
    }
    lines.push('  ],');
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const response = await fetch(SOURCE_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`The catalogue could not be downloaded: HTTP ${response.status}.`);
  }
  const api = await response.json();
  const entries = readModels(api);
  const retrievedAt = new Date().toISOString().slice(0, 10);

  writeFileSync(outFile, renderModule(entries, retrievedAt), 'utf8');

  let total = 0;
  console.log(`models.dev snapshot written to ${outFile}`);
  console.log(`source: ${SOURCE_URL}`);
  console.log(`retrieved: ${retrievedAt}`);
  console.log('');
  for (const entry of entries) {
    total += entry.models.length;
    console.log(`  ${entry.kind.padEnd(14)} -> ${entry.providerId.padEnd(22)} ${entry.models.length} free model(s)`);
  }
  console.log('');
  console.log(`${total} free model(s) in total.`);
}

await main();
