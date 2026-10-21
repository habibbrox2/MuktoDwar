# Connecting a client to MuktoDwar

MuktoDwar speaks the OpenAI API, so almost any client that can talk to
OpenAI can talk to the gateway instead. This guide has the three settings
every client needs, a copy-and-paste recipe for each one, and what to do
when a request fails.

---

## The three settings

| Setting | Value | Where it comes from |
|---|---|---|
| **Base URL** | `http://127.0.0.1:8787/v1` | fixed; the gateway only binds to the loopback interface |
| **API key** | your **gateway token** | the dashboard, **Tokens** tab |
| **Model** | `mukto-auto/free` | the gateway's own model id |

### `mukto-auto/free` is the one to use

It is not a model a provider sells. It is the gateway's own id for
**"any free model you have allowlisted"**, and it is the id a client
should be configured with:

- You configure it **once**. When you allowlist a new model, change a
  provider key or add a provider, the client keeps working — the gateway
  resolves the alias at request time.
- The gateway picks the best candidate with the same ranking it uses
  everywhere else: your priority order first, then measured latency, then
  provider health.
- The response tells you which model actually served the request, so the
  `model` field in the reply is the real upstream id, not the alias.
- It only ever resolves to a model that is **free** and allowlisted. If
  nothing is allowlisted, the request is rejected with `404 no_candidate`
  before any upstream call is made.

The exact ids of the models you have allowlisted are in
`GET /v1/models` if you prefer to pin one.

---

## Step 1 — check that the gateway is up

```powershell
curl http://127.0.0.1:8787/health
```

```json
{ "status": "ok", "version": "1.1.0", "uptimeSeconds": 12, "providers": 1, "models": 22 }
```

No token is needed for `/health`. If it does not answer, the gateway is
not running: start it with `npm start`, or launch **MuktoDwar.exe** if you
installed the desktop app.

## Step 2 — copy the gateway token

Open the dashboard at <http://127.0.0.1:8787/>, sign in with the
administrator token, and open the **Tokens** tab. The gateway token is
shown there together with a ready-made cURL command.

The same tab has a **Copy client config** button. Pick the format your
client uses — JSON, OpenCode, Continue or an environment variable — and
the configuration is copied with the endpoint, the token and the alias
already filled in, so there is nothing left to type.

If you rotate it, every client has to be updated with the new value.

## Step 3 — list the models you may use

```powershell
curl http://127.0.0.1:8787/v1/models -H "Authorization: Bearer $env:GATEWAY_TOKEN"
```

```json
{
  "object": "list",
  "data": [
    { "id": "mukto-auto/free", "object": "model", "created": 1792600000, "owned_by": "muktodwar", "free": true, "verified": true },
    { "id": "kilo-auto/free", "object": "model", "created": 1792600000, "owned_by": "kilo", "free": true, "verified": true }
  ]
}
```

The list starts with `mukto-auto/free`, the alias every client should
use, followed by the models you have allowlisted per provider. Pick either
one: the alias follows your allowlist, a fixed id pins one model.

## Step 4 — send a request

```powershell
curl http://127.0.0.1:8787/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $env:GATEWAY_TOKEN" `
  -d '{"model":"mukto-auto/free","messages":[{"role":"user","content":"Hello!"}]}'
```

```json
{
  "id": "gen-1792600000-abc",
  "object": "chat.completion",
  "model": "kilo-auto/free",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Hello!" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 9, "completion_tokens": 3, "total_tokens": 12 }
}
```

The reply carries the model that **actually** served the request, not the
alias you asked for. That is how you see which free model the gateway
picked for you.

The **API Playground** tab of the dashboard shows the same thing next to
the answer, so you can check which model is picked before you point a
client at the gateway.

If this works, every recipe below works too.

---

## Recipes

### OpenAI SDK — JavaScript / TypeScript

```js
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:8787/v1',
  apiKey: process.env.GATEWAY_TOKEN,
});

