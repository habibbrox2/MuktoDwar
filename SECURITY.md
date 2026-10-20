# Security

**Project:** Local AI Gateway — a local-only, free-model-only gateway for Windows.
**Last reviewed:** 2026-10-20

---

## Threat model

The gateway is a local service that holds **third-party API keys** and forwards **user prompts** to external AI providers.

**What we defend against**

| # | Threat | Primary control |
|---|---|---|
| 1 | API keys read from disk by another local account or a backup tool | Windows DPAPI `CurrentUser` encryption + `icacls` ACL |
| 2 | A remote host reaching the gateway via DNS rebinding | Loopback-only bind + `Host` header validation (421) |
| 3 | A remote host reaching the gateway because it was misconfigured to `0.0.0.0` | `host` is `z.literal('127.0.0.1')` — any other value fails config validation at load |
| 4 | An unauthenticated local process calling the API | Bearer gateway token, constant-time comparison |
| 5 | A webpage on `localhost` mutating gateway state | `Origin` check on mutations + `SameSite=strict` httpOnly session cookie |
| 6 | Key material leaking into logs | Two-layer redaction: credential patterns + registered secret values |
| 7 | Paid models being contacted accidentally | Single choke point in `Router.candidates()` — `if (!entry.free) continue` |
| 8 | Paid fallback billed by an aggregator | `X-Free-Fallback: false` on BazaarLink; paid fallback disabled for OpenRouter |
| 9 | A truncated config after a crash or power loss | Atomic write: temp file in the same dir → `fsync` → `rename` |
| 10 | Supply chain | 4 runtime dependencies, no native modules, no install scripts of our own |

**What we explicitly do NOT defend against**

- A local attacker who can read this process's memory, or who can run code as **your Windows user**. DPAPI `CurrentUser` protects data **at rest** against other users and against offline disk access; it does not protect against code running as you.
- Prompt content in transit to the provider. Traffic leaves your machine and is sent to the provider over HTTPS.
- The provider itself logging your prompts. See [docs/providers.md](docs/providers.md) — several free tiers state that prompts may be used to improve models.
- A malicious or compromised npm dependency at install time. `npm ci` from the lockfile is the mitigation; review `npm install-scripts ls` before approving install scripts.

---

## Secret storage — Gate G

**Chosen driver:** Windows DPAPI via a PowerShell subprocess (`CurrentUser` scope).
**Implementation:** [scripts/dpapi.ps1](scripts/dpapi.ps1) driven by [src/security/dpapi.ts](src/security/dpapi.ts), consumed through [src/security/secret-store.ts](src/security/secret-store.ts).

### Why a subprocess

The alternative was a native npm module. A subprocess was chosen because:

- It requires **no native module and no build toolchain** — `typescript` compiles the Node side only.
- The Windows crypto provider does the actual cryptography; Node never implements any.
- There is **no prebuilt binary of uncertain provenance** entering `node_modules`.
- The process boundary is an auditable, narrow interface.

### Invariants

1. **No plaintext fallback — ever.** If DPAPI fails, the operation throws `SecretStoreError`. There is no code path that writes an unencrypted secret, no environment variable that enables one, and no configuration switch that could introduce one.
2. **Secrets travel only over stdin/stdout.** They are never placed in argv, never in the command line, never in a temp file, never in an environment variable.
3. **No shell.** The child is spawned with `shell: false` and a fixed argv vector (`-NoProfile -NonInteractive -ExecutionPolicy Bypass -File <path>`), so there is no interpolation surface at all.
4. **Bounded invocation.** Every call has a hard timeout (default 15 s); a hung child is killed. stdout is capped (8 MiB), stdin is capped (1 MiB).
5. **Strict output validation.** The codec must return well-formed JSON with exactly the expected number of results. Anything else is `DPAPI_MALFORMED_OUTPUT`.
6. **stderr is drained and discarded**, because a PowerShell error record can echo request content.
7. **Errors carry a coarse machine code only.** No message from the child is ever surfaced into a client response or a log line.

