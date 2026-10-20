/**
 * Built-in provider catalog.
 *
 * This module holds the *verified* facts about each provider: its base URL,
 * its OpenAI compatibility notes, and the models whose free status was
 * confirmed against official documentation.
 *
 * Two rules govern this file:
 *  1. Nothing here is enabled by default. The administrator must add a
 *     provider, supply a key, and allowlist the models they want.
 *  2. A model is only listed when its free status was confirmed from an
 *     official source, and the source is recorded alongside it.
 *
 * Documentation URLs and the verification date are kept in
 * `docs/providers/`. The `verified` flag means "confirmed free on the date
 * recorded in the source", never "will always be free".
 */

import type { ProviderKind } from '../config/schema.js';

/** Verification date for the entries in this catalog. */
export const CATALOG_VERIFIED_ON = '2026-10-20';

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
  /** True when the free status could not be fully confirmed. */
  readonly unverified: boolean;
}

/**
 * Provider definitions.
 *
 * Providers marked `unverified: true` ship disabled and without a confirmed
 * model list, because their free status could not be confirmed from official
 * documentation at the verification date.
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
    unverified: false,
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
    ],
    models: [
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
    ],
    docsUrl: 'https://console.groq.com/docs/openai',
    unverified: false,
  },

  mistral: {
    kind: 'mistral',
    label: 'Mistral (La Plateforme)',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'Free mode is the default and the API is reachable without a credit card. The numeric Free-mode quota is administered in the organisation API-limits page and is not published as a static table.',
    caveats: [
      'Free-mode per-model quotas are not published in the documentation and must be read from the organisation limits page.',
      'The exact model roster available under Free mode could not be confirmed from the API reference at the verification date.',
    ],
    models: [],
    docsUrl: 'https://docs.mistral.ai/api/endpoint/chat',
    unverified: true,
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
    models: [
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
    ],
    docsUrl: 'https://docs.sambanova.ai/docs/en/features/openai-compatibility',
    unverified: false,
  },

  openrouter: {
    kind: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'Free model variants exist as `:free` catalogue entries. Free-tier rate limits are enforced globally, and extra accounts or keys do not raise capacity.',
    caveats: [
      'Only `:free` variants are free. A fallback that resolves to a paid model would incur charges, so paid fallbacks are disabled in this gateway.',
      'The free catalogue changes over time; the allowlist is administrator-controlled for exactly this reason.',
    ],
    models: [],
    docsUrl: 'https://openrouter.ai/docs/guides/routing/model-variants/free',
    unverified: false,
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
    ],
    models: [
      {
        id: 'kilo-auto/free',
        free: true,
        verified: true,
        source: 'https://kilo.ai/docs/gateway/models-and-providers (free catalogue entry)',
      },
    ],
    docsUrl: 'https://kilo.ai/docs/gateway',
    unverified: false,
  },

  opencode: {
    kind: 'opencode',
    label: 'OpenCode Console',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    requiresKey: false,
    freeWithoutCard: true,
    freeTerms:
      'Free chat models are currently priced at $0 and can be called without a token. The documentation describes them as free "for a limited time", so this is not a guaranteed permanent tier.',
    caveats: [
      'Free status is temporary by the provider\'s own wording.',
      'Streaming support for the free OpenAI-compatible chat models could not be confirmed from the official inference page.',
      'Console is not OpenAI-only across all models: GPT uses Responses, Claude/Qwen use Anthropic Messages, and Gemini uses its own API path.',
    ],
    models: [
      {
        id: 'big-pickle',
        free: true,
        verified: true,
        source: 'https://opencode.ai/v2/docs/console/models/ (free model, $0)',
      },
      {
        id: 'glm-5.3-flash-free',
        free: true,
        verified: true,
        source: 'https://opencode.ai/v2/docs/console/models/ (free model, $0)',
      },
      {
        id: 'deepseek-v4.1-flash-free',
        free: true,
        verified: true,
        source: 'https://opencode.ai/v2/docs/console/models/ (free model, $0)',
      },
    ],
    docsUrl: 'https://opencode.ai/v2/docs/console/api/inference/',
    unverified: false,
  },

  requesty: {
    kind: 'requesty',
    label: 'Requesty',
    baseUrl: 'https://router.requesty.ai/v1',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'The official free-model page states free models require no card, at 200 requests per day and $0 per token.',
    caveats: [
      'Requesty routes to a managed provider policy, so the same model id may be served by different upstreams over time.',
      'stream_options: { include_usage: true } is required to receive the final usage chunk.',
      'Only the models explicitly listed as free on the Requesty free-model page may be allowlisted here.',
    ],
    models: [
      { id: 'iling-3.1-flash', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'iling-3.0-tiny', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-nano-30b-a3b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-nano-omni-30b-a3b-reasoning', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3.5-lightning-30b-a3b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3.5-content-safety', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-super-120b-a12b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'nemotron-3-ultra-550b-a55b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'muse-glimmer-30b', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'gemma-4-31b-it', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'leanstral-1-5', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'laguna-m.1', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
      { id: 'laguna-xs.2', free: true, verified: true, source: 'https://www.requesty.ai/models/free (free model list, 2026-10-20)' },
    ],
    docsUrl: 'https://docs.requesty.ai/quickstart',
    unverified: false,
  },

  bazaarlink: {
    kind: 'bazaarlink',
    label: 'BazaarLink',
    baseUrl: 'https://api.bazaarlink.ai/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Free models are documented at 10 RPM and 60 daily units per model. Whether an account can be created without a payment method is UNVERIFIED from official documentation.',
    caveats: [
      'Free-model overage can fall back to paid usage when the account holds a balance. This gateway sends X-Free-Fallback: false on every request so paid fallback is off.',
      'Never append :free to an arbitrary paid model; only the documented free ids are allowlisted here.',
      'The free catalogue changes, so ids must be re-checked against GET /v1/models.',
      'The account RPM tier (20 RPM below a $5 balance, 200 RPM at $5 or more) applies in addition to the per-model free limits.',
    ],
    models: [
      { id: 'qwen/qwen3.7-flash', free: true, verified: true, source: 'https://bazaarlink.ai/docs (free model list, 2026-10-20)' },
      { id: 'reflection/beam-free', free: true, verified: true, source: 'https://bazaarlink.ai/docs (free model list, 2026-10-20)' },
      { id: 'reflection/beam', free: true, verified: true, source: 'https://bazaarlink.ai/docs (free model list, 2026-10-20)' },
      { id: 'nvidia/nemotron-3.5-lightning-free', free: true, verified: true, source: 'https://bazaarlink.ai/docs (free model list, 2026-10-20)' },
      { id: 'stealth/cat-jam', free: true, verified: true, source: 'https://bazaarlink.ai/docs (free model list, 2026-10-20)' },
      { id: 'stealth/glyph-cluster', free: true, verified: true, source: 'https://bazaarlink.ai/docs (free model list, 2026-10-20)' },
      { id: 'deepseek/deepseek-v4-flash-0731free', free: true, verified: true, source: 'https://bazaarlink.ai/docs (free model list, 2026-10-20)' },
      { id: 'auto:free', free: true, verified: true, source: 'https://bazaarlink.ai/docs (documented free router id, 2026-10-20)' },
    ],
    docsUrl: 'https://bazaarlink.ai/docs',
    unverified: true,
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
      'The exact API model id strings for the free models are UNVERIFIED: the docs name the models but not their id strings.',
      'One official guide says ids must be written as provider/model while other examples use bare names, so ids must be read from the authenticated GET /v1/models catalogue.',
      'Because no free model id is verified, no model ships allowlisted for this provider.',
    ],
    models: [],
    docsUrl: 'https://docs.anyapi.ai/',
    unverified: true,
  },

  poolside: {
    kind: 'poolside',
    label: 'Poolside (Laguna)',
    baseUrl: 'https://inference.poolside.ai/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Poolside announces free and paid API endpoints for Laguna XS 2.1. Whether a hosted key can be obtained without a payment method is UNVERIFIED.',
    caveats: [
      'The exact free endpoint model id is UNVERIFIED. The hosted quickstart documents poolside/laguna-s-2.1, and the release blog gives poolside/laguna-xs-2.1 for OpenRouter only.',
      'Because no free model id is verified for the hosted endpoint, no model ships allowlisted for this provider.',
      'Thinking is enabled by default and responses may include reasoning_content.',
      'Default max_tokens is 32,768 with a documented range up to 262,144.',
    ],
    models: [],
    docsUrl: 'https://docs.poolside.ai/api/overview',
    unverified: true,
  },

  cline: {
    kind: 'cline',
    label: 'Cline',
    baseUrl: 'https://api.cline.bot/api/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Cline documents a hosted OpenAI-compatible API, but its own free-model page states that free model usage is available only in the IDE extension and CLI and is NOT supported through the API.',
    caveats: [
      'There is no verified free model available through the Cline API, so no model ships allowlisted.',
      'The base URL carries an extra /api path segment relative to a standard OpenAI base.',
      'Whether paid API access itself requires a payment method is UNVERIFIED.',
      'Listed only so an administrator with a paid Cline key can point the gateway at it deliberately.',
    ],
    models: [],
    docsUrl: 'https://docs.cline.bot/api/overview',
    unverified: true,
  },

  zhipu: {
    kind: 'zhipu',
    label: 'Zhipu BigModel (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Official model documentation labels the GLM Flash models as free. Whether an account can be created without a payment method is UNVERIFIED.',
    caveats: [
      'Zhipu documents that some interface differences from OpenAI remain.',
      'Concurrent-request tiers are documented for GLM-4-Flash-250414 (200/1,000/2,000/3,000); no numeric daily token limit is published for the newer free ids.',
      'Limits for older Flash models must not be assumed to apply to newer free models.',
    ],
    models: [
      { id: 'GLM-4.7-Flash', free: true, verified: true, source: 'https://docs.bigmodel.cn/cn/guide/start/model-overview (listed free, 2026-10-20)' },
      { id: 'GLM-4.5-Flash', free: true, verified: true, source: 'https://docs.bigmodel.cn/cn/guide/start/model-overview (listed free, 2026-10-20)' },
      { id: 'GLM-4-Flash-250414', free: true, verified: true, source: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-4 (free model, 2026-10-20)' },
    ],
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    unverified: true,
  },

  siliconflow: {
    kind: 'siliconflow',
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.com/v1',
    requiresKey: true,
    freeWithoutCard: false,
    freeTerms:
      'Official docs identify free models and describe their limits as fixed, but publish no numeric free-tier limit and do not state the card requirement, so both are UNVERIFIED.',
    caveats: [
      'Only some models support the OpenAI library; the docs say most but not all OpenAI parameters are supported.',
      'The one model named in the official tutorial (Qwen/Qwen2-7B-Instruct) is no longer confirmed current by the docs read, so no model ships allowlisted.',
      'Current price and limits must be read from the live model catalogue before relying on a model.',
    ],
    models: [],
    docsUrl: 'https://docs.siliconflow.com/en/userguide/quickstart',
    unverified: true,
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
    unverified: false,
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
    unverified: false,
  },

  custom: {
    kind: 'custom',
    label: 'Custom OpenAI-compatible endpoint',
    baseUrl: '',
    requiresKey: true,
    freeWithoutCard: true,
    freeTerms:
      'Free status is the administrator\'s responsibility. The gateway cannot verify a custom endpoint, so every model must be explicitly allowlisted and marked free by the administrator.',
    caveats: [
      'Nothing about a custom endpoint is verified. The administrator asserts that each allowlisted model is free.',
      'The administrator is responsible for ensuring the endpoint does not bill.',
    ],
    models: [],
    docsUrl: '',
    unverified: true,
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
