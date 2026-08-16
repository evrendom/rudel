# Interfere reference capture — DELETE BEFORE MERGE

This folder contains temporary, private study material for Opaline. It is not
product code and must be removed before merging to `main`.

## Capture the live page

1. From the repository root, start the local receiver:

   ```sh
   node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/serve.mjs
   ```

2. Open <https://interfere.com/product/engineers> in Chrome at the viewport you
   want to study.
3. Wait for fonts and images to load, then scroll through the full page once so
   lazy content and scroll-driven code have initialized.
4. Return to the desired starting position and open DevTools → Console.
5. Paste the complete contents of `capture-interfere-page.js` and press Return.

The receiver immediately writes the capture to:

```text
/Users/example/conductor/workspaces/rudel-v2/podgorica/apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/interfere-engineers.capture.html
```

Browsers do not allow website JavaScript to write to an arbitrary absolute
filesystem path. The localhost receiver performs that write. If it is not
running, the exporter falls back to downloading the file through Chrome.

The default `snapshot` mode inlines the accessible CSS, snapshots DOM and form
state, records current animations and scroll positions, removes Interfere's
origin-dependent application runtime, and removes known analytics/tracking
scripts. Images, fonts, and videos remain network-backed by their original
hosts, so the reference needs an internet connection.

The exporter also serializes open shadow roots and their adopted stylesheets,
which is required for the code sample inside `diffs-container`. Snapshot mode
recreates Interfere's pointer-relative glow variables for elements using
`--glow-x` and `--glow-y`.

Snapshot mode replays captured plain Web Animations; CSS animations and
transitions still come from the captured stylesheets. A diagnostic `preserve`
mode is available near the top of the exporter, but Interfere's current runtime
clears the page when it hydrates away from the original site origin.

## Launch locally

Keep the receiver running and open <http://127.0.0.1:4174>. Use the same viewport
as the capture when comparing layout.

The newer supplied engineers-page reference is preserved separately:

- Full page: <http://127.0.0.1:4174/product/engineers-v2>
- Isolated product hero: <http://127.0.0.1:4174/product/engineers-v2/hero>
- Design-system inventory: `INTERFERE-ENGINEERS-V2-DESIGN.md`

Regenerate the v2 page, localized CSS/fonts, isolated hero, and inventory with:

```sh
node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/materialize-engineers-v2.mjs
```

The materializer removes analytics and the origin-dependent Interfere runtime.
It retains the supplied rendered DOM and inline state, and localizes all
referenced CSS, fonts, and image-CDN assets. It also installs a small local
runtime for captured spinner motion, header scroll state, and changelog
scrolling.

The generated documents do not use an upstream \`<base>\` element. Replica
assets therefore resolve against whichever local preview origin is open, while
the source page's original root-relative links are made explicit against
\`https://interfere.com\`.

When the Rudel web development server is running, its Vite middleware exposes
the same full-page and hero routes on the workspace's normal web origin. This
keeps the capture HTML, stylesheets, fonts, images, and local runtime on one
origin instead of letting unknown paths fall through to the SPA shell.

The supplied designers-page capture, all three “Ship faster” states, and all
three support-customer states are available in the local reference:

- Full page: <http://127.0.0.1:4174/product/designers-v2>
- Six-screen, screen-only vertical scroll story: <http://127.0.0.1:4174/product/designers-v2/ship-faster>
- First state: <http://127.0.0.1:4174/product/designers-v2/ship-faster#follow-ongoing-problems>
- Second state: <http://127.0.0.1:4174/product/designers-v2/ship-faster#understand-whats-going-on>
- Third state: <http://127.0.0.1:4174/product/designers-v2/ship-faster#follow-the-problems-resolution>
- Support state 1: <http://127.0.0.1:4174/product/designers-v2/ship-faster#identify-impacted-customers>
- Support state 2: <http://127.0.0.1:4174/product/designers-v2/ship-faster#answer-questions-faster>
- Support state 3: <http://127.0.0.1:4174/product/designers-v2/ship-faster#get-ahead-of-support-tickets>
- Complete token inventory: `interfere-designers-session.tokens.json`
- Human-readable token guide: `INTERFERE-DESIGNERS-SESSION-TOKENS.md`

Recapture the live first state, then regenerate the localized page, scroll
story, individual states, assets, and token exports with:

```sh
node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/capture-designers-ship-faster-first.mjs
node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/capture-designers-support-states.mjs
node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/materialize-designers-session.mjs
```

The inventory includes every custom-property definition and captured value,
font face, keyframe, media/supports query, selected raw declaration value,
utility-class usage, and inline style declaration from the supplied page and
fragment. The localized CSS bundles remain the canonical selector-level source.

Each new capture atomically replaces the previous HTML reference at the same
path.

This is a high-fidelity visual reference, not an offline archive. Browser event
listeners cannot be recovered from pasted DOM alone, and origin-dependent
application behavior is intentionally excluded from the stable local capture.
