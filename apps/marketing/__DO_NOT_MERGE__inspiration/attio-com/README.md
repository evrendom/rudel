# Attio homepage reference — DELETE BEFORE MERGE

This folder contains temporary, private study material for Opaline. It is not
product code and must be removed before merging to `main`.

The supplied rendered DOM is saved as `attio-home.capture.html`. The reference
keeps Attio's server-rendered document, Next.js runtime, responsive layout,
fonts, images, CSS transitions, and interactive navigation. Root-relative
assets are loaded through the companion read-only proxy, so the page must be
served over HTTP and needs an internet connection.

Analytics, reCAPTCHA, Intercom, and other third-party scripts are blocked. The
captured support launcher is hidden so it does not overlap the shared
Agentation toolbar.

## Launch locally

From the repository root, run:

```sh
node apps/marketing/__DO_NOT_MERGE__inspiration/attio-com/serve.mjs
```

Then open <http://127.0.0.1:4180/>. Use the same viewport, color scheme, scroll
position, and input state when comparing it with <https://attio.com/>.

The shared Agentation toolbar is injected at serve time. Its notes are written
to `_agentation/attio-com.annotations.jsonl`.

## Lens × Attio composition

Start the Lens and Attio reference servers, then open:

```text
http://127.0.0.1:4180/lens-attio
```

The first viewport keeps Attio's captured hero DOM as the layout and motion
source. Its title content and blue backdrop are hidden without removing their
layout slots; the Interfere title is mounted into Attio's original title slot,
and the Lens WebGL canvas remains behind it. Attio's dashboard therefore uses
its own native sticky positioning, scroll animation, and draggable windows
directly—there is no mirrored iframe scroll position or compensating transform.
The Linear navigation stays fixed above the composition, and Attio's second
section onward advances normally when the original hero ends.

The composition depends on the Lens server at `127.0.0.1:4175` and the Linear
navigation server at `127.0.0.1:4176`. Navigation dropdowns and the mobile menu
remain live, and wheel scrolling over the embedded title is forwarded to the
Attio document.

The alternate composition is available at:

```text
http://127.0.0.1:4180/lens-attio-lens
```

It keeps the same hero but counteracts Attio's scroll-driven scale on the main
dashboard, so the window remains at its normal size while retaining the native
vertical motion and draggable auxiliary windows. Once the hero ends, the page
continues through Lens's captured content beginning at “All-in-One Lens” and
ending with the Lens footer; Attio's remaining homepage sections are omitted.

## Refresh the capture

1. Keep the local receiver running.
2. Open <https://attio.com/> in Chrome.
3. Wait for fonts and images, then scroll through the complete page once.
4. Paste all of `capture-attio-page.js` into DevTools → Console.

The exporter requests Attio's pristine server document so the checked-in
reference can hydrate normally. The receiver atomically replaces
`attio-home.capture.html`; if it is unavailable, Chrome downloads the file.

Only public `GET` and `HEAD` requests are proxied. Cookies, authorization,
origin headers, form submissions, and authenticated application behavior are
excluded. Relative links may request other public Attio pages through the
proxy, but only the homepage capture is part of this reference.
