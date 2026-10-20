# MuktoDwar Brand Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reusable, accessible MuktoDwar Open Gateway brand system for its Windows app, GitHub repository, web surface, and loading state.

**Architecture:** Keep editable, dependency-free SVG files as the canonical visual source in `assets/brand/`. Generate every binary derivative from those sources through a checked-in Node build script, so PNG, ICO, favicon, and banner files stay synchronized. The site copies this one brand directory verbatim into its published output and consumes only those canonical assets.

**Tech Stack:** SVG 1.1, CSS animation, Node.js ESM build script, Sharp for reproducible rasterization, Vitest, GitHub Pages static site.

**Spec:** User-provided brief in `C:\Users\Hr Habib\.codex\attachments\2cb66a30-b039-4877-93b3-88894972253a\Pasted text.txt` (selected direction: **Open Gateway**, dark + violet + blue, all listed asset types).

## Global Constraints

- The brand name must be exactly `MuktoDwar` in every asset and document.
- The central symbol is an open gateway/door with only a small, intentional set of connected nodes; do not add brains, robots, or circuit decoration.
- Use the dark, violet, and blue identity: `#0D1117`, `#8A2BE2`, `#9D4EDD`, `#0077FF`, and the existing cyan connection highlight `#00B4D8`.
- SVG files must contain no scripts, embedded rasters, external URLs, or runtime dependencies.
- Preserve the existing uncommitted brand files until their replacement is generated and validated; do not delete unrelated worktree changes.
- The animated source must be a 2.5-second seamless SVG/CSS loop, honor `prefers-reduced-motion`, and have a static fallback.
- All raster derivatives must be reproducible from source; ICO must include 16, 24, 32, 48, and 256 px entries.
- GitHub banner dimensions are exactly 1280 × 640 px and must retain legible left-side copy in a narrow preview.

## Review Focus

- A 16 px icon must retain a recognizable door opening rather than collapsing into an indistinct hexagon; validate the ICO and favicon at 16 px and 32 px.
- Every deliverable should render without system fonts; use outlined paths for the logo/banners that contain `MuktoDwar`.
- Static SVGs must remain safe to inline in desktop WebView and GitHub Pages (no executable or externally fetched content).
- Motion-reduction users must see the final static lockup with no visual disappearance or continuous animation.
- The published `dist-site/` build must include each logo and icon URL referenced by its HTML, and must not depend on files outside the build output.

### Task 1: Define and validate the canonical vector system

**Files:**
- Create: `docs/brand/muktodwar-brand-guide.md`
- Create: `assets/brand/muktodwar-logo-stacked-dark.svg`
- Create: `assets/brand/muktodwar-logo-stacked-light.svg`
- Modify: `assets/brand/muktodwar-mark.svg`
- Modify: `assets/brand/muktodwar-logo-dark.svg`
- Modify: `assets/brand/muktodwar-logo-light.svg`
- Modify: `assets/brand/muktodwar-favicon.svg`
- Modify: `scripts/wordmark.py`
- Test: `test/brand-assets.test.ts`

**Interfaces:**
- Consumes: the selected Open Gateway direction and palette in the user brief.
- Produces: seven canonical SVG variants and a written token/usage reference consumed by the build, site, and app tasks.

- [ ] **Step 1: Write failing asset-system tests in `test/brand-assets.test.ts`**

Assert that the required SVG filenames exist, every file begins with an SVG root, contains no `<script`, `data:image`, or `http://`/`https://` references, and that wordmark variants do not contain a `<text` element.

- [ ] **Step 2: Run the asset-system test to verify it fails**

Run: `npm test -- test/brand-assets.test.ts`
Expected: FAIL because the full canonical variant set and outlined wordmark contract do not yet exist.

- [ ] **Step 3: Write `docs/brand/muktodwar-brand-guide.md`**

Document the Open Gateway meaning, five exact color tokens, Inter/Hind Siliguri/Fira Code typography roles, primary horizontal/stacked/mark/favicons, clear-space and minimum-size rules, contrast/theme selection, prohibited treatments, and the 2.5-second animation storyboard.

- [ ] **Step 4: Replace the canonical SVGs with one shared geometry system**

