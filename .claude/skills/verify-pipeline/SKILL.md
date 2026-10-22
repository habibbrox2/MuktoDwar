---
name: verify-pipeline
description: Run the MuktoDwar full verification chain (typecheck, tests, build, version check) and report results honestly. Use when asked to "verify", "check the project", "run the tests", or "make sure it builds".
metadata:
  version: "1.0.0"
  domains: "testing, verification, build"
---

# Verify Pipeline

Run the project's full verification chain and report the outcome faithfully.

## When to use

The user asks to verify, check, test, or build the project. Also use before/after
any non-trivial change so the report can state what actually ran.

## Steps

Run these in order. Do not skip one because a previous one passed — each is a
separate signal.

1. `npm run typecheck` — TypeScript typecheck, no emit.
2. `npm test` — full vitest suite. Report the count: `Tests N passed (N)`.
3. `npm run build` — compile to `dist/`.
4. `npm run version:check` — confirm every version string matches `package.json`.
5. `npm start` — smoke test: confirm it listens on `127.0.0.1:8787` and the
   admin UI, API, and brand assets return 200/304. Kill it afterwards; do not
   leave it running.

## Reporting rules

- Report each check as pass/fail with the actual output. Never claim a check
  passed that did not run.
- If a check fails, show the error and stop — do not run later checks on a
  broken tree.
- Note anything that could **not** be verified in this environment: the Windows
  installer build (`scripts/build-installers.ps1`), the SEA bundle
  (`npm run build:sea`), and `editbin.exe` all require Windows. Say so plainly
  rather than implying they were checked.
- Mention drift between docs and code you notice (e.g. a test count in
  `README.md` that no longer matches the suite).

## Do not

- Do not modify source to make a failing check pass. Report the failure.
- Do not run `npm start` in the background and forget to kill it.