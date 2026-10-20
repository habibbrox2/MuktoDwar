# Provider verification matrix

Every provider below was checked against **official documentation only** — the provider's own docs site, API reference, and pricing or plan pages. Nothing was taken from a blog post, a forum, a model aggregator, or another gateway's marketing page.

**Verification date for every entry: 2026-10-20.**

## How to read this document

| Field | Meaning |
|---|---|
| **Free without card** | `YES` — official docs state a free tier exists and no payment method is needed. `NO` — official docs establish that a card, a purchase, or a paid plan is required. `UNVERIFIED` — free access is documented but the card requirement is not stated either way. |
| **Ship status** | `VERIFIED` — safe to allowlist models from immediately. `UNVERIFIED` — ships **disabled**, and ships with **no allowlisted models** unless a free model id was independently confirmed. |

Two rules govern this catalog:

1. **Nothing is enabled by default.** A provider must be added by an administrator, given a key, and explicitly enabled.
2. **A model is only allowlisted when its free status was confirmed from an official source**, and that source is recorded alongside it.

The `verified` flag means *"confirmed free on 2026-10-20"*. It never means *"will always be free"*.

---

## Summary

| Provider | Ship status | Free without card | Free model ids shipped | Base URL |
|---|---|---|---|---|
| Google Gemini | **VERIFIED** | YES | 3 | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Groq | **VERIFIED** | YES | 5 | `https://api.groq.com/openai/v1` |
| SambaNova | **VERIFIED** | YES | 3 | `https://api.sambanova.ai/v1` |
| Kilo AI Gateway | **VERIFIED** | YES | 1 | `https://ai-gateway.kilo.ai/api/v1` |
| OpenCode Console | **VERIFIED** | YES | 3 | `https://opencode.ai/inference/openai/v1` |
| Requesty | **VERIFIED** | YES | 13 | `https://router.requesty.ai/v1` |
| Ollama (local) | **VERIFIED** | N/A (local) | none preloaded | `http://127.0.0.1:11434/v1` |
| LM Studio (local) | **VERIFIED** | N/A (local) | none preloaded | `http://127.0.0.1:1234/v1` |
| BazaarLink | UNVERIFIED | UNVERIFIED | 8 | `https://api.bazaarlink.ai/v1` |
| Zhipu BigModel (GLM) | UNVERIFIED | UNVERIFIED | 3 | `https://open.bigmodel.cn/api/paas/v4` |
| AnyAPI | UNVERIFIED | YES | none (ids unconfirmed) | `https://api.anyapi.ai/v1` |
| Poolside (Laguna) | UNVERIFIED | UNVERIFIED | none | `https://inference.poolside.ai/v1` |
| Mistral | UNVERIFIED | YES | none (roster unconfirmed) | `https://api.mistral.ai/v1` |
| OpenRouter | UNVERIFIED | YES | none (allowlist only) | `https://openrouter.ai/api/v1` |
| Cline | UNVERIFIED | NO for free use | none | `https://api.cline.bot/api/v1` |
| SiliconFlow | UNVERIFIED | UNVERIFIED | none | `https://api.siliconflow.com/v1` |

---

## VERIFIED providers

### Google Gemini

- **Base URL:** `https://generativelanguage.googleapis.com/v1beta/openai/`
- **Auth:** `Authorization: Bearer <GEMINI_API_KEY>`
- **Free without card:** **YES.** The pricing page lists Free Tier input and output as *"Free of charge"*; linking billing is what upgrades a project to Paid.
- **Free models:** `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`
- **Streaming:** Yes.
- **Caveats:** The OpenAI compatibility layer may silently ignore unsupported options. Gemini-specific options must go through `extra_body`.
- **Docs:** <https://ai.google.dev/gemini-api/docs/pricing>, <https://ai.google.dev/gemini-api/docs/openai>

### Groq

- **Base URL:** `https://api.groq.com/openai/v1`
- **Auth:** `Authorization: Bearer <GROQ_API_KEY>`
- **Free without card:** **YES.** The billing FAQ states a payment method is only required to *upgrade* to the Developer tier.
- **Free models:** `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`
- **Streaming:** Yes.
- **Free-tier limits:** Rate limits apply per organization, not per user.
- **Caveats:** Not fully OpenAI-compatible — `logprobs`, `logit_bias`, `top_logprobs` and `messages[].name` return HTTP 400. **`n` must be 1** (the gateway strips `n > 1`). A temperature of `0` is rewritten to `1e-8`.
- **Docs:** <https://console.groq.com/docs/models>, <https://console.groq.com/docs/billing-faqs>, <https://console.groq.com/docs/rate-limits>

### SambaNova

