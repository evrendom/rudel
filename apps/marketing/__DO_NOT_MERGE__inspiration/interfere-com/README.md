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
/Users/evrendombak/conductor/workspaces/rudel-v2/podgorica/apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/interfere-engineers.capture.html
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

Each new capture atomically replaces the previous HTML reference at the same
path.

This is a high-fidelity visual reference, not an offline archive. Browser event
listeners cannot be recovered from pasted DOM alone, and origin-dependent
application behavior is intentionally excluded from the stable local capture.
