/**
 * Built-in provider catalog.
 *
 * This module holds the *verified* facts about each provider: its base URL,
 * its OpenAI compatibility notes, and the models whose free status was
 * confirmed against official documentation.
 *
 * Three rules govern this file:
 *  1. Nothing here is enabled by default, except a keyless free tier that
 *     works without any credential. The administrator must add a provider,
 *     supply a key when one is needed, and allowlist the models they want.
 *  2. A model is only listed when its free status was confirmed from an
 *     official source, and the source is recorded alongside it.
 *  3. The models.dev price catalogue is merged in as a second source. A
 *     model whose input *and* output price are zero is free; the snapshot
 *     and its retrieval date are recorded on every entry it contributes.
 *
 * Documentation URLs and the verification date are kept in
 * `docs/providers/`. The `verified` flag means "confirmed free on the date
 * recorded in the source", never "will always be free".
 */

import type { ProviderKind } from '../config/schema.js';
import { mergeModelsDev } from './free-models.js';

/** Verification date for the entries in this catalog. */
export const CATALOG_VERIFIED_ON = '2026-10-21';

/** A model the catalog knows to be free. */
export interface CatalogModel {
  readonly id: string;
  readonly free: true;
  readonly verified: true;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  /** Official documentation that establishes the free status. */
  readonly source: string;
}

/** Static facts about a provider. */
export interface CatalogProvider {
  readonly kind: ProviderKind;
  readonly label: string;
  /** OpenAI-compatible base URL. */
  readonly baseUrl: string;
  /**
   * Where the provider publishes its model list.
   *
   * Defaults to the base URL plus `/models`. Providers whose catalogue
   * lives somewhere else set this explicitly.
   */
  readonly modelsUrl?: string;
  /** Whether a key is required for the free models. */
  readonly requiresKey: boolean;
  /** Whether the free tier can be used without adding a payment method. */
  readonly freeWithoutCard: boolean;
  /** How the free tier is metered, in plain words. */
  readonly freeTerms: string;
  /** Compatibility notes that affect request shaping. */
  readonly caveats: readonly string[];
  /** Models confirmed free, with their sources. */
  readonly models: readonly CatalogModel[];
  /** Official documentation entry point. */
  readonly docsUrl: string;
  /**
   * How the provider ships.
   *
   * `VERIFIED` means all three of these hold at the verification date: a
   * free tier exists, the official documentation says whether a payment
   * method is needed, and the free model ids are documented.
   * `UNVERIFIED` means one of them is still open, so the provider ships
   * disabled. `BLOCKED` means the free tier exists but refuses calls from
   * outside the provider's own client, so it cannot be served from this
   * gateway at all.
   */
  readonly shipStatus: ShipStatus;
}

/** How a provider ships. */
export type ShipStatus = 'VERIFIED' | 'UNVERIFIED' | 'BLOCKED';

/**
 * Provider definitions.
 *
 * Providers marked `unverified: true` ship disabled and without a confirmed
 * model list, because their free status could not be confirmed from official
 * documentation at the verification date.
 *
 * The verification date is the honest answer to "when was this last
 * checked"; the sources behind each entry are in `docs/providers.md`.
 */