const completion = await client.chat.completions.create({
  model: 'mukto-auto/free',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(completion.choices[0].message.content);
```

Streaming:

```js
const stream = await client.chat.completions.create({
  model: 'mukto-auto/free',
  messages: [{ role: 'user', content: 'Write a haiku about routers.' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

### OpenAI SDK — Python

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key=os.environ["GATEWAY_TOKEN"],
)

resp = client.chat.completions.create(
    model="mukto-auto/free",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

Streaming in Python:

```python
stream = client.chat.completions.create(
    model="mukto-auto/free",
    messages=[{"role": "user", "content": "Write a haiku about routers."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### PowerShell

```powershell
$env:GATEWAY_TOKEN = 'paste-your-gateway-token-here'

$headers = @{
  'Content-Type'  = 'application/json'
  'Authorization' = "Bearer $env:GATEWAY_TOKEN"
}

$body = @{
  model    = 'mukto-auto/free'
  messages = @(@{ role = 'user'; content = 'Hello!' })
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/v1/chat/completions `
  -Headers $headers -Body $body
```

### PHP

```php
<?php
$ch = curl_init('http://127.0.0.1:8787/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . getenv('GATEWAY_TOKEN'),
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'model'    => 'mukto-auto/free',
        'messages' => [['role' => 'user', 'content' => 'Hello!']],
        'stream'   => false,
    ]),
]);
echo json_decode(curl_exec($ch), true)['choices'][0]['message']['content'];
```

### OpenCode

OpenCode can use the gateway as an OpenAI-compatible provider. Add it to
`~/.config/opencode/opencode.json` (or `opencode.json` in a project):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "muktodwar": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "MuktoDwar (local free gateway)",
      "options": {
        "baseURL": "http://127.0.0.1:8787/v1",
        "apiKey": "{env:MUKTODWAR_TOKEN}"
      },
      "models": {
        "mukto-auto/free": { "name": "MuktoDwar auto (free)" }
      }
    }
  },
  "model": "muktodwar/mukto-auto/free"
}
```

`{env:MUKTODWAR_TOKEN}` reads the token from the environment, so it never
ends up in the file. The `models` map needs the alias, and you can add
the pinned ids from `GET /v1/models` next to it.

### Continue (VS Code, JetBrains)

Continue reads `%USERPROFILE%\.continue\config.yaml` on Windows and
`~/.continue/config.yaml` elsewhere:

```yaml
name: MuktoDwar
version: 1.0.0
schema: v1
models:
  - name: MuktoDwar
    provider: openai
    model: mukto-auto/free
    apiBase: http://127.0.0.1:8787/v1
    apiKey: YOUR_GATEWAY_TOKEN
    capabilities:
      - tool_use
    roles:
      - chat
      - edit
      - apply
  - name: MuktoDwar (autocomplete)
    provider: openai
    model: mukto-auto/free
    apiBase: http://127.0.0.1:8787/v1
    apiKey: YOUR_GATEWAY_TOKEN
    roles:
      - autocomplete
```

`capabilities: [tool_use]` is what lets Continue use the gateway in
Agent mode, and the second entry gives the tab autocomplete a model of
its own.

### Cline, Roo Code and other VS Code extensions

Use the **OpenAI Compatible** provider:

| Field | Value |
|---|---|
| Base URL | `http://127.0.0.1:8787/v1` |
| API Key | your gateway token |
| Model ID | `mukto-auto/free` |

### Any other OpenAI-compatible client

Fill in the same three fields wherever the client keeps them. A client
that only offers an "OpenAI API key" and a "Base URL" works as it is; one
that insists on an OpenAI model name gets `mukto-auto/free`, or any id
from `GET /v1/models`.

### Aider

```yaml
# .aider.conf.yml
model: openai/mukto-auto/free
openai-api-base: http://127.0.0.1:8787/v1
openai-api-key: YOUR_GATEWAY_TOKEN
```

### LiteLLM

```python
from litellm import completion

response = completion(
    model="openai/mukto-auto/free",
    messages=[{"role": "user", "content": "Hello!"}],
    api_base="http://127.0.0.1:8787/v1",
    api_key=os.environ["GATEWAY_TOKEN"],
)
```

### LangChain

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key=os.environ["GATEWAY_TOKEN"],
    model="mukto-auto/free",
)
print(llm.invoke("Hello!").content)
```

---

## Keeping the token out of your code

Put the token in an environment variable and read it from there.

```powershell
# PowerShell, current session
$env:GATEWAY_TOKEN = 'paste-your-gateway-token-here'

# PowerShell, permanent for your account
[Environment]::SetEnvironmentVariable('GATEWAY_TOKEN', 'paste-your-gateway-token-here', 'User')
```

```bash
# macOS / Linux
export GATEWAY_TOKEN='paste-your-gateway-token-here'
```

```python
# Python, .env
GATEWAY_TOKEN=paste-your-gateway-token-here
```

The token is a secret: it is stored encrypted with Windows DPAPI and it
authorises every request the gateway makes on your behalf. Anyone who has
it can spend your free quota. Rotate it from the **Tokens** tab if it
leaks; the old value stops working immediately.

---

## When a request fails

| Symptom | Cause | Fix |
|---|---|---|
| `401` with `invalid_api_key` | the token is wrong, missing or was rotated | copy the gateway token again from the **Tokens** tab |
| `404` with `no_candidate` | the model is not allowlisted, or its provider is disabled | check `GET /v1/models`; enable the provider and allowlist the model. With `mukto-auto/free` this means the allowlist is empty |
| `404` with `unknown_route` | the base URL is wrong | it must end in `/v1` |
| `421` | the request came in with a foreign `Host` header | use `127.0.0.1`, not `localhost` or a hostname |
| `503` with `the gateway token has not been configured` | the secret store is empty | the gateway creates the token on first run; restart it |
| `502` with `all_attempts_failed` | the provider rejected the request | open the **Status** tab: it shows the upstream message for each attempt |
| The reply arrives late or in one block | the client does not read the stream | enable streaming on the client and read the body incrementally |
| `429` from the provider | the free tier of that provider is rate limited | the free quotas are small; retry later or allowlist a second provider |

---

## What the gateway does with your request

```
your client
   │  Authorization: Bearer <gateway token>
   ▼
MuktoDwar  ── checks the token
   │        ── checks the model is allowlisted and free
   │           (mukto-auto/free matches every allowlisted free model)
   │        ── picks a provider by priority, latency and health
   ▼
provider (Kilo, OpenRouter, a local Ollama, ...)
   │        ── your prompt goes to that provider, and nowhere else
   ▼
your client
```

Two things are guaranteed on the way through:

1. **Only free models are served.** A model that is not on the allowlist
   is rejected with `404 no_candidate` *before* any upstream call is made.
2. **No paid fallback.** The gateway does not silently switch to a
   priced model when a free one fails. It reports the failure instead.

---

## See also

- [README](../README.md) — the full project overview
- [docs/providers.md](providers.md) — which providers are verified free,
  and what the free limits are
- The dashboard at <http://127.0.0.1:8787/> — **Tokens** and **API
  Playground** tabs, where the snippets above are generated for you
