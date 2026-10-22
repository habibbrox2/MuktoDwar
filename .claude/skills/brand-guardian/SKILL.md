---
name: brand-guardian
description: Enforce the MuktoDwar brand identity (Open Gateway: neon open door with routing nodes, dark navy) across assets, site, and docs.
metadata:
  version: "1.0.0"
  domains: "branding, design, assets"
---

# Brand Guardian

Keep MuktoDwar's visual identity consistent.

## When to use

The user asks about brand assets, wants a logo/banner/favicon regenerated, or
asks you to check that a new UI element fits the brand.

## Identity

MuktoDwar uses the **Open Gateway** identity: a neon open door with connected
routing nodes, on a dark navy canvas. The complete guide is `docs/brand/muktodwar-brand-guide.md` — read it before designing anything.

## Assets

| Asset | Use |
|---|---|
| `assets/brand/muktodwar-logo-dark.svg` | README, dark navbars, splash |
| `assets/brand/muktodwar-logo-light.svg` | Light surfaces |
| `assets/brand/muktodwar-mark.svg` | Compact UI, app, tray |
| `assets/brand/muktodwar.ico` | Windows app icon |
| `assets/brand/muktodwar-favicon.svg` | Browser favicon |
| `assets/brand/muktodwar-github-banner.png` | GitHub/social preview |

## Rules

- Binary derivatives are generated from the master generator by `npm run brand:build`. Do not hand-edit them.
- Never use a product or brand name as the icon word.
- Regenerate after changing the master generator and confirm the diff is intended.