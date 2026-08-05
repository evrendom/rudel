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