- **Base URL:** `https://api.sambanova.ai/v1`
- **Auth:** `Authorization: Bearer <SAMBANOVA_API_KEY>`
- **Free without card:** **YES.** The Free Tier is the tier that applies when no payment method is linked.
- **Free models:** `DeepSeek-V3.1`, `Meta-Llama-3.3-70B-Instruct`, `gpt-oss-120b`
- **Streaming:** Yes.
- **Free-tier limits:** 20 RPM, 20 RPD, 200,000 TPD (documented per model).
- **Caveats:** `presence_penalty` and `frequency_penalty` are **ignored** — the gateway drops them. `n` accepts 1–8 but values above 1 cannot be combined with tools. `system_fingerprint` is not returned.
- **Docs:** <https://docs.sambanova.ai/docs/en/models/rate-limits>, <https://docs.sambanova.ai/docs/en/features/openai-compatibility>

### Kilo AI Gateway

- **Base URL:** `https://ai-gateway.kilo.ai/api/v1`
- **Auth:** none required. Free requests are available to **anonymous** callers.
- **Free without card:** **YES.**
- **Free models:** `kilo-auto/free` (selects dynamically from the free catalogue)
- **Streaming:** Yes.
- **Free-tier limits:** 200 requests per hour per IP, anonymous.
- **Caveats:** A key is optional and only raises attribution, not access. Some upstream free models may log prompts; NVIDIA free endpoints are trial-use only.
- **Docs:** <https://kilo.ai/docs/gateway>, <https://kilo.ai/docs/gateway/models-and-providers>

### OpenCode Console

- **Base URL:** `https://opencode.ai/inference/openai/v1`
- **Auth:** none required for free models. **Confirmed live:** an unauthenticated call returned `Model is unavailable` for a bad model id rather than an auth error, which is what keyless access looks like.
- **Free without card:** **YES** — currently `$0`.
- **Free models:** `big-pickle`, `glm-5.3-flash-free`, `deepseek-v4.1-flash-free`
- **Streaming:** **UNCONFIRMED** for the free OpenAI-compatible chat models.
- **Caveats:** Free status is temporary by the provider's own wording (*"for a limited time"*). Console is **not** OpenAI-only across all models: GPT uses Responses, Claude/Qwen use Anthropic Messages, Gemini uses its own path — only the models that speak Chat Completions belong behind this gateway.
- **Docs:** <https://opencode.ai/v2/docs/console/models/>, <https://opencode.ai/v2/docs/console/api/inference/>

### Requesty

- **Base URL:** `https://router.requesty.ai/v1`
- **Auth:** `Authorization: Bearer <REQUESTY_API_KEY>`
- **Free without card:** **YES.** The official free-model page states free models require no card.
- **Free models (13):** `iling-3.1-flash`, `iling-3.0-tiny`, `nemotron-3-nano-30b-a3b`, `nemotron-3-nano-omni-30b-a3b-reasoning`, `nemotron-3.5-lightning-30b-a3b`, `nemotron-3.5-content-safety`, `nemotron-3-super-120b-a12b`, `nemotron-3-ultra-550b-a55b`, `muse-glimmer-30b`, `gemma-4-31b-it`, `leanstral-1-5`, `laguna-m.1`, `laguna-xs.2`
- **Streaming:** Yes (SSE documented).
- **Free-tier limits:** **200 requests per day**, `$0` per token.
- **Caveats:** Requesty routes through a managed provider policy, so the same model id may be served by different upstreams over time. `stream_options: {"include_usage": true}` is required to receive the final usage/cost chunk.
- **Docs:** <https://docs.requesty.ai/quickstart>, <https://www.requesty.ai/models/free>

### Ollama (local)

- **Base URL:** `http://127.0.0.1:11434/v1`
- **Auth:** not checked by Ollama.
- **Free:** inference runs on your own hardware. No account, no metering, no egress.
- **Models:** none preloaded — model ids depend on what you have pulled, so you allowlist them yourself.
- **Caveats:** Ollama implements a **subset** of the OpenAI API.
- **Docs:** <https://docs.ollama.com/api/openai-compatibility>

### LM Studio (local)

- **Base URL:** `http://127.0.0.1:1234/v1`
- **Auth:** not required.
- **Free:** inference runs on your own hardware.
- **Models:** none preloaded — the `model` field must be an identifier LM Studio itself exposes.
- **Docs:** <https://lmstudio.ai/docs/developer/openai-compat>

---

## UNVERIFIED providers

These ship **disabled**. Where free model ids were confirmed from official docs they are listed, but they are **not pre-allowlisted**; the administrator opts in.

### BazaarLink — UNVERIFIED (card requirement not established)

