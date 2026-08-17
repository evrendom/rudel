# Transcript cleanup summary

Date: 2026-08-17

The transcript migration now has one production renderer: windowed bodies, virtualized sections, render-on-expand trace rows, cached worker highlighting, and the skeleton texture mask. Server endpoints remain intact for deployed clients and the `detailTurn`/`detailSubagent` fallbacks.

## Change size

| Stage | Insertions | Deletions | Net LOC | Outcome |
| --- | ---: | ---: | ---: | --- |
| 1 — risk-free debris | 25 | 518 | -493 | Removed dead experiment and export debris; marked the window API proposal implemented. |
| 2 — single transcript path | 145 | 2,625 | -2,480 | Retired the document-flow renderer, per-turn legacy hydration, and legacy-only e2e coverage after every parity gate passed. Three obsolete screenshot binaries were also deleted. |
| 3 — post-deletion sweep | 246 | 674 | -428 | Removed newly unreachable view/focus/parser code and moved skeleton-debug behavior to the window-query boundary. |
| **Total** | **416** | **3,817** | **-3,401** | |

Stage 3 counts include this report and the `CLAUDE.md` architecture note. They are the final staged diff counts, not estimates.

## Production bundle

| Asset | Stage 1 baseline | Final | Change |
| --- | ---: | ---: | ---: |
| Sessions page JavaScript | 336,133 B / 97.93 kB gzip | 312,927 B / 91.29 kB gzip | -23,206 B / -6.64 kB gzip |
| Sessions page CSS | 25,933 B / 4.37 kB gzip | 25,933 B / 4.37 kB gzip | unchanged |
| Code-highlight worker | 1,209,693 B | 1,209,693 B | unchanged |
| Entire `apps/web/dist` allocated size | 14,280 KiB | 14,252 KiB | -28 KiB |

The baseline was captured after the verified Stage 1 worktree and before its commit; the final numbers come from the verified Stage 3 production build.

## Surviving debug surfaces

- `?transcriptDebug=1`: permanent forensic ledger, HUD, and `window.__transcriptTrace` dump API.
- `?skeletons=hold`, `?skeletons=mix`, and `?skeletons=delay:<ms>`: development-only window-boundary skeleton modes.
- `/dev/transcript-mask`: the real light/dark texture tuning surface.
- `/dev/trace-tree-fixture`: transcript behavior and instrumentation fixture.
- `/dev/session-detail-fast-integration`: the real-pane/window-transport integration fixture.

## Shelved forever

`fullMount` escape hatch; A4 shell rows. Full mounting was superseded by the accepted texture-mask outcome in `.context/scroll-forensics/step-12-texture-mask.md`; A4's decision point and the rejected predictive-lookahead evidence are recorded in `.context/scroll-forensics/step-10-a2-lookahead.md`.

## Guardrails retained

The transcript forensics module and tests, HUD, skeleton modes, mask route, worker/cache, expansion store, and texture mask all remain. No server endpoint was removed. The protected concurrent-writer files `conversation-trace-event-row.*` and `session-thread-overview-*` were not modified.
