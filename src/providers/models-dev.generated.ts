/**
 * Free models per provider, taken from the models.dev catalogue.
 *
 * GENERATED FILE - do not edit by hand.
 * Run `npm run sync:models` to refresh it.
 *
 * Source: https://models.dev/api.json
 * Retrieved: 2026-10-21
 */

/** One free model, as the catalogue records it. */
export interface ModelsDevModel {
  readonly id: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
}

/** Where the snapshot came from. */
export const MODELS_DEV_SOURCE = 'https://models.dev/api.json';

/** The day the snapshot was retrieved. */
export const MODELS_DEV_RETRIEVED_AT = '2026-10-21';

/** The free models of every provider kind, keyed by kind. */
export const MODELS_DEV_PROVIDERS: Record<string, readonly ModelsDevModel[]> = {
  kilo: [
    { id: "cohere/north-mini-code:free", contextWindow: 256000, maxOutputTokens: 64000 },
    { id: "dots-studio/dots-3-note-preview:free", contextWindow: 512000, maxOutputTokens: 460800 },
    { id: "google/lyria-3-clip-preview", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "google/lyria-3-pro-preview", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "kilo-auto/free", contextWindow: 256000, maxOutputTokens: 32768 },
    { id: "liquid/lfm-2.5-2.6b:free", contextWindow: 65536, maxOutputTokens: 8192 },
    { id: "minimax/minimax-m3.1-flash:free", contextWindow: 1000000, maxOutputTokens: 524288 },
    { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", contextWindow: 256000, maxOutputTokens: 65536 },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", contextWindow: 262144, maxOutputTokens: 235929 },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", contextWindow: 1000000, maxOutputTokens: 65536 },
    { id: "nvidia/nemotron-3.5-content-safety:free", contextWindow: 128000, maxOutputTokens: 8192 },
    { id: "nvidia/nemotron-3.5-lightning:free", contextWindow: 1000000, maxOutputTokens: 65536 },
    { id: "nvidia/nemotron-3.5-super-vl:free", contextWindow: 1000000, maxOutputTokens: 131072 },
    { id: "openrouter/auto", contextWindow: 2000000, maxOutputTokens: 32768 },
    { id: "openrouter/bodybuilder", contextWindow: 128000, maxOutputTokens: 32768 },
    { id: "openrouter/free", contextWindow: 200000, maxOutputTokens: 32768 },
    { id: "openrouter/pareto-code", contextWindow: 200000, maxOutputTokens: 65536 },
    { id: "poolside/laguna-s-2.1:free", contextWindow: 262144, maxOutputTokens: 32768 },
    { id: "poolside/laguna-xs-2.1:free", contextWindow: 262144, maxOutputTokens: 32768 },
    { id: "reflection/beam-free", contextWindow: 1048576, maxOutputTokens: 131072 },
    { id: "stealth/glyph-cluster", contextWindow: 256000, maxOutputTokens: 256000 },
    { id: "xingchen-agi/xing4.0-29b-a4b:free", contextWindow: 262144, maxOutputTokens: 235929 },
  ],
  opencode: [
    { id: "beam-free", contextWindow: 1048576, maxOutputTokens: 131072 },
    { id: "big-pickle", contextWindow: 200000, maxOutputTokens: 32000 },
    { id: "deepseek-v4.1-flash-free", contextWindow: 200000, maxOutputTokens: 32000 },
    { id: "glm-5.3-flash-free", contextWindow: 200000, maxOutputTokens: 32000 },
    { id: "longcat-2.5-preview-free", contextWindow: 1000000, maxOutputTokens: 131072 },
    { id: "mimo-v2.6-flash-free", contextWindow: 200000, maxOutputTokens: 32000 },
    { id: "minimax-m3.1-flash-free", contextWindow: 1000000, maxOutputTokens: 512000 },
    { id: "nemotron-3-ultra-free", contextWindow: 1000000, maxOutputTokens: 128000 },
    { id: "nemotron-3.5-lightning-free", contextWindow: 262144, maxOutputTokens: 262144 },
    { id: "nemotron-3.5-super-vl-free", contextWindow: 1048576, maxOutputTokens: 131072 },
  ],
  opencodego: [
    { id: "beam-free", contextWindow: 1048576, maxOutputTokens: 131072 },
    { id: "longcat-2.5-preview-free", contextWindow: 1000000, maxOutputTokens: 131072 },
    { id: "minimax-m3.1-flash-free", contextWindow: 1000000, maxOutputTokens: 512000 },
  ],
  openrouter: [
    { id: "cohere/north-mini-code:free", contextWindow: 256000, maxOutputTokens: 64000 },
    { id: "google/gemma-4-26b-a4b-it:free", contextWindow: 262144, maxOutputTokens: 32768 },
    { id: "google/gemma-4-31b-it:free", contextWindow: 262144, maxOutputTokens: 32768 },
    { id: "google/lyria-3-clip-preview", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "google/lyria-3-pro-preview", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "liquid/lfm-2.5-2.6b:free", contextWindow: 65536, maxOutputTokens: 8192 },
    { id: "minimax/minimax-m3.1-flash:free", contextWindow: 1000000, maxOutputTokens: 524288 },
    { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", contextWindow: 256000, maxOutputTokens: 65536 },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", contextWindow: 262144, maxOutputTokens: 235929 },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", contextWindow: 1000000, maxOutputTokens: 65536 },
    { id: "nvidia/nemotron-3.5-content-safety:free", contextWindow: 128000, maxOutputTokens: 8192 },
    { id: "nvidia/nemotron-3.5-lightning:free", contextWindow: 1000000, maxOutputTokens: 65536 },
    { id: "nvidia/nemotron-3.5-super-vl:free", contextWindow: 1000000, maxOutputTokens: 131072 },
    { id: "openrouter/free", contextWindow: 200000, maxOutputTokens: 8000 },
    { id: "thinkingmachines/inkling-small:free", contextWindow: 1048576, maxOutputTokens: 262144 },
    { id: "thinkingmachines/inkling:free", contextWindow: 1048576, maxOutputTokens: 262144 },
    { id: "xingchen-agi/xing4.0-29b-a4b:free", contextWindow: 262144, maxOutputTokens: 235929 },
  ],
  requesty: [
    { id: "gemma-4-31b-it", contextWindow: 262144, maxOutputTokens: 8192 },
    { id: "leanstral-1-5", contextWindow: 262144, maxOutputTokens: 32768 },
    { id: "leanstral-1-5@eu", contextWindow: 262144, maxOutputTokens: 32768 },
    { id: "ling-3.0-tiny", contextWindow: 262144, maxOutputTokens: 32768 },
    { id: "muse-glimmer-30b", contextWindow: 131072, maxOutputTokens: 20480 },
    { id: "nemotron-3-nano-omni-30b-a3b-reasoning", contextWindow: 131072, maxOutputTokens: 20480 },
    { id: "nemotron-3-super-120b-a12b", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "nemotron-3-ultra-550b-a55b", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "nemotron-3.5-content-safety", contextWindow: 131072, maxOutputTokens: 8192 },
    { id: "nemotron-3.5-lightning-30b-a3b", contextWindow: 1048576, maxOutputTokens: 65536 },
  ],
  groq: [
    { id: "allam-2-7b", contextWindow: 4096, maxOutputTokens: 4096 },
  ],
  sambanova: [
  ],
  siliconflow: [
  ],
  anyapi: [
  ],
  cloudflare: [
  ],
};