Build a geometric gateway outline, visibly open door plane, and three restrained node connections. Keep `muktodwar-mark.svg` as the transparent square master; provide horizontal dark/light and stacked dark/light lockups; keep `muktodwar-favicon.svg` as a dark rounded square with the simplified mark.

- [ ] **Step 5: Update `scripts/wordmark.py` to emit deterministic outlined glyph paths**

Make the script generate the `MuktoDwar` path data used by all text-bearing SVGs, retaining only a documented editable source fallback. Do not require a viewer-installed font.

- [ ] **Step 6: Run the asset-system test to verify it passes**

Run: `npm test -- test/brand-assets.test.ts`
Expected: PASS.

### Task 2: Generate platform and GitHub deliverables from canonical sources

**Files:**
- Create: `scripts/generate-brand-assets.mjs`
- Create: `assets/brand/muktodwar-logo-dark.png`
- Create: `assets/brand/muktodwar-logo-light.png`
- Create: `assets/brand/muktodwar-mark.png`
- Create: `assets/brand/muktodwar-icon-256.png`
- Create: `assets/brand/muktodwar.ico`
- Create: `assets/brand/favicon-16.png`
- Create: `assets/brand/favicon-32.png`
- Create: `assets/brand/favicon.ico`
- Create: `assets/brand/muktodwar-github-banner.png`
- Create: `assets/brand/muktodwar-github-banner.svg`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `test/brand-assets.test.ts`

**Interfaces:**
- Consumes: Task 1 SVG masters and tokens.
- Produces: `npm run brand:build`, deterministic PNG/ICO derivatives, and a GitHub-ready banner for Task 4.

- [ ] **Step 1: Extend `test/brand-assets.test.ts` with derivative checks**

Assert that each required PNG/ICO/banner file exists after the generator runs; inspect PNG dimensions for the 32 px favicon, 256 px app icon, and 1280 × 640 banner; inspect the ICO directory for 16, 24, 32, 48, and 256 px image entries.

- [ ] **Step 2: Run the derivative test to verify it fails**

Run: `npm test -- test/brand-assets.test.ts`
Expected: FAIL because no derivative generator or required binaries exist.

- [ ] **Step 3: Add one pinned dev dependency and a `brand:build` package script**

Use a Node-compatible SVG rasterizer/encoder that creates PNG and multi-resolution ICO files without shelling out to machine-specific GUI tools. Keep all artifact paths in `assets/brand/` and make the script fail on a missing canonical source.

- [ ] **Step 4: Implement `scripts/generate-brand-assets.mjs`**

Rasterize the dark/light horizontal logos, transparent mark, favicon sizes, and 256 px app icon. Compose `muktodwar-github-banner.svg` with left-aligned outlined MuktoDwar lockup and the exact tagline `Your Local Gateway to AI.`, plus a right-side abstract gateway/network graphic; rasterize it at 1280 × 640 px. Assemble both ICO files from their required size sets.

- [ ] **Step 5: Generate artifacts and run the derivative test**

Run: `npm run brand:build && npm test -- test/brand-assets.test.ts`
Expected: PASS, with no network references or missing required derivative.

### Task 3: Add accessible animated logo and a static fallback

**Files:**
- Create: `assets/brand/muktodwar-logo-animated.svg`
- Create: `assets/brand/muktodwar-logo-animated-static.svg`
- Modify: `test/brand-assets.test.ts`
- Modify: `docs/brand/muktodwar-brand-guide.md`

**Interfaces:**
- Consumes: Task 1 mark and lockup geometry.
- Produces: an embeddable animated loading asset and accessible static fallback for Windows/WebView and web use.

- [ ] **Step 1: Add motion contract assertions to `test/brand-assets.test.ts`**

Assert the animated and static files exist, the animated SVG includes `prefers-reduced-motion`, neither contains scripts or external URLs, and the static asset contains the final visible lockup.

- [ ] **Step 2: Run the motion test to verify it fails**

Run: `npm test -- test/brand-assets.test.ts`
Expected: FAIL because neither motion asset exists.

- [ ] **Step 3: Implement both animation SVGs**

Animate the outlined gateway reveal from 0–0.6 s, a cyan connection/node traversal from 0.6–1.5 s, and the settled final lockup from 1.5–2.5 s. Make it seamless and CSS-only; the reduced-motion media query must show the completed state, while `muktodwar-logo-animated-static.svg` provides a no-motion embedding alternative.

