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
