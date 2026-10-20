# MuktoDwar UI Migration — Phase 0 Audit Report

Date: 2026-10-20
Scope: Read-only audit. No source files modified by this report.

## 1. Baseline evidence

- Branch: `main`
- Last commit: `2881290 fix(ui): label provider priority and checkbox fields`
- Git status before audit: clean (only untracked `.tmp-font/`, `screenshots/`).
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm test`: 8 test files, 128 tests PASS.
- `npm run brand:build`: available; `npm run site:build`: available.

## 2. Stack and architecture

- Runtime: Node.js >=22.12, TypeScript (ES2023, NodeNext), Fastify, Zod.
- Frontend: Plain ES modules, no framework, no build step for UI. Served from `src/ui/` via `@fastify/static` at `/ui/`. Brand assets served from `assets/brand` at `/brand/`.
- Styling: single `src/ui/styles.css` (~640 lines) with CSS variables; neon identity appended and merged.
- No heavy UI library; toasts, dialogs, tabs implemented in `src/ui/app.js` (~560 lines).
- Site (GitHub Pages): `site/` static HTML + `site/assets/site.css`; build copies brand assets.

## 3. File map (relevant)

Backend:
- `src/index.ts` — entrypoint, token ensure/rotate, server start, auto-open browser.
- `src/app.ts` — Fastify app, static registration (`/ui/`, `/brand/`), admin shell served from memory.
- `src/api/admin.ts` — admin routes (session, catalog, config, routing, gateway, providers, models, status, tokens, default-token, test-connection).
- `src/api/routes.ts` — health, v1/* (models, embeddings, chat, images, responses).
- `src/security/auth.ts`, `secret-store.ts` — DPAPI secrets, admin sessions.
- `src/config/schema.ts`, `store.ts`, `paths.ts` — config + paths (incl. admin-token-rotated marker).
- `src/providers/catalog.ts`, `router.ts`, `adapter.ts`, `health.ts`.

Frontend:
- `src/ui/index.html` — admin shell (gate + console, provider dialog).
- `src/ui/app.js` — all client logic.
- `src/ui/styles.css` — all styles.

Brand:
- `assets/brand/*` (SVG/PNG/ICO), `scripts/generate-brand-assets.mjs`, `docs/brand/muktodwar-brand-guide.md`.
- `site/index.html`, `site/assets/site.css`, `scripts/build-site.mjs`.

Tests:
- `test/brand-assets.test.ts` (asset dimensions, safety, reduced motion).
- `test/api.test.ts` and others (128 tests).

## 4. Existing UI components (reusable)

- Gate (sign-in) with brand mark, default-token display + copy.
- Top bar with brand, status pills, refresh/lock.
- Symbol-only tab navigation (providers, models, routing, status, tokens).
- Panels: providers list, models list, routing form, status table, tokens.
- Provider editor dialog: kind, label, id, key, base URL override, priority, enabled, anonymous, model chips, test connection, fetch remote models.
- Toast, empty states, chips, table, dialog backdrop.
- Reduced-motion and responsive breakpoints.

## 5. Admin API inventory

Session: POST/DELETE `/admin/session`.
Catalog/config: GET `/admin/catalog`, GET `/admin/config`, PUT `/admin/routing`, PUT `/admin/gateway`.
Providers: POST `/admin/providers`, DELETE `/admin/providers/:id`, POST `/admin/providers/:id/models`, DELETE `/admin/providers/:id/models/:model`.
Status: GET `/admin/status`.
Tokens: POST `/admin/tokens/gateway/rotate`, POST `/admin/tokens/admin/rotate`.
Helpers: GET `/admin/default-token`, POST `/admin/providers/test-connection`.

Public: `/health`, `/v1/models`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/images/generations`, `/v1/responses`.

## 6. Gaps vs. migration plan

Phase 1 (Design system): Mostly present (dark/violet/blue, Inter, responsive, reduced motion). Missing: reusable skeleton/empty states already partial; no sidebar (top tabs instead). Acceptable.

Phase 2 (Provider/Model mgmt): Present. Missing: delete provider confirmation, unsaved-change warning, multi-key per provider management UI (backend supports keys but UI only single key input), masked key display.

Phase 3 (API Playground): MISSING entirely. No chat/streaming playground, no client snippet generator.

Phase 4 (Security & Settings): Partial (token rotate + copy). Missing: DPAPI status widget, bind config view, theme/reduced-motion preference toggle (CSS only), re-auth for sensitive ops.

Phase 5 (Brand animation): Present (assets). UI does not embed animated logo; reduced-motion honored in CSS.

Phase 6 (Regression): Tests exist but no UI integration tests; no screenshots in repo.

## 7. Security observations

- Local-only binding enforced (`127.0.0.1`).
- Admin token exposed via `/admin/default-token` until first rotation (marker file). This is a deliberate UX choice but broadens secret exposure on localhost. Consider restricting to first-run only or removing after first successful login.
- API keys never returned; masked in UI.
- Host header check (DNS rebinding) present.
- DPAPI fail-closed.

## 8. Risk register

1. Auto-open browser on every server start may be intrusive; no disable flag.
2. `/admin/default-token` exposes secret until rotation; marker-based gating relies on filesystem.
3. No automated UI tests; regressions in app.js won't be caught.
4. Provider dialog uses chip toggles; accessibility (keyboard) present but no focus trap in dialog.
5. Remote model fetch assumes OpenAI-compatible `/models`; providers may differ.
6. Large single CSS/JS files; maintainability risk as features grow.
7. Encoding sensitivity: HTML symbols require UTF-8; tooling must preserve.

## 9. Recommended migration order (per plan)

1. Phase 0 complete (this report).
2. Phase 1: extract reusable CSS tokens/components, add skeleton/empty states, optional sidebar.
3. Phase 2: multi-key management, delete confirmations, unsaved-change warning.
4. Phase 3: API Playground (chat + SSE) — biggest new feature.
5. Phase 4: Security & Settings (DPAPI status, bind view, preferences).
6. Phase 5: embed animated logo in loading states.
7. Phase 6: integration tests, a11y, responsive review, release notes.

## 10. Rollback

All changes are additive; revert commits or restore `src/ui/*` from git. No DB/migrations. Secrets/config persist under %LOCALAPPDATA%\LocalAIGateway.

---
This is a planning document. No approval to implement beyond Phase 0 is granted.
