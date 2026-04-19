# Walk-In WebGL Capture Workflow

Current state:
- The `/walk-in` route renders [`RudelWalkInPage.tsx`](./RudelWalkInPage.tsx), which is a local storyboard card.
- The old `mymind` WebGL runtime helpers still exist in [`lib/mymind-runtime.ts`](./lib/mymind-runtime.ts), but they are not mounted into the active route.

If the next step is to clone a WebGL-heavy site into the walk-in card, capture the source site first instead of trying to rebuild it from Elements alone.

## Capture Command

1. Launch Chrome with remote debugging enabled:

```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/rudel-cdp
```

2. Capture an already-open tab by title or URL substring:

```bash
bun run capture:webgl --match mymind
```

3. Or let the script open a fresh tab:

```bash
bun run capture:webgl --url https://example.com --label example-site
```

## Output

Each run writes to:

```text
.context/webgl-captures/<timestamp>-<label>/
```

Files:
- `capture-manifest.json`: request-level manifest with local file paths and failures
- `page.html`: full document HTML after reload
- `page-metadata.json`: scripts, stylesheets, canvases, and `performance` resources
- `page.png`: screenshot for visual reference
- `resources/`: saved network response bodies

## Why This Exists

WebGL sites usually pull critical assets through script loaders, fetch/XHR, service workers, or runtime shader/bootstrap code that never appears as straightforward DOM nodes. This capture script reloads the page with cache disabled and service workers bypassed so the asset graph is visible again.

## Limits

- It captures network-delivered assets, not raw GPU memory.
- If the site generates textures, geometry, or shader data entirely in memory, that still needs manual extraction or reconstruction.
- After capture, use the `replicate-dom-layout` console scripts if the container geometry still needs to be mirrored precisely.
