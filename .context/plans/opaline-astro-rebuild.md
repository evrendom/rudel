# Opaline marketing site — ULTIMATE rebuild plan (final, execution-ready)

You are the implementing agent. Read this entire document before touching anything.
Follow it exactly — every rule here exists because a previous agent broke it and
burned a full session producing an unusable result.

## 0. Mission

Rebuild the experience at `http://127.0.0.1:4180/lens-attio-lens-aperture` as an
Astro-native site in `apps/marketing` — our own component names and file structure —
that is **pixel- and behavior-indistinguishable** from that reference, with one
deterministic animation system, no iframes, no proxies, no third-party runtimes, no
hydration frameworks.

The reference is a local composition served from
`apps/marketing/__DO_NOT_MERGE__inspiration/` (captured DOM + local proxy servers).
Its **settled states** are the design. Glitch frames caused by its known animation
races are NOT the design. Do not study or reconstruct the original inspiration sites
(Attio, Linear, Lens, Interfere, Atoms) — the composed route is the only ground truth.
**Never modify or delete anything under `__DO_NOT_MERGE__inspiration/`** — it must
keep running as the comparison reference for the entire project. It never ships.

## 1. Definition of done (all five must hold)

1. Full-page state matrix (§5) passes: structural diff empty AND pixel backstop
   ≤ 0.1% differing pixels per shot vs the reference.
2. Behavior traces (§8) match: identical attribute-mutation sequences under identical
   scripted input, timings within ±1 frame (16 ms); scroll-driven curves within 1%
   at every sampled position.
3. Blind check: shuffled reference/candidate screenshot pairs cannot be told apart.
4. Perf: static `astro build`; ≤ 30 KB client JS (gzip, excluding canvas); CLS 0;
   LCP < 1.5 s throttled 4G; zero third-party requests at runtime.
5. `bun run verify` green. `prefers-reduced-motion` and JS-disabled renders are
   complete, settled pages.

## 2. Non-negotiable rules (each maps to a documented prior failure)

- **R1 — No hand-authored visible bytes.** All DOM, CSS, fonts, images, SVGs are
  copied by script from the local reference. You write only: extractor scripts,
  behavior controllers that toggle the original CSS's own state hooks, and glue.
  If something visible is wrong, fix the extractor — never hand-edit its output.
  *(Prior failure: entire page hand-written from screenshots in 20 min; looked wrong
  everywhere; unfixable by polishing.)*
- **R2 — SSIM banned; scores are not evidence.** Only the two-tier gate (§4) counts,
  and no "done" claim is valid without committed diff artifacts.
  *(Prior failure: "SSIM 0.9978 pixel-perfect navbar" reported while the user saw
  it looked wrong.)*
- **R3 — Guessing behavior/timings banned.** Behavior is recorded from the reference
  as mutation traces (§8), never modeled from intuition or memory of similar UIs.
  *(Prior failure: one dropdown re-guessed three times — click-only, then invented
  hover delays, then an invented "Radix" model — an hour lost, still wrong.)*
- **R4 — Extraction and naturalization never mix in one commit.** First byte-exact
  copy that passes its gate; then mechanical renames that hold it at zero diff.
- **R5 — "The reference is broken/racing" must be reproduced with the §3 driver
  before being believed.** *(Prior failure: a cross-origin `contentDocument` check —
  always null — was misread as a "composition race", and a blank-image fallback was
  baked into the harness, corrupting all verification after it.)*
- **R6 — Stop rule.** Three consecutive failed attempts at the same gate → stop,
  commit the failing artifacts, write the blocker to `.context/plans/blockers.md`,
  and move to the next component. Never hand-tune toward a gate.

## 3. Environment

Reference servers — start each from repo root, keep running; restart if down:

```sh
node apps/marketing/__DO_NOT_MERGE__inspiration/attio-com/serve.mjs        # 4180
node apps/marketing/__DO_NOT_MERGE__inspiration/lens-xyz/serve.mjs         # 4175
node apps/marketing/__DO_NOT_MERGE__inspiration/linear-light-mode/serve.mjs # 4176
```