- **Base URL:** `https://api.bazaarlink.ai/v1`
- **Auth:** `Authorization: Bearer sk-bl-<key>`
- **Free access:** documented. **No-card: UNVERIFIED** — the docs describe free routing and free registration but never state that no payment method is needed.
- **Documented free model ids:** `qwen/qwen3.7-flash`, `reflection/beam-free`, `reflection/beam`, `nvidia/nemotron-3.5-lightning-free`, `stealth/cat-jam`, `stealth/glyph-cluster`, `deepseek/deepseek-v4-flash-0731free`, and the router id `auto:free`.
- **Free-tier limits:** **10 RPM and 60 daily units per model.** A separate account tier applies on top: 20 RPM below a $5 balance, 200 RPM at $5 or more, with no daily request cap.
- **⚠️ Paid-fallback risk:** the docs state that free-model overage can switch to paid usage *when the account holds a balance*. The gateway therefore sends **`X-Free-Fallback: false` on every request**, which is asserted by a test.
- **Other caveats:** Never append `:free` to an arbitrary paid model. The free catalogue changes, so ids must be re-read from `GET /v1/models`. Long non-streaming requests may return HTTP 200 before a later error, so streaming is recommended for long requests. Client-supplied routing fields (`provider`, `route`, `transforms`, `service_tier`) are stripped by the gateway.
- **Docs:** <https://bazaarlink.ai/docs>, <https://bazaarlink.ai/docs/api>

### Zhipu BigModel (GLM) — UNVERIFIED (card requirement not established)

- **Base URL:** `https://open.bigmodel.cn/api/paas/v4`
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Free models documented:** `GLM-4.7-Flash`, `GLM-4.5-Flash`, `GLM-4-Flash-250414`
- **No-card:** **UNVERIFIED** — docs call these models free but never address the payment method.
- **Limits:** concurrent-request tiers of 200 / 1,000 / 2,000 / 3,000 are documented for `GLM-4-Flash-250414` (V0–V3). No numeric daily token limit is published for the newer free ids.
- **Caveats:** Zhipu documents that some interface differences from OpenAI remain. Do not assume older Flash limits apply to newer free models.
- **Docs:** <https://docs.bigmodel.cn/cn/guide/develop/openai/introduction>, <https://docs.bigmodel.cn/cn/guide/start/model-overview>

### AnyAPI — UNVERIFIED (no free model id string confirmed)

- **Base URL:** `https://api.anyapi.ai/v1`
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Free without card:** **YES** — the official pricing page explicitly says the $0 free plan requires no credit card.
- **Free-tier limits:** **100,000 AnyTokens/day**, resetting every 24 hours and not carrying over; **100 requests per minute**.
- **Free models:** named in official docs (Gemma 3n 4B, Ling 3.0 Flash Fin, Ling 3.0 Flash Sante, Qwen3.8 27B) but **their exact API id strings could not be confirmed**, so **no model is pre-allowlisted**. Read ids from the authenticated `GET /v1/models` catalogue and add them yourself.
- **Caveat:** official guidance is inconsistent — one guide requires `provider/model` ids while other examples use bare names.
- **Docs:** <https://docs.anyapi.ai/>, <https://anyapi.ai/pricing>

### Poolside (Laguna) — UNVERIFIED (free model id not established)

- **Base URL:** `https://inference.poolside.ai/v1`
- **Auth:** `Authorization: Bearer <API key>` from the Poolside Platform.
- **Free access:** Poolside's release blog states Laguna XS 2.1 has **free and paid API endpoints**. **No-card: UNVERIFIED.**
- **Free model id:** **UNVERIFIED.** The hosted quickstart documents `poolside/laguna-s-2.1`, but the blog gives `poolside/laguna-xs-2.1` **for OpenRouter only**. An OpenRouter id is not evidence for a direct Poolside id, so **no model is pre-allowlisted**.
- **Caveats:** thinking is enabled by default and responses may include `reasoning_content`. Default `max_tokens` is 32,768, documented range up to 262,144. No numeric free-tier limit is published.
- **Docs:** <https://docs.poolside.ai/api/overview>, <https://poolside.ai/blog/introducing-laguna-xs-2-1>

### Mistral — UNVERIFIED (free model roster not confirmed)

- **Base URL:** `https://api.mistral.ai/v1`
- **Auth:** `Authorization: Bearer <MISTRAL_API_KEY>`
- **Free without card:** **YES** — Free mode is the default and needs no card.
- **Free models:** **none listed.** The numeric Free-mode quota is administered in the organisation API-limits page and is not published as a static table, and the exact model roster available under Free mode could not be confirmed from the API reference. **No model is pre-allowlisted.**
- **Docs:** <https://docs.mistral.ai/api/endpoint/chat>

### OpenRouter — UNVERIFIED (no model pre-allowlisted)

