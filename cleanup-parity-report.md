# Transcript cleanup parity report

Date: 2026-08-17  
Baseline: `d7794c94` (`chore(web): remove transcript cleanup debris`)

All Stage 2 parity gates pass. Existing automated coverage was run where available; the two paths without dedicated browser specs were manually traced through the mounted production components and their request/cache boundaries.

| Behavior | Verdict | Evidence |
| --- | --- | --- |
| Ledger jump | PASS | Chromium `session-detail-fast-response.spec.ts` loaded the real `SessionDetailFastResponsePane` through `detailWindow`, selected turn 81, observed the anchor request, and asserted the target became visible, current, and focused. Chromium `session-transcript-virtual.spec.ts` also passed jump settling and fold expansion before anchoring. |
| Active-turn highlight sync | PASS | The real-pane test asserted `aria-current="true"` after a ledger selection. The virtual-list viewport tests passed active-turn calculation, end-of-thread behavior, and viewport publication. |
| `?turn=` deep link | PASS | The real-pane test asserted the selected stable turn ID was written to the URL after the anchor load. `SessionDetailFastContent` resolves the initial URL turn to a selection and preserves it through anchored loading. |
| Search, including outside-window and inside-fold hits | PASS | Focused tests passed sequential window indexing across directional cursors and body-only hits. The virtual e2e passed a programmatic hit that expands its semantic fold before anchoring and focuses the revealed row. |
| `?level=` toggle | PASS | The real-pane test switched to request level, asserted `level=request`, retained the anchored target, and continued scrolling without blanks. Level parsing and headerless normal-mode derivation passed their Bun tests. |
| Subagent disclosures | PASS | Manual production-path verification: `SessionDetailSubagents` is mounted after the transcript list, independent of transcript rendering. Each disclosure lazily calls `detailSubagent`, handles stale revisions, cancels on close, renders parsed traces or raw fallback content, and retains native `<details>/<summary>` semantics. The API contract and endpoint guardrail tests passed in `bun run verify`. |
| `?skeletons=` modes | PASS | Focused tests passed development-only hold/mix/delay parsing, production hard-disable, stable sizing, and natural-height skeleton rendering. The virtual e2e passed pending-row hydration with zero true blank frames. |
| Stale-revision recovery | PASS | Manual production-path verification: window, direction, anchor, visible-body fallback, search, and subagent failures all forward typed stale revisions. `SessionDetailView` preserves the selected turn, cancels and removes revision/body/window query families, refetches the overview, and remounts content on the new revision key. Focused tests passed stale-epoch rejection and non-retry behavior. |
| Focus and accessibility | PASS | Chromium tests asserted anchored rows become focused and current, expansion buttons expose truthful `aria-expanded`, and the conversation thread remains a named region. Focus math, filtered indices, viewport publication, and expansion persistence tests all passed. |

## Commands run

- `bun run verify` — PASS: type checks, lint, unit tests, and production builds.
- `bun run test:trace-tree:e2e --project=chromium e2e/trace-tree/session-detail-fast-response.spec.ts e2e/trace-tree/session-transcript-virtual.spec.ts e2e/trace-tree/session-transcript-instrumentation.spec.ts e2e/trace-tree/session-transcript-texture-mask.spec.ts` — PASS: 15/15.
- `bun run test --run` over search, search-loader, skeleton-debug, focus, viewport-store, fast-query, transcript-list, and parser-parity tests — PASS: 27/27.
- `bun test` over level, transcript-sections, window-store, and error-boundary Bun suites — PASS: 14/14.

No snapshots were rewritten. The protected concurrent-writer files `conversation-trace-event-row.*` and `session-thread-overview-*` were not modified.