### Verified on this machine

- PowerShell **5.1** at `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` (the `-File` mode needs an explicit `Add-Type` for `System.Security`; `ProtectedData` is available in 5.1).
- A `ConvertFrom-SecureString` round trip succeeded (492-character blob → decrypted).
- `CryptProtectData`/`CryptUnprotectData` round trip succeeded through the codec.
- Windows user context: `CurrentUser` scope binds ciphertext to this account on this machine.

### Cache lifecycle and invalidation strategy

Decrypted secrets live in memory **only** inside `SecretStore`'s private `Map`, and only briefly.

| Property | Value |
|---|---|
| Default TTL | **5 minutes** (`cacheTtlMs`) |
| Maximum entries | **64** (`maxCacheEntries`), oldest evicted first |
| Populated by | `set()` (after encrypting) and any `get()`/`getMany()` miss |
| Never populated by | anything unencrypted from disk — the only plaintext source is a DPAPI `unprotect` |
| Cleared when | a secret is `remove()`d, `clearCache()` is called, or the TTL elapses |

**Why a cache exists at all:** a provider adapter must resolve a key on *every* request. Without a cache that is one PowerShell process spawn (~500 ms) per candidate — unacceptable on a request path. The TTL bounds the exposure: plaintext key material exists in memory for at most 5 minutes after it was last touched, and at most 64 keys at a time.

**Invalidation is never load-bearing for correctness.** The cache is a performance optimisation only. A miss decrypts from DPAPI and yields the same value, so an evicted, expired, or corrupted cache entry cannot change the result — only slow it down. `clearCache()` exists so an administrator action (rotating a key, shutting down) can drop plaintext immediately without a process restart.

**Redaction is the second line of defence.** Every decrypted value is registered with [src/security/redact.ts](src/security/redact.ts), so even if a secret reached a log line by an unforeseen path, it is replaced with `[REDACTED]`. Values under 8 characters are not registered, because redacting a 3-character string would corrupt output without protecting anything.

### Batch operations

`protectBatch()` / `unprotectBatch()` marshal many secrets into **one** child process, so storing N keys costs one spawn rather than N. `SecretStore.getMany()` exploits this for startup and for multi-candidate routing. Verified: *batches many secrets in one round trip*.

### Failure behaviour — fail closed

| Condition | Result |
|---|---|
| DPAPI encrypt fails | `SECRET_ENCRYPT_FAILED` — **nothing written to disk** |
| DPAPI decrypt fails | `SECRET_DECRYPT_FAILED` — **caller receives no value** |
| Corrupted ciphertext | rejected by the codec, surfaced as `DPAPI_OPERATION_FAILED` |
| PowerShell missing | `POWERSHELL_NOT_FOUND` |
| Codec script missing | `DPAPI_SCRIPT_NOT_FOUND` |
| Child hangs | `DPAPI_TIMEOUT`, child killed |
| Malformed / truncated / wrong-length output | `DPAPI_MALFORMED_OUTPUT` |
| Non-zero exit | `DPAPI_OPERATION_FAILED` |
| Empty secret | `SECRET_EMPTY` |

There is **no** degradation to plaintext, to another storage mechanism, or to a default value in any of these cases.

### Test evidence

`npx vitest run test/dpapi.test.ts` → **12/12 passing** against real Windows DPAPI on this machine:

```
✓ finds powershell.exe and the codec script
✓ round-trips a secret without exposing the plaintext
✓ produces different ciphertext for the same plaintext
✓ batches many secrets in one round trip
✓ fails closed on corrupted ciphertext
✓ reports a missing PowerShell executable
✓ reports a missing codec script
✓ enforces a timeout on a hanging codec
✓ rejects malformed codec output
✓ rejects a codec that returns the wrong number of results
✓ never writes secret material to stderr or to the error message
✓ rejects a codec script that does not reference ProtectedData
```

