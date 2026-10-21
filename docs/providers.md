# Provider verification matrix

Every provider below was checked against **official documentation only** — the provider's own docs site, API reference, and pricing or plan pages. Nothing was taken from a blog post, a forum, a model aggregator, or another gateway's marketing page.

**Verification date for every entry: 2026-10-21.**

## How to read this document

| Field | Meaning |
|---|---|
| **Free without card** | `YES` — official docs state a free tier exists and no payment method is needed. `NO` — official docs establish that a card, a purchase, or a paid plan is required. `UNVERIFIED` — free access is documented but the card requirement is not stated either way. |
| **Ship status** | `VERIFIED` - safe to allowlist models from immediately. `UNVERIFIED` - ships **disabled**, and ships with **no allowlisted models** unless a free model id was independently confirmed. `BLOCKED` - the free tier exists but refuses calls from outside the provider's own client, so the provider ships **disabled** and cannot be served from this gateway. |

Two rules govern this catalog:

1. **Nothing is enabled by default except the keyless free tier.** A provider that needs a key must be added by an administrator, given a key, and explicitly enabled. Kilo ships enabled because its free tier needs no key at all; OpenCode ships disabled because it needs a Console key.
2. **A model is only allowlisted when its free status was confirmed from an official source**, and that source is recorded alongside it.

The `verified` flag means *"confirmed free on 2026-10-21"*. It never means *"will always be free"*.

---

## Summary

| Provider | Ship status | Free without card | Free model ids shipped | Base URL |
|---|---|---|---|---|
| Google Gemini | **VERIFIED** | YES | 3 | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Groq | **VERIFIED** | YES | 6 | `https://api.groq.com/openai/v1` |
| SambaNova | **VERIFIED** | YES | 3 | `https://api.sambanova.ai/v1` |
| Kilo AI Gateway | **VERIFIED** | YES | 22 | `https://ai-gateway.kilo.ai/api/v1` |
| OpenCode Console (Zen) | **VERIFIED** | NO (a key and credits) | 14 | `https://opencode.ai/inference/openai/v1` |
| OpenCode Go | **VERIFIED** | NO ($10/month) | 3 | `https://opencode.ai/inference/go/openai/v1` |
| ZenMux | **VERIFIED** | NO (a balance or a plan) | 7 | `https://zenmux.ai/api/v1` |
| Requesty | **VERIFIED** | YES | 11 | `https://router.requesty.ai/v1` |
| Ollama (local) | **VERIFIED** | N/A (local) | none preloaded | `http://127.0.0.1:11434/v1` |
| LM Studio (local) | **VERIFIED** | N/A (local) | none preloaded | `http://127.0.0.1:1234/v1` |
| BazaarLink | **VERIFIED** | YES | 7 | `https://api.bazaarlink.ai/v1` |
| Zhipu BigModel (GLM) | UNVERIFIED | UNVERIFIED | 2 | `https://open.bigmodel.cn/api/paas/v4` |
| AnyAPI | **VERIFIED** | YES | 3 | `https://api.anyapi.ai/v1` |
| Poolside (Laguna) | UNVERIFIED | UNVERIFIED | 2 | `https://inference.poolside.ai/v1` |
| Mistral | UNVERIFIED | YES | none (no free chat model) | `https://api.mistral.ai/v1` |
| OpenRouter | **VERIFIED** | YES | 20 | `https://openrouter.ai/api/v1` |
| Cline | UNVERIFIED | UNVERIFIED | none | `https://api.cline.bot/api/v1` |
| SiliconFlow | UNVERIFIED | UNVERIFIED | none | `https://api.siliconflow.com/v1` |
| Cloudflare Workers AI | **VERIFIED** | YES | 15 | `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` |

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
- **Free models (6):** `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, `allam-2-7b`
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
- **Free models (22):** `kilo-auto/free` (selects dynamically from the free catalogue) plus the zero-price ids of the models.dev catalogue, such as `minimax/minimax-m3.1-flash:free`, `nvidia/nemotron-3.5-lightning:free` and `poolside/laguna-s-2.1:free`.
- **Streaming:** Yes.
- **Free-tier limits:** 200 requests per hour per IP, anonymous.
- **Caveats:** A key is optional and only raises attribution, not access. Some upstream free models may log prompts; NVIDIA free endpoints are trial-use only.
- **Docs:** <https://kilo.ai/docs/gateway>, <https://kilo.ai/docs/gateway/models-and-providers>


### ZenMux

- **Base URL:** `https://zenmux.ai/api/v1`
- **Auth:** `Authorization: Bearer <ZENMUX_API_KEY>`
- **Free without card:** **NO.** The models below cost nothing to call, but the account does: Pay As You Go runs on a prepaid balance (top-ups start at $5 through Stripe or Alipay) and the Builder Plan is a subscription from $20 a month.
- **Free models (7):** `z-ai/glm-4.7-flash-free`, `z-ai/glm-4.6v-flash-free`, `atria-asi/atria-dawn`, `atria-asi/atria-dawn-preview`, `inclusionai/ling-3.1-flash`, `sapiens-ai/agnes-2.5-flash` and `dots-studio/dots3-note-prev`. Every one of them is listed in the official catalogue with a prompt price of 0 and a completion price of 0.
- **Free-tier limits:** Pay As You Go has **no rate limit** and no concurrency limit. The Builder Plan is limited to **10-15 RPM** and a weekly quota, and its terms forbid production use.
- **Caveats:** An API key is required; a keyless chat call answers HTTP 403 with `access_denied`, only the model list is public. Two more models are priced at zero but generate images (`inclusionai/ming-image-0.1-design` and `inclusionai/ming-image-0.1-design-layer`); they are not pre-allowlisted because they belong on the image endpoint. The zero-price list changes as providers add and retire free models.
- **Docs:** <https://zenmux.ai/docs/guide/quickstart.html>, <https://zenmux.ai/docs/guide/pay-as-you-go.html>, <https://zenmux.ai/api/v1/models>
### Requesty

