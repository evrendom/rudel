# Atoms homepage reference — DELETE BEFORE MERGE

This folder contains temporary, private study material for Opaline. It is not
product code and must be removed before merging to `main`.

The supplied Atoms DOM was used to identify and verify the composition. The
checked-in capture was refreshed from the matching pristine Atoms server
document on 2026-08-06 so the rendered-DOM copy's injected Framer editor bar is
not replayed locally. Google Analytics is removed when a capture is saved; the
Framer runtime and its public image, font, and module URLs are retained so
layout and motion can hydrate.

## Launch locally

From the repository root, run:

```sh
node apps/marketing/__DO_NOT_MERGE__inspiration/atoms-co/serve.mjs
```

Then open <http://127.0.0.1:4179/>. Use the same viewport width and scroll
position when comparing it with <https://atoms.co/>. The reference needs an
internet connection for Framer-hosted assets.

The shared Agentation toolbar is injected at serve time. Its notes are written
to `_agentation/atoms-co.annotations.jsonl`.

## Why the hero scrolls behind the next section

The effect is structural, not a scroll transform:

```text
main (relative stacking context)
├── hero-section      sticky; top: 0; height: 100vh; z-index: 1
└── companies-section relative; z-index: 2; transparent → black background
```

At desktop widths, the foreground section uses
`linear-gradient(transparent 0%, black 25%)`. Below 810px, the hero becomes
`90vh` and the fade reaches black at 7%. As the foreground content advances in
normal document flow, the sticky hero remains pinned and is progressively
covered by that higher layer.

The key captured selectors are:

- `.framer-o29gz2-container` — sticky hero wrapper
- `.framer-1je5wbq` — foreground companies section and gradient
- `.framer-g2oocd` — shared relative parent and vertical flow

## Parity coverage and boundaries

The local and live pages were compared at 1440×900 and 390×844 at initial
paint, during the overlap, and after the hero is covered. Document height,
sticky geometry, stacking, responsive gradient stops, settled scroll motion,
desktop link hover, and the mobile menu matched. The local asset load completed
without failed requests.

Only this homepage is mirrored. Relative links such as `/vision` and `/contact`
resolve on the local reference origin and return 404; use the corresponding
live Atoms URL to inspect those pages. The injected Agentation control is also
expected to appear only on the local reference.

## Refresh the capture

1. Keep the local server running.
2. Open <https://atoms.co/> in Chrome.
3. Wait for fonts and images, then scroll through the page once.
4. Paste all of `capture-atoms-page.js` into DevTools → Console.

The receiver atomically replaces `atoms-home.capture.html`. If the receiver is
unavailable, the exporter downloads the capture through Chrome instead.

This is a network-backed visual reference, not an offline archive. Framer can
rehydrate its own interactions, but event listeners installed by unrelated
third-party scripts are intentionally not preserved.
