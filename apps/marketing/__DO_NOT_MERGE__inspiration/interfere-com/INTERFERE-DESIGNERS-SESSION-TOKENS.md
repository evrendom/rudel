# Interfere designers session-section design reference

This reference preserves all three rendered states of Interfere’s “Ship faster” section, all three rendered states of its “Support customers with confidence” section, and the complete design-token vocabulary available across the supplied and live interaction captures. It retains the source utility classes, custom properties, light/dark and P3 palettes, responsive rules, typography, keyframes, inline state, and SVG artwork while removing analytics and origin-dependent application hydration.

## Routes

- Full supplied page: `http://127.0.0.1:4174/product/designers-v2`
- Six-screen scroll story: `http://127.0.0.1:4174/product/designers-v2/ship-faster`
- State 1: `http://127.0.0.1:4174/product/designers-v2/ship-faster#follow-ongoing-problems`
- State 2: `http://127.0.0.1:4174/product/designers-v2/ship-faster#understand-whats-going-on`
- State 3: `http://127.0.0.1:4174/product/designers-v2/ship-faster#follow-the-problems-resolution`
- Support state 1: `http://127.0.0.1:4174/product/designers-v2/ship-faster#identify-impacted-customers`
- Support state 2: `http://127.0.0.1:4174/product/designers-v2/ship-faster#answer-questions-faster`
- Support state 3: `http://127.0.0.1:4174/product/designers-v2/ship-faster#get-ahead-of-support-tickets`

## Source contract

- Full page: 1744 elements, 382801 bytes, SHA-1 `6429cb9b7273c2a2abbaf5424c178ec86f1196d0`.
- State 1: 341 elements, 57390 bytes, SHA-1 `e7454356c7257f39c7acfe205be330bf7dfea9d2`; captured through the live rendered first-tab interaction.
- State 2: 330 elements, 59284 bytes, SHA-1 `353c5cb50e5e9873ad4b48edd436973fe0add9fe`; preserved from the supplied isolated fragment.
- State 3: 220 elements, 43675 bytes, SHA-1 `ef3ae4b65b930daaf5c2d3cd2f0c40be336f5bcf`; extracted from the supplied full-page capture.
- Support state 1: 439 elements, 96571 bytes, SHA-1 `fe14b4038acf26a7d12b5f95a49ecf3349ebd295`; captured through the live rendered first-tab interaction.
- Support state 2: 220 elements, 43708 bytes, SHA-1 `5da59c9ebecd7d242b551474ef886aedf1ef2329`; captured through the live rendered second-tab interaction.
- Support state 3: 382 elements, 55355 bytes, SHA-1 `3468c598c8391c79aded01b19f311406df0db4f9`; preserved from the supplied isolated fragment.
- 4 hashed Interfere stylesheets are localized.
- 13 stylesheet-referenced assets and 7 image-CDN assets are localized.
- 913 custom-property names are inventoried across definitions, registrations, references, and inline values; 863 have captured stylesheet definitions with every value and selector occurrence.
- The machine-readable inventory is `interfere-designers-session.tokens.json`; the localized CSS bundles remain the canonical source for every selector and declaration.

## Token coverage

The JSON inventory includes every captured CSS custom-property definition with its selector and source file, all distinct values for typography, radii, shadows, colors, animation and transition timing, every font face, keyframe name, media/supports query, every full-page and fragment utility class, and every inline style declaration. Inline `<style>` blocks from the supplied page participate in token extraction as well as the external stylesheets.

## Parity boundary

- The full-page body remains source-faithful after removing non-JSON scripts, analytics boot code, remote stylesheet tags, and origin-dependent module preloads; visual assets are rewritten locally.
- The scroll story presents the six captured product screens in source order as independent vertical panels. Narrative copy and the source edge-fade layers are intentionally removed; each complete 1200 × 640 product screen is centered and scaled down uniformly when the viewport is narrower or shorter.
- Vertical scrolling and stable fragment anchors replace the origin carousel runtime. No inferred crossfade or autoplay behavior is introduced.
- Runtime-only event listeners are not recoverable from pasted DOM. The six panels are static rendered references, while responsive CSS, hover/focus selectors, keyframes, and reduced-motion rules remain available from the source bundles.
- Compare at the same viewport, DPR, color scheme, zoom, and scroll position. Generated output should be visually rechecked whenever either source hash changes.

## Regeneration

From the repository root:

`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/capture-designers-ship-faster-first.mjs`

`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/capture-designers-support-states.mjs`

Then:

`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/materialize-designers-session.mjs`

Pass `--first`, `--page`, `--fragment`, `--supportFirst`, `--supportSecond`, and `--support` to replace individual captures.
