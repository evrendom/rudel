# Linear light-mode reference — DELETE BEFORE MERGE

This folder contains temporary, private study material for Opaline. It is not
product code and must be removed before merging to `main`.

## Capture the live page

1. Start the receiver from the repository root:

   ```sh
   node apps/marketing/__DO_NOT_MERGE__inspiration/linear-light-mode/serve.mjs
   ```

2. Open <https://linear.app/next> in Chrome.
3. Open DevTools → Console, paste all of `capture-linear-page.js`, and press Return.

The receiver writes directly to:

```text
/Users/evrendombak/conductor/workspaces/rudel-v2/podgorica/apps/marketing/__DO_NOT_MERGE__inspiration/linear-light-mode/linear-next-light.capture.html
```

The exporter uses Linear's pristine server document so the original React and
Radix navbar behavior remains executable. It forces the page's `website-theme`
preference to light before first paint, retains the logged-in navbar variant
shown in the supplied DOM, and embeds readable document-level adopted
stylesheets—including the supplied StyleX variable sheet.

## Launch locally

Keep the receiver running and open <http://127.0.0.1:4176/next>.

The isolated, source-exact navbar used by the Lens × Atoms composition is
available at:

```text
http://127.0.0.1:4176/next?opaline-source=navbar
```

It preserves Linear's captured responsive header runtime, desktop dropdowns,
mobile dialog, and the existing Opaline branding substitution while hiding the
rest of the Linear page. The normal `/next` route remains unchanged.

The local server proxies public Linear GET requests without cookies,
authorization, or writes. The reference needs an internet connection and does
not reproduce authenticated application behavior.

Do not use `file://`: runtime navigation and assets require the companion
server.
