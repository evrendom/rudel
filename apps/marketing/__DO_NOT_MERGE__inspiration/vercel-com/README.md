# Vercel header and color-canvas reference — DELETE BEFORE MERGE

This folder contains temporary, private study material for Opaline. It is not
product code and must be removed before merging to `main`.

The supplied rendered DOM was used to identify and verify the composition. The
matching pristine server document is saved as `vercel-home.capture.html` so
Vercel's client runtime can hydrate its native interactions reliably. The local
reference deliberately exposes only the marketing navigation and the "Agentic
Infrastructure" hero with its animated triangle color canvas. The customer
logo rail, platform sections, footer, consent UI, analytics, and
origin-protection scripts are excluded from the visible reference.

Vercel's own responsive layout, fonts, navigation interactions, canvas shader,
and reduced-motion behavior are retained. Root-relative public assets load
through the companion read-only proxy, so the reference must be served over
HTTP and needs an internet connection.

## Launch locally

From the repository root, run:

```sh
node apps/marketing/__DO_NOT_MERGE__inspiration/vercel-com/serve.mjs
```

Then open <http://127.0.0.1:4181/>. Compare it with <https://vercel.com/> using
the same viewport, device pixel ratio, color scheme, motion preference, and
pointer position.

For the isolated click-driven noise and color renderer, open:

```text
http://127.0.0.1:4181/color-field
```

This route removes the navigation and hero copy while retaining the native 3:2
effect canvas with a full-viewport cover treatment. It is pinned to Vercel's
light theme regardless of the system preference. Its layer inspector toggles
the scene canvas, native shader occluder, DOM triangle, static glow/noise
fallback, and Vercel's advanced shader GUI independently. Use the presets for a
quick baseline, then click or tap the field and release to bloom the colors.

For a circle-based iteration of the same RGB composition, open:

```text
http://127.0.0.1:4181/color-field/circle
```

This route preserves the native triangle shader, then radially remaps its
triangular boundary into a circle. The native red, blue, and green edge light,
bloom, grain, additive mixing, animation, and click state are therefore kept,
while its three faces become a top-down cone with a circular base. Click or tap
the field to shift the native color energy. The route is forced to light mode;
a procedural cone is used only if the external native canvas cannot initialize.

For the triangle-removal comparison lab, open:

```text
http://127.0.0.1:4181/color-field/triangleless
```

This route hides the DOM triangle and static fallback, forces off the shader
occluder, and adds a right-side rail for comparing seven source-removal
strategies. Source-preserving treatments suppress the edge, move the source
offscreen, collapse it to a point, or blur-repair it after rendering. The
geometry-free treatments rebuild the field as scattered emitters, soft blobs,
or fullscreen procedural noise. The selected method is stored in the `method`
query parameter; click or tap the field to shift its energy.

The shared Agentation toolbar is injected at serve time and remains available
on the header reference. Its launcher is hidden on the capture-clean color
field route. Notes are written to `_agentation/vercel-com.annotations.jsonl`.

## Scope and parity boundary

The checked-in snapshot includes the full pristine source document because the
Next.js runtime needs its original hydration data to initialize the WebGL
canvas and navigation. A local-only stylesheet removes everything outside the
requested header/hero slice from layout and paint. No lower page content is
visible or reachable by scrolling.

The reference intentionally does not preserve deployment drag-and-drop, logged
in state, account actions, authentication, analytics, consent management, or
origin-dependent protection code. Links may resolve through the public
read-only proxy; only `GET` and `HEAD` requests are forwarded.

## Refresh the capture

1. Keep the local receiver running.
2. Open <https://vercel.com/> in Chrome while logged out.
3. Wait for fonts and the color canvas to settle, then resize once at each
   comparison viewport.
4. Paste all of `capture-vercel-page.js` into DevTools → Console.

The receiver atomically replaces `vercel-home.capture.html`. If it is
unavailable, Chrome downloads the capture instead.