- **Base URL:** `https://router.requesty.ai/v1`
- **Auth:** `Authorization: Bearer <REQUESTY_API_KEY>`
- **Free without card:** **YES.** The official free-model page states free models require no card.
- **Free models (11):** `ling-3.0-tiny`, `nemotron-3-nano-30b-a3b`, `nemotron-3-nano-omni-30b-a3b-reasoning`, `nemotron-3.5-lightning-30b-a3b`, `nemotron-3.5-content-safety`, `nemotron-3-super-120b-a12b`, `nemotron-3-ultra-550b-a55b`, `muse-glimmer-30b`, `gemma-4-31b-it`, `leanstral-1-5`, `leanstral-1-5@eu`
- **Correction (2026-10-21):** the earlier list carried `iling-3.1-flash` and `iling-3.0-tiny`. Those ids do not exist on Requesty; the catalogue says `ling-3.0-tiny`. `laguna-m.1` and `laguna-xs.2` are marked deprecated upstream, so they are no longer shipped.
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

### BazaarLink

- **Base URL:** `https://api.bazaarlink.ai/v1`
- **Auth:** `Authorization: Bearer sk-bl-<key>`
- **Free without card:** **YES.** Sign-up hands out an API key straight away and the docs define an account tier for accounts that never topped up ("未儲值"), where the free models cost $0 and no credits are deducted.
- **Free model ids (7):** `qwen/qwen3.7-flash`, `reflection/beam`, `reflection/beam-free`, `nvidia/nemotron-3.5-lightning-free`, `stealth/glyph-cluster`, `deepseek/deepseek-v4-flash-0731free`, and the router id `auto:free`. The live catalogue at `GET /v1/models` is public and needs no key; `stealth/cat-jam` was dropped because the upstream no longer lists it as free.
- **Free-tier limits:** **10 RPM and 60 daily units per model.** A separate account tier applies on top: 20 RPM below a $5 balance, 200 RPM at $5 or more, with no daily request cap.
- **⚠️ Paid-fallback risk:** the docs state that free-model overage can switch to paid usage *when the account holds a balance*. The gateway therefore sends **`X-Free-Fallback: false` on every request**, which is asserted by a test.
- **Other caveats:** Never append `:free` to an arbitrary paid model. The free catalogue changes, so ids must be re-read from `GET /v1/models`. Long non-streaming requests may return HTTP 200 before a later error, so streaming is recommended for long requests. Client-supplied routing fields (`provider`, `route`, `transforms`, `service_tier`) are stripped by the gateway.
- **Docs:** <https://bazaarlink.ai/docs>, <https://bazaarlink.ai/docs/api>


### AnyAPI