Browser control: raw CDP over WebSocket against the debug Chrome at
`127.0.0.1:9254`. A working starting point (aperture-completing gesture driver) is
`.context/visual-diff/probe.mjs` — fold it into the tooling. No Playwright.

devDeps to add to `@rudel/marketing`: `pixelmatch`, `pngjs`, `postcss`,
`postcss-selector-parser`.

**Component sources of truth** (all local; already carry the composition's transforms
— Rudel links, "agent sessions" copy, light-theme remap):

| Component | Source route |
|---|---|
| Full page (integration reference) | `http://127.0.0.1:4180/lens-attio-lens-aperture` |
| Navbar | `http://127.0.0.1:4176/next?opaline-source=navbar&opaline-links=rudel` |
| Hero title | `http://127.0.0.1:4175/__lens-atoms/interfere-title?opaline-copy=agent-sessions` |
| Hero canvas (WebGL layer) | `http://127.0.0.1:4175/__lens-atoms/hero?opaline-layer=canvas` |
| Dashboard (incl. Claude windows + use-case strip) | `http://127.0.0.1:4180/?opaline-source=attio-dashboard` |
| Content sections + footer | `http://127.0.0.1:4175/build?opaline-source=lens-content` |
| Aperture | already ported at `src/scripts/aperture.ts` — verified faithful; keep it |

CSS/fonts/assets are fetched verbatim: Linear chunks from `static.linear.app`,
Attio/Lens `_next` chunks and assets through the 4180/4175 proxies.

Important background facts, verified — do not rediscover them the hard way:
- The aperture reveal is **gesture-driven** (wheel/touch/keyboard scrub progress
  0→1). `scrollTo` does nothing until it completes. Any capture must first complete
  it with real `Input.dispatchMouseEvent` wheel events.
- The composition's iframes are cross-origin; `iframe.contentDocument` is always
  null. Never use it for readiness checks.
- The reference's inverse-scale hack on the dashboard means the design intent is:
  **dashboard scale is constant 1**; only vertical motion exists.
- The old shots in `.context/reference-shots/` are corrupt (blank heroes). Do not
  use them. Capture fresh into `.context/reference-shots-v2/`.

## 4. Verification system (build this FIRST — everything else is blocked on it)

Location: `apps/marketing/tools/` (driver, extractor, codemods) and
`apps/marketing/tests/` (gates).

- `tools/driver.mjs` — open URL via CDP; wait for network-idle + `document.fonts.ready`;
  complete the aperture with real wheel events; settle; set scroll; screenshot.
  Also replays declarative input scenarios (hover paths, clicks, Escape, tab-key,
  touch drags) for interaction states.
- `tools/capture-matrix.mjs` — runs the §5 matrix against any URL; rejects any shot
  that fails a non-blank content-area histogram check.
- `tools/structural-diff.mjs` — **the PRIMARY gate.** CDP
  `DOMSnapshot.captureSnapshot` on reference and candidate; match nodes by tree path
  (modulo the rename map); diff (a) every computed-style property per node and
  (b) layout box geometry (±0.5 px subpixel tolerance). Output names the exact node
  and property that differ. Must be EMPTY to pass. This is the gate you iterate
  against — failures are actionable.
- `tools/diff.mjs` — **pixel backstop** (pixelmatch): `--max-diff-pct 0.1`
  (extraction; canvas region masked) and `--exact` (naturalization steps). Catches
  only what structure can't see: paint/stacking order, font rasterization, filters,
  asset decoding. Settled states only; caret disabled; overlay scrollbars hidden;
  both sides captured by the same Chrome at fixed DPR.
- `tools/trace.mjs` — behavior recorder (§8).

Pass condition everywhere: **Tier 1 empty AND Tier 2 under threshold.** A Tier 2
failure with an empty Tier 1 is a paint-level issue — investigate it; never bump a
threshold.

