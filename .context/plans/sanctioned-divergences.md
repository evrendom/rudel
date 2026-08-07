# Opaline sanctioned divergences

The composed `4180` route remains the extraction and parity ground truth. This
ledger is the only authority for intentional post-parity changes. A divergence is
applied only after its source component passes G1/G2 unchanged.

## Gate rules

1. Each divergence is one mechanical transform and one commit.
2. Before/after DOM snapshots and pixel artifacts are retained under
   `.context/gates/divergences/<id>/`.
3. The structural report may contain only the ledgered node/subtree and the
   geometry/style changes caused by that operation. Any unrelated difference fails.
4. Behavior traces must remain identical unless the ledger explicitly authorizes a
   behavior change.
5. Pending items do not authorize implementation. Until approved, reference content
   is copied byte-for-byte.

## Ledger

| ID | Component | Reference content | Mechanical transform | Status | Authority / decision needed |
|---|---|---|---|---|---|
| D001 | Hero subtitle | `Interfere finds the root cause and owns the fix.` | Replace with `Opaline finds the root cause and owns the fix.`; no other text, geometry, style, or behavior changes. | **Approved** | Checkpoint A ruling, 2026-08-07. |
| D002 | Aperture dashboard | `Ask Attio` control | Remove the control from the aperture-derived dashboard only; preserve it in the original Attio inspiration route. | **Approved** | Prior explicit instruction: remove “Ask Attio” from the aperture version and keep original Attio intact. |
| D003 | Aperture dashboard sidebar | `Workflows` navigation row | Remove the row from the aperture-derived dashboard only; preserve it in the original Attio inspiration route. | **Approved** | Prior explicit instruction: remove “Workflows” from the aperture version and keep original Attio intact. |
| D004 | Footer | Lens logo and `© 2026 Mask Network` | Replace the Lens logo with the Opaline wordmark from `apps/marketing/public/` and replace the legal line with `© 2026 Opaline`; preserve all footer link labels, columns, layout, and styling exactly. | **Approved** | Checkpoint A ruling, 2026-08-07. |
| D005 | Auxiliary Claude windows | The current 4180 reference receives pointer events but produces a measured `0 px` drag delta at tablet, desktop, and wide viewports. | Make each visible auxiliary window draggable and preserve its released position. | **Approved behavior divergence** | Prior explicit instruction: “for lens-attio, i can not drag around the windows. pls fix that for me.” G0 records the broken reference behavior instead of mislabeling it as a successful drag. |

## Pending decisions

None. Any new divergence requires an explicit ledger amendment before implementation.
