# Image generation loading dots — DELETE BEFORE MERGE

This folder isolates the supplied `image-gen-loading-state-dots` loading state
for local visual study. It is temporary inspiration material, not product code.

Start the local reference from the repository root:

```sh
node apps/marketing/__DO_NOT_MERGE__inspiration/image-gen-loading-state-dots/serve.mjs
```

Then open:

```text
http://127.0.0.1:4178/image-gen-loading-state-dots
```

The pointer-controlled iteration lives separately at:

```text
http://127.0.0.1:4178/image-gen-loading-state-dots/pointer
```

Its density field follows mouse and pen hover with inertia, follows touch while
dragging, and returns to the original autonomous motion after pointer exit.

The Lens-structured hero iteration lives at:

```text
http://127.0.0.1:4178/image-gen-loading-state-dots/lens-hero
```

It keeps the measured Lens hero stage and headline structure, replaces the
background renderer with the pointer-controlled dot canvas, and intentionally
omits the mascot canvas, caption, buttons, navigation, and every lower section.

The additive Opaline session-story iteration lives at:

```text
http://127.0.0.1:4178/session-story
```

It tells a seven-chapter story about isolated agent sessions becoming shared
team memory. The route uses the four Lens character SVGs directly from the
existing Lens capture and rebuilds the annotated Interfere code-window language
as an animated, responsive story system. No existing route is replaced.

The HTML preserves the observed 480px frame, 36px clipping radius, 0.38 layer
opacity, diagonal canvas mask, test IDs, and 2× bitmap sizing. `animation.js`
keeps the dot renderer separate for dissection and iteration.

The supplied serialized DOM contains no canvas pixels or animation timing.
Accordingly, the still-state geometry and appearance are reproducible, while
the original undisclosed motion curve cannot be independently verified from
the provided files alone.