- **Base URL:** `https://api.anyapi.ai/v1`
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Free without card:** **YES** — the official pricing page explicitly says the $0 free plan requires no credit card.
- **Free-tier limits:** **100,000 AnyTokens/day**, resetting every 24 hours and not carrying over; **100 requests per minute**.
- **Free models (3):** `qwen/qwen3.8-27b:free`, `inclusionai/ling-3.0-flash-fin:free`, `inclusionai/ling-3.0-flash-sante:free`. The ids are published on the model pages of the official catalogue.
- **Caveat:** the catalogue endpoint `GET /v1/models` answers 401 without a key, so the ids are read from the official model pages instead. The Gemma free entry disagrees with itself (the id field and the code samples name different models), so that one is not shipped.
- **Docs:** <https://docs.anyapi.ai/>, <https://anyapi.ai/pricing>


### OpenRouter

- **Base URL:** `https://openrouter.ai/api/v1`
- **Auth:** `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Free without card:** **YES** — the pricing table lists "Payment options: No" for the Free plan, and the docs state *"The Free plan works without a payment method."*
- **Free models (20):** the 17 `:free` ids of the official `GET /v1/models` catalogue, the Free Models Router id `openrouter/free`, and the two zero-price Google models the snapshot confirms. Only `:free` variants and the free router are free; a fallback that resolved to a paid model would incur charges.
- **Paid-fallback protection:** the gateway disables provider-side fallback for this gateway.
- **Free-tier limits:** **20 requests per minute and 50 per day**, rising to 1,000 per day once the account has bought at least $10 of credits. Failed attempts count towards the daily cap, and a negative balance blocks free models until credits are added.
- **Attribution headers sent:** `HTTP-Referer: http://localhost:8787`, `X-Title: Local AI Gateway` (asserted by a test).
- **Docs:** <https://openrouter.ai/docs/guides/routing/model-variants/free>


### Cloudflare Workers AI

- **Base URL:** `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` — the account id belongs to the person using it, so it must be filled in before the provider can be used. The gateway refuses to save a base URL that still holds the `YOUR_ACCOUNT_ID` placeholder.
- **Auth:** `Authorization: Bearer <CLOUDFLARE_API_TOKEN>` with Workers AI permissions.
- **Free without card:** **YES.** The pricing page states: *"Our free allocation allows anyone to use a total of 10,000 Neurons per day at no charge."* The Workers Free plan is the default, and Cloudflare's plan pages say *"Start building for free — no credit card required."*
- **Free models (15):** `@cf/meta/llama-3.2-1b-instruct`, `@cf/meta/llama-3.2-3b-instruct`, `@cf/meta/llama-3.1-8b-instruct-fp8`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/openai/gpt-oss-20b`, `@cf/openai/gpt-oss-120b`, `@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/qwen/qwen3.8-27b`, `@cf/qwen/qwen2.5-coder-32b-instruct`, `@cf/qwen/qwq-32b`, `@cf/ibm-granite/granite-4.0-h-micro`, `@cf/zai-org/glm-4.7-flash`, `@cf/nvidia/nemotron-3-120b-a12b`, `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`, `@cf/mistralai/mistral-small-3.1-24b-instruct`.
- **Not free:** eight models need a paid billing method and are therefore excluded: `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `@cf/deepseek-ai/deepseek-v4.1-flash-1017` and `@cf/deepseek-ai/deepseek-v4-pro-0813`.
- **Free-tier limits:** 10,000 neurons per day, resetting at 00:00 UTC; 300 requests per minute for text generation; the Workers free plan allows 100,000 requests per day overall.
- **Docs:** <https://developers.cloudflare.com/workers-ai/platform/pricing/>, <https://developers.cloudflare.com/workers-ai/platform/limits/>, <https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/>

### OpenCode Console (Zen)

