# MuktoDwar brand guide

MuktoDwar is a local AI gateway. Its mark is an open door: a clear entry point to multiple trusted AI routes. The connected nodes sit to the right of the door and represent routing; they are not a generic neural-network decoration.

## Core assets

| Use | Asset |
|---|---|
| Dark horizontal logo | `assets/brand/muktodwar-logo-dark.svg` |
| Light horizontal logo | `assets/brand/muktodwar-logo-light.svg` |
| Stacked logo | `assets/brand/muktodwar-logo-stacked-dark.svg` |
| Symbol/app icon | `assets/brand/muktodwar-mark.svg` |
| Browser favicon | `assets/brand/muktodwar-favicon.svg`, `assets/brand/favicon.ico` |
| Windows app icon | `assets/brand/muktodwar.ico` |
| GitHub/social banner | `assets/brand/muktodwar-github-banner.png` |
| Animated loading mark | `assets/brand/muktodwar-logo-animated.svg` |

Run `npm run brand:build` after changing the generator to recreate all PNG and ICO derivatives.

## Color palette

| Token | Hex | Role |
|---|---:|---|
| Deep Purple | `#7C3AED` | Primary neon edge and emphasis |
| Electric Blue | `#3882F6` | Gateway routes and primary action |
| Violet Glow | `#A855F7` | Highlight and transition color |
| Cyan Signal | `#22D3EE` | Active route and small node highlight |
| Dark Navy | `#0B0F14` | Main canvas and icon background |
| Slate Surface | `#1E293B` | Cards and panels |
| Light Text | `#E2E8F0` | Primary copy on dark backgrounds |

Use the purple-to-blue spectrum only for the door, connected routing signal, or a single primary action. Keep the rest of an interface dark and quiet so connection state remains meaningful.

## Typography

- Use **Inter** for product UI, headings, and wordmark-adjacent copy. Use `700` for the MuktoDwar wordmark, `600–700` for headings, and `400–500` for body copy.
- Use a system monospace face only for code, tokens, model IDs, and command examples.
- The wordmark is `MuktoDwar`: capital **M** and **D**, with no spaces or alternate spellings.
- The supporting line is `Your Local Gateway to AI` in sentence case when normal text is appropriate; all-caps, tracked treatment is reserved for the supplied logo artwork.

## Spacing and sizing

- Keep clear space around a logo equal to at least the door-handle height. Do not let text, card borders, or other marks enter that zone.
- Horizontal logo minimum: 180 px wide on screen. Use the symbol-only mark below that size.
- Use the supplied favicon/app icon at 16, 24, 32, 48, 128, and 256 px. Do not try to scale a wordmark down to icon size.
- On a dark surface, use the dark horizontal or stacked logo. On a light surface, use the light variant.

## Animation

The animated logo is a 2.5-second loop:

1. The door reveals (0–0.6 s).
2. Routes and nodes connect (0.6–1.5 s).
3. The complete lockup settles (1.5–2.5 s).

Use `muktodwar-logo-animated.svg` for short loading states only. It honors `prefers-reduced-motion`; use `muktodwar-logo-animated-static.svg` where motion is not appropriate. GIF is not the source of truth.

## Do and don't

Do:

- Keep the door tall, open, and facing the routing nodes on its right.
- Use the canonical asset files rather than redrawing the mark.
- Preserve the dark navy background when using neon glow.
- Pair color changes with text, shape, or status labels in the dashboard.

Don't:

- Add brains, robots, dense circuit traces, or a large field of nodes.
- Rotate, squash, outline, or recolor the wordmark outside the defined palette.
- Place the glowing mark over a busy or low-contrast image.
- Use glow as a substitute for focus indicators, error states, or readable labels.

## Credits

- Made in Bangladesh 🇧🇩
- Open source
- Developer: Hr Habib