export const CATALOG: Record<ProviderKind, CatalogProvider> = {
  gemini: {
    kind: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms: 'Free tier is the default for new projects; linking billing is what upgrades to Paid.',
    caveats: [
      'The OpenAI compatibility layer may silently ignore unsupported parameters.',
      'Gemini-specific options must be passed through `extra_body`.',
      'Free-tier input and output tokens are free of charge; paid-tier prices are listed separately.',
    ],
    models: [
      {
        id: 'gemini-3.8-flash',
        free: true,
        verified: true,
        contextWindow: 1_048_576,
        source: 'https://ai.google.dev/gemini-api/docs/pricing (Free Tier: input/output "Free of charge")',
      },
      {
        id: 'gemini-3.6-flash',
        free: true,
        verified: true,
        source: 'https://ai.google.dev/gemini-api/docs/pricing (Free Tier)',
      },
      {
        id: 'gemini-3.5-flash-lite',
        free: true,
        verified: true,
        source: 'https://ai.google.dev/gemini-api/docs/pricing (Free Tier)',
      },
    ],
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    shipStatus: 'VERIFIED',
  },

  groq: {
    kind: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'A Free tier exists. A payment method is only required to upgrade to the Developer tier, so free use needs no card.',
    caveats: [
      'The API is "mostly" OpenAI-compatible: `logprobs`, `logit_bias`, `top_logprobs` and `messages[].name` return HTTP 400.',
      '`n` must be 1.',
      'A temperature of 0 is converted to 1e-8.',
      'Rate limits apply per organization, not per user.',
      'Additional free ids come from the models.dev price catalogue (a model is free when its input and output price are zero). The snapshot and its date are recorded on every model it contributes.',
    ],
    models: mergeModelsDev('groq', [
      {
        id: 'llama-3.3-70b-versatile',
        free: true,
        verified: true,
        contextWindow: 131_072,
        maxOutputTokens: 32_768,
        source: 'https://console.groq.com/docs/models (Free tier access; production model)',
      },
      {
        id: 'llama-3.1-8b-instant',
        free: true,
        verified: true,
        contextWindow: 131_072,
        source: 'https://console.groq.com/docs/models (Free tier access; production model)',
      },
      {
        id: 'openai/gpt-oss-120b',
        free: true,
        verified: true,
        contextWindow: 131_072,
        maxOutputTokens: 65_536,
        source: 'https://console.groq.com/docs/models (Free tier access; production model)',
      },
      {
        id: 'openai/gpt-oss-20b',
        free: true,
        verified: true,
        contextWindow: 131_072,
        maxOutputTokens: 65_536,
        source: 'https://console.groq.com/docs/models (Free tier access; production model)',
      },
      {
        id: 'qwen/qwen3.8-27b',
        free: true,
        verified: true,
        contextWindow: 131_072,
        maxOutputTokens: 16_384,
        source: 'https://console.groq.com/docs/models (Free tier access; preview model)',
      },
    ]),
    docsUrl: 'https://console.groq.com/docs/openai',
    shipStatus: 'VERIFIED',
  },

  mistral: {
    kind: 'mistral',
    label: 'Mistral (La Plateforme)',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'Free mode is the default: API access is enabled by default with no credit card required, and the numeric quota is administered in the organisation limits page rather than published as a static table. Which chat models that mode allows at $0 is UNVERIFIED: none is priced at zero.',
    caveats: [
      'Free-mode per-model quotas are not published in the documentation and must be read from the organisation limits page.',
      'No chat model is priced at zero: the official pricing page lists only Mistral Moderation 2 as free, and that model serves /v1/moderations rather than chat.',
      'The models used by the Free-mode quickstart (mistral-small-latest, mistral-large-latest) are paid models, so no model id ships allowlisted for this provider.',
    ],
    models: [],
    docsUrl: 'https://docs.mistral.ai/api/endpoint/chat',
    shipStatus: 'UNVERIFIED',
  },

  sambanova: {
    kind: 'sambanova',
    label: 'SambaNova SambaCloud',
    baseUrl: 'https://api.sambanova.ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'The Free Tier is the tier that applies when no payment method is linked. Documented per-model limits are 20 RPM, 20 RPD and 200,000 TPD.',
    caveats: [
      '`presence_penalty` and `frequency_penalty` are ignored.',
      '`n` accepts 1-8, but values above 1 cannot be combined with tools or function calling.',
      '`system_fingerprint` is not returned.',
    ],
    models: mergeModelsDev('sambanova', [
      {
        id: 'DeepSeek-V3.1',
        free: true,
        verified: true,
        source: 'https://docs.sambanova.ai/docs/en/models/rate-limits (Free Tier, no payment method linked)',
      },
      {
        id: 'Meta-Llama-3.3-70B-Instruct',
        free: true,
        verified: true,
        source: 'https://docs.sambanova.ai/docs/en/models/rate-limits (Free Tier, no payment method linked)',
      },
      {
        id: 'gpt-oss-120b',
        free: true,
        verified: true,
        source: 'https://docs.sambanova.ai/docs/en/models/sambacloud-models (Free Tier)',
      },
    ]),
    docsUrl: 'https://docs.sambanova.ai/docs/en/features/openai-compatibility',
    shipStatus: 'VERIFIED',
  },

  openrouter: {
    kind: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'The Free plan needs no payment method: the pricing table lists "Payment options: No" for it. Free models are rate limited to 20 requests per minute and 50 per day, rising to 1,000 per day once the account has bought at least $10 of credits.',
    caveats: [
      'Only `:free` variants are free. A fallback that resolves to a paid model would incur charges, so paid fallbacks are disabled in this gateway.',
      'The free catalogue changes over time; the allowlist is administrator-controlled for exactly this reason.',
      'Failed attempts count towards the daily free cap, and a negative balance blocks free models until credits are added.',
      'The Free Models Router id openrouter/free only ever falls back to other free models.',
    ],
    models: mergeModelsDev('openrouter', [
      { id: 'openrouter/free', free: true, verified: true, source: 'https://openrouter.ai/docs/guides/routing/routers/free-router (free router id, 2026-10-21)' },
      { id: 'cohere/north-mini-code:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'dots-studio/dots-3-note-preview:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'google/gemma-4-26b-a4b-it:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'google/gemma-4-31b-it:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'liquid/lfm-2.5-2.6b:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'minimax/minimax-m3.1-flash:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'nvidia/nemotron-3.5-content-safety:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'nvidia/nemotron-3.5-lightning:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'nvidia/nemotron-3.5-super-vl:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'poolside/laguna-s-2.1:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'poolside/laguna-xs-2.1:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'thinkingmachines/inkling-small:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'thinkingmachines/inkling:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
      { id: 'xingchen-agi/xing4.0-29b-a4b:free', free: true, verified: true, source: 'https://openrouter.ai/api/v1/models (official catalogue, :free variant, 2026-10-21)' },
    ]),
    docsUrl: 'https://openrouter.ai/docs/guides/routing/model-variants/free',
    shipStatus: 'VERIFIED',
  },

  kilo: {
    kind: 'kilo',
    label: 'Kilo AI Gateway',
    baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
    requiresKey: false,
    freeWithoutCard: true,
    freeTerms:
      'Free requests are available to anonymous callers at 200 requests per hour per IP. A key is optional and only raises attribution, not access.',
    caveats: [
      'The free catalogue changes; entries such as `kilo-auto/free` select dynamically from the free candidates.',
      'Some upstream free models may log prompts to improve them; NVIDIA free endpoints are trial-use only.',
      'Additional free ids come from the models.dev price catalogue (a model is free when its input and output price are zero). The snapshot and its date are recorded on every model it contributes.',
    ],
    models: mergeModelsDev('kilo', [
      {
        id: 'kilo-auto/free',
        free: true,
        verified: true,
        source: 'https://kilo.ai/docs/gateway/models-and-providers (free catalogue entry)',
      },
    ]),
    docsUrl: 'https://kilo.ai/docs/gateway',
    shipStatus: 'VERIFIED',
  },

  opencode: {
    kind: 'opencode',
    label: 'OpenCode Console (Zen)',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    // The model list is not published next to the chat endpoint.
    modelsUrl: 'https://opencode.ai/inference/v1/models',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'The Console lists 14 models at a price of Free. They are free "for a limited time", so the free status is temporary by the provider\'s own wording.',
    caveats: [
      'A Console API key is required. The keyless path is refused: the upstream answers HTTP 403 with "OpenCode\'s free tier can only be used from within OpenCode". The documentation does describe these endpoints for "another coding agent", so a key is the way in.',
      'The documented way to get a key is to sign in, add billing details and credits, and copy the key. Whether a key can be created on an empty balance without a payment method is not documented.',
      'Paid models fail with HTTP 402 once the balance reaches zero. The free models cost $0, so they are the only ones that belong behind this gateway.',
      'Console is not OpenAI-only across all models: GPT uses Responses, Claude/Qwen use Anthropic Messages, and Gemini uses its own API path.',
      'Free status is temporary by the provider\'s own wording, and the free models are dropped from the catalogue over time.',
      'Some free models keep the prompts for 30 days, and the NVIDIA free endpoints are trial use only.',
      'Additional free ids come from the models.dev price catalogue (a model is free when its input and output price are zero). The snapshot and its date are recorded on every model it contributes.',
    ],
    models: mergeModelsDev('opencode', [
      { id: 'big-pickle', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'glm-5.3-flash-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'deepseek-v4.1-flash-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'minimax-m3.1-flash-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'beam-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'll-alpha-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'longcat-2.5-preview-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'exo-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'mimo-v2.6-flash-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'mimo-v2.5-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'nemotron-3-ultra-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'nemotron-3.5-lightning-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'nemotron-3.5-super-vl-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
      { id: 'jev-1.13-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/models/ (priced Free, 2026-10-21)' },
    ]),
    docsUrl: 'https://opencode.ai/v2/docs/console/models/',
    shipStatus: 'VERIFIED',
  },

  opencodego: {
    kind: 'opencodego',
    label: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    // The model list is not published next to the chat endpoint.
    modelsUrl: 'https://opencode.ai/inference/go/v1/models',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Go is a subscription: $10 a month for Go and $40 for Go Plus. Three models inside it are priced Free with an unlimited monthly allowance, and the documentation says the free models stay usable when the usage limit is reached.',
    caveats: [
      'A Go subscription is the price of entry, so the account is not free even though the three models below are.',
      'Beam Free is not available in a long list of countries and regions, including China, Russia, Iran and Syria.',
      'The free models are free "for a limited time".',
      'The gateway sends OpenAI chat completions only, so the models that live behind the Anthropic or the Responses endpoints are not reachable from here.',
    ],
    models: mergeModelsDev('opencodego', [
      { id: 'minimax-m3.1-flash-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/go/ (priced Free, unlimited monthly limit, 2026-10-21)' },
      { id: 'longcat-2.5-preview-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/go/ (priced Free, unlimited monthly limit, 2026-10-21)' },
      { id: 'beam-free', free: true, verified: true, source: 'https://opencode.ai/v2/docs/console/go/ (priced Free, unlimited monthly limit, 2026-10-21)' },
    ]),
    docsUrl: 'https://opencode.ai/v2/docs/console/go/',
    shipStatus: 'VERIFIED',
  },

  zenmux: {
    kind: 'zenmux',
    label: 'ZenMux',
    baseUrl: 'https://zenmux.ai/api/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Seven models in the official catalogue are priced at zero, so calling them costs nothing. The account is not free: Pay As You Go runs on a prepaid balance (top-ups start at $5 through Stripe or Alipay) and the Builder Plan is a subscription from $20 a month.',
    caveats: [
      'An API key is required. A keyless chat call answers HTTP 403 with access_denied; only the model list is public.',
      'Pay As You Go has no rate limit. The Builder Plan is limited to 10-15 RPM and a weekly quota, and its terms forbid production use.',
      'The zero-price list is read from the public catalogue (GET /api/v1/models) and changes as providers add and retire free models.',
      'Two more models are priced at zero but generate images (inclusionai/ming-image-0.1-design and inclusionai/ming-image-0.1-design-layer). They are not pre-allowlisted because they belong on the image endpoint.',
      'ZenMux is deliberately not taken from the models.dev snapshot: that catalogue still lists four ids the provider has retired (moonshotai/kimi-k3-free, moonshotai/kimi-k2.7-code-free, anthropic/claude-sonnet-5-free and stepfun/step-3.7-flash-free).',
    ],
    models: [
      { id: 'z-ai/glm-4.7-flash-free', free: true, verified: true, contextWindow: 200000, maxOutputTokens: 128000, source: 'https://zenmux.ai/api/v1/models (official catalogue, prompt and completion priced 0, 2026-10-21)' },
      { id: 'z-ai/glm-4.6v-flash-free', free: true, verified: true, contextWindow: 200000, maxOutputTokens: 128000, source: 'https://zenmux.ai/api/v1/models (official catalogue, prompt and completion priced 0, 2026-10-21)' },
      { id: 'atria-asi/atria-dawn', free: true, verified: true, contextWindow: 524288, maxOutputTokens: 65536, source: 'https://zenmux.ai/api/v1/models (official catalogue, prompt and completion priced 0, 2026-10-21)' },
      { id: 'atria-asi/atria-dawn-preview', free: true, verified: true, contextWindow: 262144, maxOutputTokens: 65536, source: 'https://zenmux.ai/api/v1/models (official catalogue, prompt and completion priced 0, 2026-10-21)' },
      { id: 'inclusionai/ling-3.1-flash', free: true, verified: true, contextWindow: 262144, maxOutputTokens: 32768, source: 'https://zenmux.ai/api/v1/models (official catalogue, prompt and completion priced 0, 2026-10-21)' },
      { id: 'sapiens-ai/agnes-2.5-flash', free: true, verified: true, contextWindow: 524288, maxOutputTokens: 65536, source: 'https://zenmux.ai/api/v1/models (official catalogue, prompt and completion priced 0, 2026-10-21)' },
      { id: 'dots-studio/dots3-note-prev', free: true, verified: true, contextWindow: 393100, maxOutputTokens: 393100, source: 'https://zenmux.ai/api/v1/models (official catalogue, prompt and completion priced 0, 2026-10-21)' },
    ],
    docsUrl: 'https://zenmux.ai/docs/guide/quickstart.html',
    shipStatus: 'VERIFIED',
  },

  requesty: {
    kind: 'requesty',
    label: 'Requesty',    baseUrl: 'https://router.requesty.ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'The official free-model page states free models require no card, at 200 requests per day and $0 per token.',
    caveats: [
      'Requesty routes to a managed provider policy, so the same model id may be served by different upstreams over time.',
      'stream_options: { include_usage: true } is required to receive the final usage chunk.',
      'Only the models explicitly listed as free on the Requesty free-model page may be allowlisted here.',
      'Additional free ids come from the models.dev price catalogue (a model is free when its input and output price are zero). The snapshot and its date are recorded on every model it contributes.',
    ],
    models: mergeModelsDev('requesty', [
      { id: 'ling-3.0-tiny', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-nano-30b-a3b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-nano-omni-30b-a3b-reasoning', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3.5-lightning-30b-a3b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3.5-content-safety', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-super-120b-a12b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-ultra-550b-a55b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'muse-glimmer-30b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'gemma-4-31b-it', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'leanstral-1-5', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
    ]),
    docsUrl: 'https://docs.requesty.ai/quickstart',
    shipStatus: 'VERIFIED',
  },

  bazaarlink: {
    kind: 'bazaarlink',
    label: 'BazaarLink',
    baseUrl: 'https://api.bazaarlink.ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'Sign-up needs no credit card and hands out an API key straight away. Accounts without a balance get 10 RPM and 60 weighted units per day, accounts with a balance get 20 RPM and 120 units; the free models share that quota and it resets at UTC 00:00.',
    caveats: [
      'Free-model overage can fall back to paid usage when the account holds a balance. This gateway sends X-Free-Fallback: false on every request so paid fallback is off.',
      'Never append :free to an arbitrary paid model; only the documented free ids are allowlisted here.',
      'The free catalogue changes, so ids must be re-checked against GET /v1/models.',
      'The account RPM tier (20 RPM below a $5 balance, 200 RPM at $5 or more) applies in addition to the per-model free limits.',
      'Only the models the provider currently enables as free are listed; the upstream page shows a live snapshot of that set.',
    ],
    models: [
      { id: 'qwen/qwen3.7-flash', free: true, verified: true, source: 'https://bazaarlink.ai/zh-TW/free (enabled free model list, 2026-10-21)' },
      { id: 'reflection/beam', free: true, verified: true, source: 'https://bazaarlink.ai/zh-TW/free (enabled free model list, 2026-10-21)' },
      { id: 'reflection/beam-free', free: true, verified: true, source: 'https://bazaarlink.ai/zh-TW/free (enabled free model list, 2026-10-21)' },
      { id: 'nvidia/nemotron-3.5-lightning-free', free: true, verified: true, source: 'https://bazaarlink.ai/zh-TW/free (enabled free model list, 2026-10-21)' },
      { id: 'stealth/glyph-cluster', free: true, verified: true, source: 'https://bazaarlink.ai/zh-TW/free (enabled free model list, 2026-10-21)' },
      { id: 'deepseek/deepseek-v4-flash-0731free', free: true, verified: true, source: 'https://bazaarlink.ai/zh-TW/free (enabled free model list, 2026-10-21)' },
      { id: 'auto:free', free: true, verified: true, source: 'https://bazaarlink.ai/docs/openapi.yaml (reserved free router id, 2026-10-21)' },
    ],
    docsUrl: 'https://bazaarlink.ai/docs',
    shipStatus: 'VERIFIED',
  },

  anyapi: {
    kind: 'anyapi',
    label: 'AnyAPI',
    baseUrl: 'https://api.anyapi.ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'The official pricing page states the $0 free plan requires no credit card: 100,000 AnyTokens per day resetting every 24 hours, and 100 requests per minute.',
    caveats: [
      'The free model ids are published on the model pages of the official catalogue. The Gemma free entry disagrees with itself (the id field and the code samples name different models), so that one is not shipped.',
      'The catalogue endpoint GET /v1/models answers 401 without a key, so the ids are read from the official model pages instead.',
      'Free tokens do not carry over to the next day.',
    ],
    models: [
      { id: 'qwen/qwen3.8-27b:free', free: true, verified: true, source: 'https://anyapi.ai/ai-models/qwen-qwen3-8-27b-free (free model id, 2026-10-21)' },
      { id: 'inclusionai/ling-3.0-flash-fin:free', free: true, verified: true, source: 'https://anyapi.ai/ai-models/inclusionai-ling-3-0-flash-fin-free (free model id, 2026-10-21)' },
      { id: 'inclusionai/ling-3.0-flash-sante:free', free: true, verified: true, source: 'https://anyapi.ai/ai-models/inclusionai-ling-3-0-flash-sante-free (free model id, 2026-10-21)' },
    ],
    docsUrl: 'https://docs.anyapi.ai/',
    shipStatus: 'VERIFIED',
  },

  poolside: {
    kind: 'poolside',
    label: 'Poolside (Laguna)',
    baseUrl: 'https://inference.poolside.ai/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'The official model page offers the hosted API "Free to use for a limited time" and the docs hand out a platform key for free developer access. Whether that key can be obtained without a payment method is not stated in the official docs, and the pricing page is access gated, so the card requirement stays UNVERIFIED.',
    caveats: [
      'The hosted endpoint serves the plain ids poolside/laguna-s-2.1 and poolside/laguna-xs-2.1. The :free ids belong to OpenRouter and are not used on the hosted endpoint.',
      'poolside/laguna-m.1 is not offered by the hosted endpoint, so it is not shipped.',
      'No rate limit for the free tier is published in the official documentation.',
      'Thinking is enabled by default and responses may include reasoning_content.',
      'Default max_tokens is 32,768 with a documented range up to 262,144.',
    ],
    models: [
      { id: 'poolside/laguna-s-2.1', free: true, verified: true, source: 'https://poolside.ai/models (free to use for a limited time, hosted api sample, 2026-10-21)' },
      { id: 'poolside/laguna-xs-2.1', free: true, verified: true, source: 'https://poolside.ai/models (free to use for a limited time, model selector, 2026-10-21)' },
    ],
    docsUrl: 'https://docs.poolside.ai/api/overview',
    shipStatus: 'UNVERIFIED',
  },

  cline: {
    kind: 'cline',
    label: 'Cline',
    baseUrl: 'https://api.cline.bot/api/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Cline documents a hosted OpenAI-compatible API with a `:free` model variant, but its own free-models page states that free model usage is only available in the Cline IDE extension and CLI. Whether an account can be created without a payment method is UNVERIFIED.',
    caveats: [
      'The official documentation contradicts itself: the API pages offer free models, while the free-models page says free usage is not supported through the API. The provider therefore ships disabled.',
      'The live model catalogue does expose 17 `:free` ids, so an administrator with a Cline key can allowlist them deliberately.',
      'The base URL carries an extra /api path segment relative to a standard OpenAI base.',
      'The API is credit metered: an exhausted balance answers 402, so free ids are the only ones that can be used for free.',
      'Listed only so an administrator with a paid Cline key can point the gateway at it deliberately.',
    ],
    models: [],
    docsUrl: 'https://docs.cline.bot/api/overview',
    shipStatus: 'UNVERIFIED',
  },

  zhipu: {
    kind: 'zhipu',
    label: 'Zhipu BigModel (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'The official pricing page lists the GLM Flash models at 免费 (free) for input and output. The platform bills from a prepaid balance and never states whether a payment method is needed to use the free models, so the card requirement stays UNVERIFIED.',
    caveats: [
      'Zhipu documents that some interface differences from OpenAI remain.',
      'GLM-4.5-Flash was decommissioned on 2026-01-30 and its requests are rerouted to GLM-4.7-Flash, so it is no longer shipped. The GLM-Z1 series is offline as well.',
      'Concurrent-request tiers are documented for GLM-4-Flash-250414 (200/1,000/2,000/3,000); no numeric daily token limit is published for the newer free ids.',
      'Limits for older Flash models must not be assumed to apply to newer free models.',
      'The free models are also vision models (GLM-4.6V-Flash, GLM-4.1V-Thinking-Flash, GLM-4V-Flash); only the text models are shipped here.',
    ],
    models: [
      { id: 'GLM-4.7-Flash', free: true, verified: true, source: 'https://docs.bigmodel.cn/cn/guide/start/pricing (listed 免费 for input and output, 2026-10-21)' },
      { id: 'GLM-4-Flash-250414', free: true, verified: true, source: 'https://docs.bigmodel.cn/cn/guide/start/pricing (listed 免费 for input and output, 2026-10-21)' },
    ],
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    shipStatus: 'UNVERIFIED',
  },

  siliconflow: {
    kind: 'siliconflow',
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.com/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'SiliconFlow documents a list of free models that stay free as long as the platform rate limit is not exceeded, and their rate limits are fixed. The card requirement is not stated anywhere in the official documentation, so it is UNVERIFIED and the provider ships disabled.',
    caveats: [
      'Only some models support the OpenAI library; the docs say most but not all OpenAI parameters are supported.',
      'The documented free models are Qwen/Qwen2-7B-Instruct, Qwen/Qwen2-1.5B-Instruct, Qwen/Qwen1.5-7B-Chat, THUDM/glm-4-9b-chat, THUDM/chatglm3-6b, internlm/internlm2_5-7b-chat and mistralai/Mistral-7B-Instruct-v0.2, plus 01-ai/Yi-1.5-9B-Chat-16K and 01-ai/Yi-1.5-6B-Chat on the price table.',
      'Those ids live on documentation pages that are no longer listed in the docs index, and the current price list no longer contains a free model, so no model ships allowlisted.',
      'The sign-up credit is a coupon with an expiry, not a permanent allowance.',
      'Current price and limits must be read from the live model catalogue before relying on a model.',
    ],
    models: mergeModelsDev('siliconflow', []),
    docsUrl: 'https://docs.siliconflow.com/en/userguide/quickstart',
    shipStatus: 'UNVERIFIED',
  },

  ollama: {
    kind: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    requiresKey: false,
    freeWithoutCard: true,
    freeTerms:
      'Inference runs on this machine. There is no metering, no account and no network dependency beyond loopback.',
    caveats: [
      'Ollama implements a subset of the OpenAI API; unsupported parameters are ignored or rejected by Ollama itself.',
      'The base url is the loopback default and can be overridden in provider settings.',
      'No model ships allowlisted: model ids depend on which models are pulled locally, and the administrator must allowlist them.',
      'A local base url is outside this gateway\'s loopback guard only in the sense that the guard applies to inbound requests; outbound calls to loopback are unrestricted.',
    ],
    models: [],
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    shipStatus: 'VERIFIED',
  },

  lmstudio: {
    kind: 'lmstudio',
    label: 'LM Studio (local)',
    baseUrl: 'http://127.0.0.1:1234/v1',
    requiresKey: false,
    freeWithoutCard: true,
    freeTerms:
      'Inference runs on this machine. There is no metering, no account and no network dependency beyond loopback.',
    caveats: [
      'The model field must use an identifier that LM Studio itself exposes.',
      'The base url is the loopback default and can be overridden in provider settings.',
      'No model ships allowlisted: model ids depend on which models are loaded locally, and the administrator must allowlist them.',
    ],
    models: [],
    docsUrl: 'https://lmstudio.ai/docs/developer/openai-compat',
    shipStatus: 'VERIFIED',
  },

  cloudflare: {
    kind: 'cloudflare',
    label: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'Workers AI is part of the Workers Free plan: 10,000 neurons per day at no charge, resetting at 00:00 UTC. Cloudflare\'s own plan pages say no credit card is required to start on the free plan.',
    caveats: [
      'The base URL carries the account id of the person using it, so YOUR_ACCOUNT_ID must be replaced before the provider can be used. The gateway refuses to save a base URL that still holds the placeholder.',
      'A Cloudflare API token with Workers AI permissions is required.',
      'A few models need a paid billing method and are therefore not free: @cf/moonshotai/kimi-k2.6, @cf/moonshotai/kimi-k2.7-code, @cf/zai-org/glm-5.2, @cf/zai-org/glm-5.3, @cf/zai-org/glm-5.3-flash, @cf/deepseek-ai/deepseek-v4-flash-0731, @cf/deepseek-ai/deepseek-v4.1-flash-1017 and @cf/deepseek-ai/deepseek-v4-pro-0813.',
      'Text generation is limited to 300 requests per minute on the free plan, and the Workers free plan itself allows 100,000 requests per day.',
      'Model IDs use the @cf/... namespace.',
    ],
    models: [
      { id: '@cf/meta/llama-3.2-1b-instruct', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct (free tier eligible, 2026-10-21)' },
      { id: '@cf/meta/llama-3.2-3b-instruct', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct (free tier eligible, 2026-10-21)' },
      { id: '@cf/meta/llama-3.1-8b-instruct-fp8', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8 (free tier eligible, 2026-10-21)' },
      { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast (free tier eligible, 2026-10-21)' },
      { id: '@cf/openai/gpt-oss-20b', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b (free tier eligible, 2026-10-21)' },
      { id: '@cf/openai/gpt-oss-120b', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b (free tier eligible, 2026-10-21)' },
      { id: '@cf/qwen/qwen3-30b-a3b-fp8', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8 (free tier eligible, 2026-10-21)' },
      { id: '@cf/qwen/qwen3.8-27b', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b (free tier eligible, 2026-10-21)' },
      { id: '@cf/qwen/qwen2.5-coder-32b-instruct', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct (free tier eligible, 2026-10-21)' },
      { id: '@cf/qwen/qwq-32b', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/qwq-32b (free tier eligible, 2026-10-21)' },
      { id: '@cf/ibm-granite/granite-4.0-h-micro', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro (free tier eligible, 2026-10-21)' },
      { id: '@cf/zai-org/glm-4.7-flash', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash (free tier eligible, 2026-10-21)' },
      { id: '@cf/nvidia/nemotron-3-120b-a12b', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/nemotron-3-120b-a12b (free tier eligible, 2026-10-21)' },
      { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/deepseek-r1-distill-qwen-32b (free tier eligible, 2026-10-21)' },
      { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', free: true, verified: true, source: 'https://developers.cloudflare.com/workers-ai/models/mistral-small-3.1-24b-instruct (free tier eligible, 2026-10-21)' },
    ],
    docsUrl: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
    shipStatus: 'VERIFIED',
  },

  custom: {
    kind: 'custom',
    label: 'Custom OpenAI-compatible endpoint',
    baseUrl: '',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'Free status is the administrator\'s responsibility and is UNVERIFIED by the gateway. It cannot verify a custom endpoint, so every model must be explicitly allowlisted and marked free by the administrator.',
    caveats: [
      'Nothing about a custom endpoint is verified. The administrator asserts that each allowlisted model is free.',
      'The administrator is responsible for ensuring the endpoint does not bill.',
    ],
    models: [],
    docsUrl: '',
    shipStatus: 'UNVERIFIED',
  },
};

/** All provider kinds, in display order. */
export const PROVIDER_KINDS: readonly ProviderKind[] = [
  'gemini',
  'groq',
  'mistral',
  'sambanova',
  'openrouter',
  'kilo',
  'opencode',
  'opencodego',
  'zenmux',
  'requesty',
  'bazaarlink',
  'anyapi',
  'poolside',
  'cline',
  'zhipu',
  'siliconflow',
  'ollama',
  'lmstudio',
  'custom',
];

/** Look up a catalog entry. */
export function catalogFor(kind: ProviderKind): CatalogProvider {
  return CATALOG[kind];
}