- **Base URL:** `https://opencode.ai/inference/openai/v1`
- **Model list:** `https://opencode.ai/inference/v1/models` (not next to the chat endpoint).
- **Auth:** `Authorization: Bearer <OPENCODE_API_KEY>`
- **Free without card:** **NO.** The documented way in is to sign in, add billing details and credits, and copy the key; the payment methods run through Stripe. The models themselves are free.
- **Free models (14):** `big-pickle`, `glm-5.3-flash-free`, `deepseek-v4.1-flash-free`, `minimax-m3.1-flash-free`, `beam-free`, `ll-alpha-free`, `longcat-2.5-preview-free`, `exo-free`, `mimo-v2.6-flash-free`, `mimo-v2.5-free`, `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `nemotron-3.5-super-vl-free` and `jev-1.13-free`. The pricing table lists all fourteen at Free.
- **Free-tier limits:** none published. The free models are free "for a limited time".
- **Caveats:** A key is required. The **keyless** path is refused: the upstream answers HTTP 403 with `{"type":"error","error":{"type":"FreeTierError","message":"OpenCode's free tier can only be used from within OpenCode."}}`. The documentation does publish these endpoints for "another coding agent", so a key is the way in.
- **Paid-fallback risk:** paid models fail with HTTP 402 once the balance reaches zero. Only the free models belong behind this gateway.
- **Privacy:** some free models keep the prompts for 30 days, and the NVIDIA free endpoints are trial use only.
- **Docs:** <https://opencode.ai/v2/docs/console/models/>, <https://opencode.ai/v2/docs/console/billing/>

### OpenCode Go

- **Base URL:** `https://opencode.ai/inference/go/openai/v1`
- **Model list:** `https://opencode.ai/inference/go/v1/models`
- **Auth:** `Authorization: Bearer <OPENCODE_API_KEY>`
- **Free without card:** **NO.** Go is a subscription: **$10/month** for Go and **$40/month** for Go Plus. The three models below are free, the seat is not.
- **Free models (3):** `minimax-m3.1-flash-free`, `longcat-2.5-preview-free` and `beam-free` — all three are priced Free with an **unlimited** monthly allowance, and the documentation says the free models stay usable when the usage limit is reached.
- **Caveats:** Beam Free is not available in a long list of countries and regions, including China (including Hong Kong and Macau), Russia, Iran, Iraq, Libya, North Korea and Syria. The free models are free "for a limited time". Only the chat-completions models are reachable from this gateway: the others live behind the Anthropic or the Responses endpoints.
- **Docs:** <https://opencode.ai/v2/docs/console/go/>

---

## UNVERIFIED providers

These ship **disabled**. Where free model ids were confirmed from official docs they are listed, but they are **not pre-allowlisted**; the administrator opts in.


### Zhipu BigModel (GLM) — UNVERIFIED (card requirement not established)

- **Base URL:** `https://open.bigmodel.cn/api/paas/v4`
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Free models documented (2):** `GLM-4.7-Flash`, `GLM-4-Flash-250414`. The pricing page lists both at 免费 (free) for input and output. `GLM-4.5-Flash` was decommissioned on 2026-01-30 and the GLM-Z1 series is offline, so neither is shipped.
- **No-card:** **UNVERIFIED** — docs call these models free but never address the payment method.
- **Limits:** concurrent-request tiers of 200 / 1,000 / 2,000 / 3,000 are documented for `GLM-4-Flash-250414` (V0–V3). No numeric daily token limit is published for the newer free ids.
- **Caveats:** Zhipu documents that some interface differences from OpenAI remain. Do not assume older Flash limits apply to newer free models.
- **Docs:** <https://docs.bigmodel.cn/cn/guide/develop/openai/introduction>, <https://docs.bigmodel.cn/cn/guide/start/model-overview>


### Poolside (Laguna) — UNVERIFIED (payment method not addressed)

- **Base URL:** `https://inference.poolside.ai/v1`
- **Auth:** `Authorization: Bearer <API key>` from the Poolside Platform.
- **Free access:** the official model page offers the hosted API **"Free to use for a limited time"** and the docs hand out a platform key for free developer access. **No-card: UNVERIFIED** — no official page states it, and the pricing page is access gated.
- **Free model ids (2):** `poolside/laguna-s-2.1` and `poolside/laguna-xs-2.1`. The hosted endpoint serves the plain ids; the `:free` ids belong to **OpenRouter** and are not used here. `poolside/laguna-m.1` is not offered by the hosted endpoint.
- **Caveats:** thinking is enabled by default and responses may include `reasoning_content`. Default `max_tokens` is 32,768, documented range up to 262,144. No numeric free-tier limit is published.
- **Docs:** <https://docs.poolside.ai/api/overview>, <https://poolside.ai/blog/introducing-laguna-xs-2-1>

### Mistral — UNVERIFIED (no free chat model)

- **Base URL:** `https://api.mistral.ai/v1`
- **Auth:** `Authorization: Bearer <MISTRAL_API_KEY>`
- **Free without card:** **YES** — the glossary states Free mode is the default and *"API access is enabled by default with no credit card required"*.
- **Free models:** **none.** The official pricing page lists exactly one model at Free — **Mistral Moderation 2** — and it serves `/v1/moderations`, not chat. Every chat model has a price, including the `mistral-small-latest` and `mistral-large-latest` ids used by the Free-mode quickstart. The numeric Free-mode quota lives in the organisation limits page and is not published as a static table.
- **Docs:** <https://docs.mistral.ai/resources/glossary.md>, <https://docs.mistral.ai/inference/pricing>, <https://docs.mistral.ai/api/endpoint/chat>


### Cline — UNVERIFIED, the documentation contradicts itself