**Gate G0 (instrument validation — nothing is built until this passes):**
(a) reference vs itself on a second run → empty structural diff, ~0 pixel diff;
(b) a deliberately broken candidate (change one padding value) → structural diff
names exactly that node and property;
(c) every reference shot has non-blank hero pixels.

## 5. State matrix (used by every gate)

- Viewports: 390×844, 768×1024, 1280×800, 1680×1050, DPR 1.
- Page states: post-reveal top (scrollY 0); aperture mid-reveal (progress ≈ 0.5);
  hero focus (scrollY 500); hero end (scrollY 1180); each Lens section anchor
  (enumerate from the reference's section boundaries at capture time); footer.
- Interaction states: Product dropdown open; Resources dropdown open; item hover;
  settled mid-switch Product→Resources; mobile menu open; each use-case tab
  selected; auxiliary window at default and after a scripted drag (+120 px, −60 px);
  button hover; focus-visible (tab key).
- Special renders: `prefers-reduced-motion: reduce` (aperture skipped, settled page);
  JS disabled (full settled render, no aperture layer).

## 6. Extraction pipeline (per component — replaces ALL hand-built visuals)

Order: **navbar → hero title → dashboard → sections/footer → canvas (§9)**.
For each component, scripted end-to-end:

1. Load its source route with the driver; settle; snapshot the exact `outerHTML` of
   the component subtree. Keep class names, ids, `data-*`, aria, inline styles
   verbatim. Strip only `<script>` tags and preload/prefetch hints.
2. Download every linked stylesheet chunk verbatim → `src/styles/vendor/<source>/`.
3. Mechanical scoping (postcss codemod, zero hand edits): wrap each source's CSS in
   a cascade layer (`@layer linear, interfere, attio, lens;`); rewrite
   `:root`/`html`/`body` selectors to that source's wrapper element (this replaces
   the isolation the iframes provided); hoist and dedupe `@font-face`.
   **Known hazard, prescribed remedy:** `rem` cannot be scoped — it resolves against
   the one real document root, but each source assumed its own root font-size.
   Measure each source document's root font-size at extraction and mechanically
   convert every `rem` (incl. inside `calc()`) to `px`. Value-preserving; verified
   by the structural gate like everything else. Viewport units are safe.
4. Crawl `url()`/`src`/`srcset`; download fonts (byte-identical woff2), images, SVGs
   → `src/assets/vendor/<source>/` and `public/fonts/`; rewrite URLs by script.
5. Emit an Astro component rendering the snapshot verbatim + an isolated preview
   route under `src/pages/_preview/<component>.astro` (excluded from production
   build).
6. **Gate G1:** preview route vs source route, all applicable matrix states —
   structural diff empty AND pixel ≤ 0.1%. Commit with artifact paths in the message.

Delete each existing hand-built component (`Navbar.astro`, `HeroTitle.astro`,
`DashboardWindow.astro`, `CodeWindow.astro`, `MarketingSections.astro`,
`Footer.astro`, `UseCaseStrip.astro` internals) only when its extracted replacement
passes G1 — the site stays runnable throughout. Keep: `aperture.ts`, the
single-controller motion architecture, the `Layout.astro` shell.

## 7. Naturalization (make it ours + Astro-native, zero pixel movement)

Per component, only after its G1. Every step is a deterministic codemod; every step
re-runs the gate in `--exact` mode. Renames have no excuse to move a pixel.

Allowed (DOM and CSS rewritten together from a committed
`tools/rename-map/<component>.json`):
- class renames (`css-x7k2p` → `nav-dropdown-panel`), id and `data-*` renames
  (`data-framer-*` → `data-opaline-*`), custom-property renames;
- splitting vendored monoliths into per-component scoped Astro `<style>` blocks
  (Astro scopes via `:where(.astro-*)` — specificity unchanged, safe);
