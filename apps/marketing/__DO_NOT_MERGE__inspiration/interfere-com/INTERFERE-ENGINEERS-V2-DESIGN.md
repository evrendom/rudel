# Interfere engineers v2 design reference

This reference is generated from the supplied rendered page and hero DOM captures. It deliberately preserves the source HTML, Tailwind utility vocabulary, semantic color tokens, P3 palettes, responsive rules, shadows, typography, and CSS keyframes while removing analytics and the origin-dependent application runtime.

## Routes

- Full page: `http://127.0.0.1:4174/product/engineers-v2`
- Isolated 523-element product hero: `http://127.0.0.1:4174/product/engineers-v2/hero`
- Previous engineers reference: `http://127.0.0.1:4174/`

## Source contract

- Page SHA-1: `a88888142fe1934b63e6bf49e7ddc6e2c3ae4ff5`
- Hero SHA-1: `45ca41a05d3347a6db2c12dfe81b28bb2f442f3d`
- CSS is localized from four immutable, hashed Interfere bundles.
- Thirteen font files are localized so typography is stable and offline.
- Six unique source images are localized so all 21 image instances are stable and offline.
- A safe local replica runtime restores captured spinner motion, header scroll state, and changelog scrolling without loading analytics or origin-dependent hydration.
- Local visual assets resolve against the current preview origin; original root-relative navigation and metadata URLs are rewritten to explicit `https://interfere.com` URLs.
- The full machine-readable token/class inventory is `interfere-engineers-v2.inventory.json`.

## Parity boundary

- The full-page body is DOM-identical to the supplied page after removing only non-JSON-LD scripts and rewriting visual asset URLs locally; the isolated hero root has the same contract.
- All four source CSS bundles and all thirteen referenced font files are localized. CSS responsive states, hover/focus rules, keyframes, and reduced-motion rules remain intact.
- The two supplied captures differ only in the loading spinner's instantaneous inline rotation, so the full route preserves the page capture's phase and the isolated route preserves the fragment capture's phase.
- Runtime-only event listeners and open overlay state cannot be recovered from pasted rendered HTML. The local runtime covers behavior supported by the supplied state without restoring origin-dependent application hydration.

## Design-system formulation

### Spacing and responsive layout

- Base spacing unit: `--spacing: .25rem` (4px).
- Breakpoints represented in the source CSS: 40rem, 48rem, 64rem, 80rem, and 96rem.
- The hero uses a constrained centered shell with 24px phone gutters and 22px small-screen gutters, then deliberately overflows horizontally for the large product-stage composition.
- The product-stage shell is 640px tall on phone and 800px at medium widths, with a 1440px minimum composition width.

### Typography

- Primary sans: InterVariable, weights 100–900, with `ss03` enabled.
- Secondary families: Berkeley Mono, Departure Mono, Heldane Text, and Redaction 35.
- Font scale: 8, 10, 11, 12, 13, 15, 18, 20, 24, 28, 36, 44, and 56px.
- Caption large is 12/16 at weight 400 by default; emphasized inline values use 500.
- Body small is 13/20; body base is 15/24; body large is 18/24.
- Heading sizes are 24/32, 28/36, 36/44, 44/56, and 56/56 with -0.01em tracking.

### Color and surfaces

- Semantic layers are page, shell, container, recessed container, card, component, component hover/active, and inverted standout.
- Foreground hierarchy is primary, secondary, tertiary, and disabled rather than ad-hoc opacity on each element.
- Status semantics are brand, positive, warning, and danger, each with solid, subtle, foreground, and border roles.
- Hairline borders use 0.5px and derive from semantic border tokens; default cards combine a 0.5px inset highlight with three low-opacity drop layers.

### Shape, density, and composition

- Small controls use 4–8px radii; cards use 8–12px radii; avatars and status dots are fully rounded.
- The product timeline uses 16px event icons, 0.5px vertical rails, 4px terminal dots, 8px vertical row padding, and 4–6px internal gaps.
- Timeline cards favor transparent hierarchy: semantic surface, hairline outline, restrained shadow, and compact 12/16 metadata over heavy headings.

### Motion

- Preserved CSS motion includes shimmer, spinner, signal flow, marquee, breathe, logo cascade, viewfinder focus/scan, border beam, accordion, enter, and exit keyframes.
- Core easing curves include out-quad, out-cubic, out-quint, and in-out-cubic.
- Reduced-motion selectors remain in the localized source CSS.

## Regeneration

From the repository root:

`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/materialize-engineers-v2.mjs`

Pass `--page` and `--fragment` to use replacement captures. Generated output must be visually rechecked whenever either source hash changes.