`npx vitest run test/secret-store.test.ts` → **12/12 passing**, including *never writes plaintext to disk*, *fails closed when the driver cannot encrypt/decrypt*, cache hit, TTL expiry, invalidation on removal, and batched decryption.

### Future alternative — `@primno/dpapi` (not added)

A native Node binding would remove the ~500 ms spawn cost. It is **deliberately not added in this phase**. Before it could be considered, review:

1. **Package metadata** — publish history, download counts, maintainer identity and bus factor.
2. **Maintenance status** — last publish vs. the current Node ABI; whether prebuilds exist for Node 22/24/26 on `win32-x64`.
3. **Binary provenance** — whether prebuilt `.node` binaries are published with checksums, whether builds are reproducible and CI-published, or whether `node-gyp` compiles from source locally. A silently-updated prebuilt binary is a direct code-execution path.
4. **Security risks** — a native module runs with full process privileges and bypasses the JS sandbox, so a compromise is total. It also links to `crypt32.dll` directly, so the `CurrentUser` scope and entropy handling must be re-audited rather than inherited from `ProtectedData`.

The driver sits behind the small `DpapiDriver` interface (`id`, `protect`, `unprotect`, `protectBatch`, `unprotectBatch`, `close`). A native implementation can replace the PowerShell one **without changing `SecretStore`, the router, the API, or any test that does not target the driver directly**.

---

## Network exposure

- Bind address is `z.literal('127.0.0.1')` in the schema — `0.0.0.0`, `localhost`, `::` and any LAN address are **configuration errors** that abort startup.
- `assertLoopbackBind()` re-checks at boot as defence in depth.
- Every request must carry a loopback `Host` header or it is rejected with **421**. This is the DNS-rebinding control: a remote page resolving an attacker domain to `127.0.0.1` would otherwise present that domain as the Host.
- `trustProxy: false`, so `X-Forwarded-For` cannot influence anything.
- Outbound calls go only to the base URLs in the provider catalog (or an administrator-supplied override).

## Authentication

- **Gateway token** — required on `/v1/*`. Issued randomly on first run, stored DPAPI-encrypted, sent as `Authorization: Bearer <token>`. Compared with `timingSafeEqual`.
- **Admin token** — required on `/admin/*`. Exchanged **once** for an httpOnly, `SameSite=strict` session cookie so the token itself never reaches browser storage. Sessions live 12 hours and can be revoked.
- **No token configured → 503**, not a silent bypass.
- State-changing admin requests additionally require a loopback `Origin`.

## Logging

Every log line passes through `redactValue()`:

1. **Value redaction** — exact registered secret values are replaced first, longest-first so a secret containing another is replaced whole.
2. **Pattern redaction** — `sk-…`, `AIza…`, `Bearer …`, `api_key:`/`token:`/`password:` fields, `?token=` query params, and JWTs.

Request logs record only method, path (query stripped), status and duration. Fastify's `req` serializer is overridden to the same redacted summary. Upstream **stderr is never surfaced**.

## Data at rest

| File | Contents | Protection |
|---|---|---|
| `%LOCALAPPDATA%\LocalAIGateway\config.json` | provider ids, model allowlist, routing | ACL via `icacls` (this user + Administrators only) |
| `%LOCALAPPDATA%\LocalAIGateway\secrets.json` | DPAPI `CurrentUser` ciphertext only | DPAPI **plus** ACL |

All writes are atomic (temp file in the same directory → `fsync` → `rename`), so a crash cannot leave a half-written document. Nothing is written to the repository directory at runtime; `.gitignore` excludes state, `dist/`, `node_modules/` and logs.

**No secret is ever committed.** The repo contains no key material; keys live only in `secrets.json` under `%LOCALAPPDATA%`, outside the project.

## Reporting

This is a local, single-user project with no hosted component. If you find a vulnerability, report it privately to the project owner rather than opening a public issue with exploit detail.