- templating repeated markup into props/loops/slots — verified first by
  rendered-HTML token equivalence (modulo rename map), then by the zero-diff gate;
- dead-rule pruning ONLY against CSS coverage recorded across the FULL §5 matrix
  (single-state coverage silently kills hover/breakpoint rules).

Forbidden: changing any CSS value (tokenization only as exact-value aliasing,
zero-diff verified); altering selector structure beyond the mechanical rename;
DOM restructuring (only as separate single-change gated commits with a concrete
reason); touching fonts/assets.

**Gate G2:** zero diff at both tiers across the component's matrix states +
rendered-HTML equivalence. One commit per codemod step (R4).

## 8. Behavior (recorded, never guessed)

- `tools/trace.mjs`: inject a MutationObserver (attributes + attributeOldValue +
  subtree, plus inline-style sampling) into the reference component page; drive it
  with scripted CDP input; record the timestamped trace of every
  attribute/class/style mutation. Commit as `tests/traces/<component>.json` — that
  trace IS the behavior spec. Hover-intent delays, exit grace periods,
  persistent-viewport dropdown switching, dismissal rules all fall out as data.
- Controllers are vanilla-TS islands (no framework) that toggle the same state hooks
  the original CSS targets — the extracted CSS then renders every state and
  transition identically, for free.
- **Gate G3a:** under the same scripted input, the candidate produces the same
  mutation sequence, timings within ±1 frame.
- Scroll-driven motion (dashboard rise, title fade/scale): rAF-sample
  `transform`/`opacity` vs `scrollY` on the reference; encode in ONE scroll
  controller (one rAF loop writing CSS custom properties on `<html>`; components
  consume only variables). **Gate G3b:** candidate curves within 1% at every sample;
  determinism check — scrub up/down ×10, resize mid-scroll, reload-at-anchor all
  land on identical states.
- Aperture → page handoff: excess wheel delta after `progress = 1` flows into page
  scroll exactly as the reference trace shows.

**Property ownership (exactly one owner per animated property):**

| Element / property | Sole owner |
|---|---|
| Aperture layer transform/opacity/chroma | aperture state machine (kept port) |
| Hero title opacity/scale | `--title-progress` (scroll controller) |
| Dashboard vertical position | CSS sticky + `--hero-progress` translate |
| Dashboard scale | nobody — constant 1 |
| Auxiliary window position | drag island (pointer events only) |
| Use-case scene visibility | tab island (class toggle; original CSS transitions) |
| Nav dropdown state | nav island (replays traced hooks) |
| Page scroll | the browser; nothing intercepts wheel post-reveal |

## 9. Canvas (the only non-copyable piece — decision already made)

