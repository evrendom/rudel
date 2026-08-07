# Lens reference capture — DELETE BEFORE MERGE

This folder contains temporary, private study material for Opaline. It is not
product code and must be removed before merging to `main`.

## Capture the live page

1. From the repository root, start the receiver:

   ```sh
   node apps/marketing/__DO_NOT_MERGE__inspiration/lens-xyz/serve.mjs
   ```

2. Open <https://lens.xyz/build> in Chrome at the viewport you want to compare.
3. Open DevTools → Console, paste all of `capture-lens-page.js`, and press Return.

The receiver immediately writes the capture to:

```text
/Users/evrendombak/conductor/workspaces/rudel-v2/podgorica/apps/marketing/__DO_NOT_MERGE__inspiration/lens-xyz/lens-build.capture.html
```

Browsers cannot write to arbitrary absolute filesystem paths. The localhost
receiver performs that write; if it is unavailable, Chrome downloads the file.

## Launch locally

Keep the receiver running and open <http://127.0.0.1:4175/build>. Hard-refresh
that URL whenever you want to replay the page-load animations from the start.

The Opaline aperture reveal keeps the original Lens page live underneath a
centered standalone mark, then expands the mark beyond the viewport and removes
the transition layer so the original page remains fully interactive:

```text
http://127.0.0.1:4175/build/opaline-aperture
```

## Lens canvas × Atoms foreground

The additional composition route is:

```text
http://127.0.0.1:4175/build/lens-atoms
```

The clean hero source is available at
`http://127.0.0.1:4175/__lens-atoms/hero`. It retains the Opaline navigation,
live canvas, title, subtitle, and buttons while removing the Atoms foreground
and Agentation layer. Lens × Attio requests its canvas-only layer with
`?opaline-layer=canvas`; Attio supplies the native title spacing, dashboard,
and scroll sequence directly.

Run the Linear light-mode receiver on port `4176` alongside this Lens receiver.
The route mounts Linear's captured responsive header from that origin, including
its original desktop dropdowns and mobile menu behavior.

This route combines the three checked-in captures at response time; none of the
source captures is rewritten. The background is the exact annotated WebGL
canvas inside Lens's `/build` hero mask, isolated from the captured page and
resized by that runtime to the full viewport. Lens's original hero lockup and
icon canvas are hidden. The centered title is Interfere's exact Engineers title
DOM, CSS, InterVariable typography, copy, and controls, with only its eyebrow
removed and its remaining content center-aligned. The foreground is Atoms's
actual sticky-hero/companies/footer DOM, CSS, typography, grid, and Framer
motion—not a recreated card. Its original transparent-to-solid overlap is
retained, with Atoms's dark palette remapped to Lens's sampled white surface,
display-P3 ink, and ink-alpha border colors.

The Interfere title inherits Atoms's scroll motion from the DOM rather than from
a recreated curve. Atoms's active sticky `hero-section` remains hydrated as the
motion driver; its Framer-computed scale and opacity are mirrored each frame
onto the Interfere title around the same viewport center. The Lens WebGL canvas
remains full-viewport and unscaled behind it.

The title frame is assembled from that exact captured node plus Interfere's
original global stylesheet and InterVariable font. It does not start the rest of
Interfere's captured application or preload graph, so those resources cannot
delay the prioritized Lens canvas startup.

The Atoms foreground is capped at 1200px. It leaves 150px live-canvas rails at
the supplied 1500px viewport, 40px minimum rails at tablet widths, and 16px
rails on phone. Wheel and touch scrolling over the background are forwarded to
the Atoms document so the exact Lens canvas stays pinned while the exact Atoms
panel advances over it.

The exporter saves Lens's pristine server document instead of serializing the
already-hydrated DOM. This preserves its executable Next.js runtime, event
listeners, mount and idle animations, hover/scroll interactions, canvas code,
and all four Three.js/WebGL scenes observed in the supplied DOM.

The local server provides Lens assets and public GET requests through a
read-only same-origin proxy. It deliberately forwards no cookies,
authorization, or write requests. The reference therefore needs an internet
connection and excludes authenticated application behavior.

Do not open the capture with `file://`: root-relative chunks and runtime
requests require the companion server.

## Lens Developer Dashboard `/new`

This page uses a separate local origin so its Next.js chunks cannot collide
with `lens.xyz/build`.

1. Start its receiver from the repository root:

   ```sh
   node apps/marketing/__DO_NOT_MERGE__inspiration/lens-xyz/serve-developer-new.mjs
   ```

2. Open <https://developer.lens.xyz/> in Chrome with WebGL enabled.
3. Paste all of `capture-lens-developer-new.js` into DevTools Console.
4. Open <http://127.0.0.1:4177/> and hard-refresh to replay startup motion.

The direct capture path is:

```text
/Users/evrendombak/conductor/workspaces/rudel-v2/podgorica/apps/marketing/__DO_NOT_MERGE__inspiration/lens-xyz/lens-developer-new.capture.html
```

### Creative iterations

The original capture remains unchanged at <http://127.0.0.1:4177/>.

- `iteration-01`: <http://127.0.0.1:4177/iteration-01> removes the welcome
  wallet card and the three-feature column while preserving the animated
  WebGL background and Agentation overlay.
- `iteration-01/3`: <http://127.0.0.1:4177/iteration-01/3> keeps the original
  WebGL canvas unmodified, then copies each live frame, transposes it by 90°,
  and tiles the copy across the opposite axis to form a grid. The source and
  copied lines retain the original color, opacity, and pixel scale.

The discarded `/iteration-01/1` and `/iteration-01/2` experiments return 404.