- **Base URL:** `https://api.cline.bot/api/v1` (note the extra `/api` segment)
- **Auth:** `Authorization: Bearer <CLINE_API_KEY>`
- **Free access:** **contradictory.** The free-models page states free model usage is **not supported through the Cline API** and is limited to the IDE extension and CLI, while the API pages offer `:free` models and show `minimax/minimax-m2.5` for free experimentation. **No-card: UNVERIFIED.**
- **Free models:** **none pre-allowlisted.** The live catalogue at `GET https://api.cline.bot/api/v1/models` does expose 17 `:free` ids, but with the documentation contradicting itself and the payment method unaddressed, the provider ships disabled.
- **Streaming:** Yes, `stream: true` as SSE.
- **Why it ships at all:** so an administrator who already holds a paid Cline key can deliberately point the gateway at it. Nothing about it is free-enabled.
- **Docs:** <https://docs.cline.bot/api/overview>, <https://docs.cline.bot/getting-started/free-models>

### SiliconFlow — UNVERIFIED

- **Base URL:** `https://api.siliconflow.com/v1`
- **Free models:** the official free-model page lists `Qwen/Qwen2-7B-Instruct`, `Qwen/Qwen2-1.5B-Instruct`, `Qwen/Qwen1.5-7B-Chat`, `THUDM/glm-4-9b-chat`, `THUDM/chatglm3-6b`, `internlm/internlm2_5-7b-chat` and `mistralai/Mistral-7B-Instruct-v0.2`, and the price table adds `01-ai/Yi-1.5-9B-Chat-16K` and `01-ai/Yi-1.5-6B-Chat`. **None is pre-allowlisted:** those pages are no longer listed in the docs index and the current price list no longer contains a free model. **No-card: UNVERIFIED.**
- **Signup credit:** a coupon with an expiry, not a permanent allowance.
- **Limits:** free-model limits are described as "fixed" but no numeric free-tier limit is published; the documented tiers are paid-account tiers.
- **Docs:** <https://docs.siliconflow.com/quickstart/models>, <https://docs.siliconflow.com/en/faqs/billing-rules>, <https://docs.siliconflow.com/en/userguide/quickstart>

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

## The models.dev price catalogue

Documentation is the primary source in this matrix, but it cannot answer every question. Some providers document a free tier without ever publishing the model ids that belong to it (OpenRouter and Poolside were the two worst cases), and a documentation page that lists a model does not say what it costs today.

[models.dev](https://models.dev/) publishes one JSON document with every model it knows about, the provider it belongs to, its context window and its price. A model whose **input price and output price are both zero** is free, which is exactly the property this gateway is built on.

The gateway therefore keeps a **snapshot** of that catalogue:

```powershell
npm run sync:models
```

The script downloads <https://models.dev/api.json>, keeps the free models of every provider the gateway supports, and writes `src/providers/models-dev.generated.ts`. The snapshot is committed, so the build never needs network access and every id in the repository can be traced to a date and a source.

What the snapshot changes:

- **It widens the free lists.** Kilo ships 22 free ids instead of 1, and OpenRouter gains the two zero-price Google models next to its 17 documented `:free` ids.
- **It fills in the limits.** The context window and the output limit of a model come from the same record as its price.
- **It corrects typos.** The Requesty list contained `iling-3.1-flash` and `iling-3.0-tiny`; the catalogue says `ling-3.0-tiny`, and `iling-3.1-flash` does not exist on Requesty at all.
- **It is not used everywhere.** Poolside and ZenMux are left out on purpose: for both, the provider publishes its own exact catalogue and the snapshot lags behind it.

What it does **not** change:

- The hand-written entries keep their documentation link. The snapshot only adds models the hand list does not have, and fills in a context window that the hand list leaves out.
- It says nothing about whether a provider needs a card, how fast it rate limits, or whether the free tier is open to a new account. Those still come from the documentation, and they still decide the ship status.
- It does not turn a paid model into a free one. A model with a price on either side is never added.
- Poolside is deliberately left out of the snapshot: its price catalogue describes the OpenRouter ids, while the hosted endpoint the gateway talks to serves a different, documented set of ids.

Every model the snapshot contributes records its own provenance, so the console can always answer *"why is this model here?"*:

```
https://models.dev/api.json (price 0, retrieved 2026-10-21)
```

---

## Re-verification

Free tiers change. Re-check this matrix whenever you see an unexpected `429`, an unexpected `404` on a model that used to work, or a invoice. The verification date at the top of this file is the honest answer to *"when was this last confirmed"*.