- [ ] **Step 4: Update the guide with embedding and reduced-motion guidance**

Specify animated SVG as the preferred web/WebView implementation, static SVG fallback, and prohibit GIF as the master source.

- [ ] **Step 5: Run the motion test**

Run: `npm test -- test/brand-assets.test.ts`
Expected: PASS.

### Task 4: Integrate and publish the brand system without breaking the site

**Files:**
- Modify: `site/index.html`
- Modify: `site/assets/site.css`
- Modify: `scripts/build-site.mjs`
- Modify: `README.md`
- Modify: `test/brand-assets.test.ts`

**Interfaces:**
- Consumes: all final assets and guide from Tasks 1–3.
- Produces: a site that consumes canonical brand files and a discoverable asset list for repository users.

- [ ] **Step 1: Extend the test with site publication assertions**

After `npm run site:build`, assert that every local `src`/`href` in `dist-site/index.html` resolves, the favicon has SVG and ICO declarations, and the published brand directory contains the PNG/ICO/animated derivatives.

- [ ] **Step 2: Run the publication assertion to verify it fails**

Run: `npm test -- test/brand-assets.test.ts`
Expected: FAIL until the site references and copy behavior include the complete set.

- [ ] **Step 3: Replace duplicated inline navigation art with `muktodwar-mark.svg` and link the favicon variants**

Use canonical SVG files in the markup; retain meaningful `alt` text. Add an ICO fallback favicon declaration and reference the manifest where appropriate. Add a compact loading-logo example that uses the animated SVG but disables it for reduced-motion users.

- [ ] **Step 4: Update the site build to verify and publish all brand asset extensions**

Keep copying the canonical brand directory, expand MIME support for WebP if later added, and verify local `poster`, `srcset`, and icon `sizes` URL attributes in addition to `src` and `href`.

- [ ] **Step 5: Add a brand-assets section to `README.md`**

Link the guide, list the key asset paths and intended uses, and give the exact regeneration command `npm run brand:build`.

- [ ] **Step 6: Run targeted verification and visually review builds**

Run: `npm run brand:build && npm run site:build && npm test -- test/brand-assets.test.ts && npm run typecheck`
Expected: all commands pass. Inspect the banner at full size and a 320 px viewport, logo at 16/24/32 px, dark/light lockups, and reduced-motion output manually.

### Task 5: Run final project verification

**Files:**
- Modify: no source files expected unless verification exposes a defect.

**Interfaces:**
- Consumes: the completed brand system.
- Produces: a verified handoff with any environmental limitations stated explicitly.

- [ ] **Step 1: Run the full verification suite**

Run: `npm run verify && npm run brand:build && npm run site:build`
Expected: TypeScript, all existing Vitest suites, brand tests, backend build, brand generation, and static-site checks pass.

- [ ] **Step 2: Review the final artifact inventory**

Run: `Get-ChildItem assets/brand -File | Select-Object Name, Length`
Expected: horizontal and stacked SVG/PNG logos, mark, animated/static animated SVG, favicon variants, Windows ICO, GitHub banner SVG/PNG, and the brand guide all exist.

- [ ] **Step 3: Commit**

```bash
git add assets/brand docs/brand scripts/generate-brand-assets.mjs scripts/wordmark.py site README.md package.json package-lock.json test/brand-assets.test.ts
git commit -m "feat(brand): add MuktoDwar open gateway identity"
```

## Self-Review

- **Spec coverage:** Tasks 1–4 cover the selected Open Gateway symbol, dark/violet/blue palette, SVG/PNG logo forms, GitHub banner, animation, Windows ICO/favicon, and guide. Task 5 supplies final verification.
- **Step scan:** Each task creates a testable visual or generation boundary; test commands state a concrete expected result.
- **Type consistency:** `assets/brand/` is the one producer path. Task 2 produces derivatives, Task 3 produces motion assets, and Task 4 only consumes and publishes them.
- **Review Focus:** Small-size recognition, font independence, safe SVG content, reduced motion, and site publish completeness each have a corresponding Task 1–4 assertion or manual review.
- **Proportion:** The plan defines the asset contracts and output names without prescribing individual SVG path data or generator implementation details.

