# R6 blockers

## Dashboard Reporting settled-state extraction — 2026-08-07

**Status:** R6 triggered after three consecutive failures of the responsive
Reporting-state gate. Dashboard iteration is stopped pending an explicit reset.

### What is green

- Data model, desktop G1: 0.006250% pixel difference, 0 structural differences.
- Data model and Reporting naturalization G2: 0 pixels, 0 structural differences
  before the settled-state correction.
- Mobile Data model/Reporting G1 and G2: 0 pixels, 0 structural differences before
  the settled-state correction.
- Responsive shell/panel geometry is within 0.003 px at 768 and 1680 widths.
- Tab shell replacement is within one frame; drag is exactly +120 px, -60 px.
- D002/D003 remove only the 12 authorized `Ask Attio`/`Workflows` nodes.

### The blocker

The live 4180 Reporting scene is a React/Framer/Web-Animations subtree. Its normal
state is fully painted (charts, bars, donut, report cards), but that paint state is
not represented by its serialized `outerHTML`. Cloning the settled panel restarts
or drops animation effects and yields a blank report body. That makes a plain DOM
snapshot extractor incapable of preserving the approved normal state as-is.

### Three failed attempts

1. Capture 350 ms after the tab mutation. This serialized the outgoing Data table
   during the transition instead of the Reporting scene.
2. Wait 1200 ms, call `finish()` + `commitStyles()` on every animation, then clone.
   This serialized exit endpoints: report labels survived, charts disappeared.
3. Wait 1200 ms and copy current computed values for every animated property to the
   corresponding cloned node. Source timing can be in its blank interstitial phase,
   so the resulting snapshot still has a blank report body.

### Evidence

- Live normal states:
  - `.context/probes/dashboard-reporting-settle/500.png`
  - `.context/probes/dashboard-reporting-settle/1000.png`
  - `.context/probes/dashboard-reporting-settle/2000.png`
- Failed serialized state:
  - `.context/extractions/dashboard/source-reporting-normalized.png`
  - `.context/gates/dashboard/g1/reporting-candidate.png`
- Responsive gate report and screenshots:
  - `.context/gates/dashboard/responsive/report.json`
  - `.context/gates/dashboard/responsive/*-reporting-*.png`

### Next bounded experiment if R6 is reset

Wait on a paint-state predicate rather than elapsed time: require the `Business
Metrics` heading plus colored chart geometry to have non-zero painted ancestors for
three consecutive animation frames. At that exact state, copy computed animated
properties by source/clone node index and immediately serialize. If that does not
hold at all four viewports, replace only the report-visual subtree with a static
source capture while retaining the owned Attio shell, tab behavior, and accessibility
tree; that would require ledger approval because it changes implementation form.

## Dashboard Reporting approved fallback and composed-state residual — 2026-08-10

**Status:** The pre-approved Reporting fallback is installed. R6 remains active;
no further dashboard predicate, responsive, or auxiliary-motion iterations are
authorized in this run.

### Final fallback result

- Reporting is a breakpoint-specific static source capture inside the owned,
  interactive Attio shell. Data/Reporting tabs and the accessibility description
  remain live DOM; only the decorative report visual is rasterized.
- Desktop G1: Data 0.061621%, Reporting 0%; both have 0 structural differences.
- Desktop G2: exact 0 pixels / 0 structural differences for both scenes.
- Mobile G1: Data 0.002734%, Reporting 0%; both have 0 structural differences.
- Mobile G2: exact 0 pixels / 0 structural differences for both scenes.
- Responsive tablet: Data 0.038658%, Reporting 0.050551%; G2 exact.
- Responsive wide: Data 0.069698% and G2 exact; Reporting geometry and G2 exact,
  but G1 is 0.202687%.

The wide Reporting residual is outside the masked static Reporting panel. It is
the source Claude terminal's time-dependent typing/paint state advancing during
the six-second source wait. Three fallback passes were exhausted: body-only static,
full breakpoint panel, and full breakpoint panel with its raster round-trip mask.

### Fresh composed evidence

- `desktop-top`: 5.771094% pixel difference.
- `hero-focus`: 8.284180% pixel difference.
- Report and captures: `.context/gates/composed/dashboard/`.

The composed pair exposed two integration facts:

1. The candidate's auxiliary Claude windows are already visible at the top state;
   the reference keeps them out until the dashboard-focused state. This is the
   largest top-state residual and belongs to dashboard motion, so it is recorded
   under R6 rather than iterated further.
2. The black `Request a demo` background is source-correct. Its candidate label
   was incorrectly black/15px because the unlayered global anchor reset overrode
   the extracted layered 13px/white rule. The integration reset was narrowed and
   the current audit is 13px, white, with the exact source dimensions.

### Artifacts

- Static captures: `apps/marketing/public/vendor/attio-dashboard/reporting-panel-*-source.png`
  and `reporting-panel-*-branded.png`.
- Capture metadata: `.context/extractions/dashboard/reporting-static/metadata.json`.
- Isolated gates: `.context/gates/dashboard/g1/`, `g2/`, `g1-mobile/`,
  `g2-mobile/`, `g3/`, and `responsive/`.
- Composed pair: `.context/gates/composed/dashboard/`.

## Full integration G4 — 2026-08-10

**Status:** R6 triggered after the third consecutive full-page G4 attempt. All
components are installed on `/`; no fourth G4 tuning or capture pass is authorized
without an explicit reset.

### Three attempts

1. `.context/gates/g4-fresh-20260810-1210/` exposed two harness/integration defects:
   transformed section anchors were used as document anchors, and candidate
   aperture progress was not externally observable.
2. `.context/gates/g4-final-fresh-20260810-1230/` verified the corrected anchors,
   aperture state, and responsive hero/content boundary, but still used the
   viewport center for the extracted title rather than the reference title iframe's
   responsive center.
3. `.context/gates/g4-blind-final-20260810-rerun/` is the authoritative final fresh
   set after the title-slot correction: 96 reference shots, 96 candidate shots,
   96 comparisons, 0 missing. Strict G4 is false with 36 unapproved paint failures
   and 49 states carrying the existing dashboard R6 residual.

### Current residuals

- Fresh desktop composed evidence: `desktop-top` 3.559961%; `hero-focus`
  8.704688%. These are dominated by the dashboard auxiliary Claude windows being
  visible at rest in the candidate and time-dependent in 4180. Dashboard R6 already
  forbids another motion pass.
- All 32 native Lens section comparisons are geometrically aligned but exceed the
  0.1% pixel threshold (maximum 0.740723%). The reference paints this exact subtree
  through a translated iframe compositor; the owned candidate paints it natively.
  The full-page diffs isolate rasterization edges around text and SVGs. The isolated
  G1 and G2 matrices remain exact 0 pixels / 0 structural differences across all
  40 states.
- Aperture-mid is 0.556406–2.318629%. The mask geometry aligns; unsynchronized
  dynamic canvas phase and composited edge rasterization remain. The canvas's
  isolated deterministic first-frame gate is exact at all four viewports and its
  ten-second A/B maximum remains 0.033691%.

### Final evidence

- Gate report: `.context/gates/g4-blind-final-20260810-rerun/report.json`
- Fresh captures: `.context/gates/g4-blind-final-20260810-rerun/reference/` and
  `.context/gates/g4-blind-final-20260810-rerun/candidate/`
- Pixel diffs: `.context/gates/g4-blind-final-20260810-rerun/diff/`
- Blind review: `.context/gates/g4-blind-final-20260810-rerun/blind-review.html`
- Labeled review: `.context/gates/g4-blind-final-20260810-rerun/side-by-side.html`