- **Base URL:** `https://openrouter.ai/api/v1`
- **Auth:** `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Free without card:** **YES** — `:free` catalogue entries exist.
- **Free models:** **none pre-allowlisted, deliberately.** Only `:free` variants are free, and a fallback that resolved to a paid model would incur charges. The free catalogue churns, so you pick ids yourself.
- **Paid-fallback protection:** the gateway disables provider-side fallback for this gateway.
- **Attribution headers sent:** `HTTP-Referer: http://localhost:8787`, `X-Title: Local AI Gateway` (asserted by a test).
- **Docs:** <https://openrouter.ai/docs/guides/routing/model-variants/free>

### Cline — UNVERIFIED, free use **not available through the API**

- **Base URL:** `https://api.cline.bot/api/v1` (note the extra `/api` segment)
- **Auth:** `Authorization: Bearer <CLINE_API_KEY>`
- **Free access:** **NO for the API.** Cline's own free-models page states free model usage is available **only in the IDE extension and CLI** and is **not supported through the Cline API**.
- **Free models:** **none.** The API models page suggests `minimax/minimax-m2.5` for "free experimentation", but the free-models page contradicts treating that as a free API model.
- **Streaming:** Yes, `stream: true` as SSE.
- **Why it ships at all:** so an administrator who already holds a paid Cline key can deliberately point the gateway at it. Nothing about it is free-enabled.
- **Docs:** <https://docs.cline.bot/api/overview>, <https://docs.cline.bot/getting-started/free-models>

### SiliconFlow — UNVERIFIED

- **Base URL:** `https://api.siliconflow.com/v1`
- **Free models:** the official tutorial names `Qwen/Qwen2-7B-Instruct` as a default free model, but current availability is not confirmed by the docs read. **No model is pre-allowlisted.**
- **Limits:** free-model limits are described as "fixed" but no numeric free-tier limit is published; the documented tiers are paid-account tiers.
- **Docs:** <https://docs.siliconflow.com/en/userguide/quickstart>, <https://docs.siliconflow.com/en/userguide/rate-limits/rate-limit-and-upgradation>

---

## Rejected: no qualifying free tier

These were checked and **excluded**. Do not add them expecting free inference.

| Provider | Finding | Source |
|---|---|---|
| **Cerebras** | Free access is a **30-day trial that requires a card**. | Official pricing / signup |
| **GitHub Models** | **Retired 2026-07-30.** | Official docs |
| **HuggingFace Inference** | Free users receive **zero credits**. | Official docs |
| **DeepSeek direct** | `deepseek-flash` and `deepseek-v4-pro` are **priced** models deducted from topped-up balance. No free chat tier. | <https://api-docs.deepseek.com/quick_start/pricing/> |
| **Together.ai** | Docs explicitly state **no free trial** and a **minimum $15 credit purchase**. | <https://docs.together.ai/docs/billing-credits> |
| **Fireworks AI** | **$1 starter credit** only, then suspension without a payment method. Promotional credit, not a free tier. | <https://docs.fireworks.ai/faq-new/billing-pricing/what-happens-when-i-finish-my-1-dollar-credit> |
| **AIML API** | Official FAQ: *"The Free Tier is currently paused."* | <https://docs.aimlapi.com/faq/free-tier> |
| **Alibaba DashScope / Model Studio** | Real free quota (1M tokens, 90 days, no purchase) but it is **new-user-only, Beijing-region-only, and the endpoint is workspace-specific** (`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`), so there is no static base URL to ship. | <https://help.aliyun.com/zh/model-studio/new-free-quota> |
| **Cloudflare Workers AI** | 10,000 Neurons/day free allowance is real, but the base URL needs an **account id** (`https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1`) and the no-card condition is unverified. Add it as a **Custom** provider if you want it. | <https://developers.cloudflare.com/workers-ai/platform/pricing/> |
| **Vercel AI Gateway** | $5/month free credit documented, but no-card signup and the exact eligible model ids are unconfirmed. | <https://vercel.com/docs/ai-gateway/pricing> |
| **Novita, Chutes, LunarLink/Reflection, Dynosaur, PiAPI, Corvi, NCompass, ShenTu/AgentRouter** | No sufficient official documentation found for free tier, endpoint, model id, or limits. | — |

---

## Adding a provider that is not in the catalog

Use a **Custom** provider. You own its free status: the gateway cannot verify that a custom endpoint will not bill you.

```
Provider kind   custom
Base URL        https://your-endpoint.example/v1
Enabled         on
Model id        whatever your endpoint exposes
Free            checked, by you
```

---

## Re-verification

Free tiers change. Re-check this matrix whenever you see an unexpected `429`, an unexpected `404` on a model that used to work, or a invoice. The verification date at the top of this file is the honest answer to *"when was this last confirmed"*.