Primary path, bounded to **3 gate attempts** (R6 applies): extract the WebGL program
from the vendored Lens chunk (fetch via the 4175 proxy; shader sources are string
literals) into an owned minimal WebGL2 setup — deterministic first frame, lazy init
after first paint, DPR cap 1.5, pause on `visibilitychange`/off-viewport, static
poster (captured from the reference's deterministic first frame) for no-WebGL and
reduced-motion. Acceptance: first-frame pixel gate ≤ 0.1% + a 10 s side-by-side
recording reviewed blind.

**Automatic fallback after the 3rd failed attempt — no discussion needed:** a
seamless 10 s loop captured from the reference canvas (VP9 WebM, ≥ 8 Mbps,
loop-point matched) as `<video autoplay muted loop playsinline>` behind the identical
mask, same poster fallback. Record which path shipped in this file.

Either way, the canvas owns only its own pixels and never touches scroll state.

**Implementation record — 2026-08-10:** the primary owned WebGL2 path shipped on
the first bounded gate attempt; the video fallback was not used. The source terrain
buffer, shader program, camera matrices, blend state, and color handling were
captured from the local 4175 source. First-frame G1 is exact (0 differing pixels) at
390×844, 768×1024, 1280×800, and 1680×1050. The controlled 10 s A/B recording has
a maximum 0.033691% frame difference; 19 of 20 sampled frames are exact 0.
Artifacts: `.context/gates/hero-canvas/g1/`,
`.context/gates/hero-canvas/recording/`, and
`.context/extractions/canvas/program-trace.json`.

## 10. Integration, audit, ship

1. Assemble into `src/pages/index.astro`. **Gate G4:** full-page §5 matrix (both
   tiers) + all behavior traces replayed in-page, not just in isolation.
   **Known hazard:** components extracted from standalone routes meet each other's
   ancestor contexts here — any ancestor `transform`/`filter` silently re-roots
   `position: fixed`/sticky. Fix at the integration shell, never inside a gated
   component.
2. Blind check: shuffled reference/candidate pairs must be unidentifiable.
3. Perf audit per §1. Vendored CSS is reduced only via §7 coverage pruning and build
   minification — never hand-editing (R1). If budget conflicts with fidelity,
   fidelity wins; document the overage in the PR.
4. Accessibility: keyboard through all islands, focus-visible states (in the
   matrix), Escape per trace, aria from the extracted DOM.
5. Deploy: pure static — `astro build` → `dist/`, no adapter, no SSR. Hosting wiring
   happens in the ops repo; nothing here needs more than a static file host.
6. CI: `astro check`, biome, `astro build`, reference-free trace-replay checks.
   All reference gates run locally only (need 4175/4176/4180 + debug Chrome) via a
   `gates` script documented in `apps/marketing/README.md`.
7. PR per repo rules (`bun run verify` first; conventional title). Include: gate
   summary table, artifact paths, canvas decision, blind-check result.

## 11. Execution order (strict; two human checkpoints, otherwise autonomous)

1. Build §4 tooling; pass G0; re-capture ground truth. **CHECKPOINT A approved by
   Evren on 2026-08-07.**
2. Navbar: G1 → G2 → G3. Delete hand-built navbar. **→ CHECKPOINT B: Evren eyeballs
   the navbar against 4176. It is the pilot proving the whole pipeline on the
   hardest interactive component. If it looks wrong despite green gates, the
   INSTRUMENT is broken — fix the harness, not the component.**
3. Hero title: G1 → G2 → G3 (title fade curve).
4. Dashboard (incl. Claude windows, use-case strip): G1 → G2 → G3 (rise curve, tabs,
   drag). Largest subtree; identical pipeline.
5. Sections + footer: G1 → G2.
6. Canvas: §9.
7. Integration: G4 + blind check + perf + a11y; ship per §10.

After each numbered step: one short status with gate results and artifact paths.
No green claims without artifacts (R2). Blockers go to `.context/plans/blockers.md`
under R6 — never polished around.

## 12. Provenance note (for Evren, not a build blocker)

Even fully renamed, the shipped CSS values, layout, and interaction design remain
copied from Attio/Linear/Lens/Interfere. Renaming changes code provenance, not the
look. Decide the public-launch posture consciously. The inspiration folder itself
never ships and stays untouched.

## 13. Sanctioned divergences

The composed route remains the byte-for-byte extraction target. Intentional product
changes are applied only after parity and only when listed in
`.context/plans/sanctioned-divergences.md`.

- Each divergence is a mechanical, separately gated transform.
- The divergence structural gate must contain only the approved subtree operation
  and its direct geometry/style consequences; unrelated differences fail.
- Pending ledger entries grant no implementation authority.
- `Ask Attio` and `Workflows` removal, plus making the auxiliary Claude windows
  genuinely draggable, are already approved by prior explicit user instruction.
- The approved hero subtitle is `Opaline finds the root cause and owns the fix.`
- The approved footer transform is Lens logo → Opaline wordmark from
  `apps/marketing/public/`, and `© 2026 Mask Network` → `© 2026 Opaline`.
  Footer link labels, columns, layout, and styling remain byte-for-byte parity
  targets.
