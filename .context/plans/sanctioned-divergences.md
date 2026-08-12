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
| D005 | Dashboard window stack | The current 4180 reference does not provide reliable dragging for the complete window stack. | Make the main dashboard window and every visible auxiliary window draggable with identical pointer semantics; preserve each released position and raise the dragged window. Gate every window with an exact requested-vs-actual scripted delta. | **Approved behavior divergence** | Product ruling, 2026-08-10: “All dashboard windows are draggable — including the main window.” |
| D006 | Dashboard window stack | The current 4180 reference lacks product-approved macOS-style stack focus. | On pointer-down, immediately raise any main or auxiliary window to the top of the stack before the drag threshold. Preserve normal clicks and controls inside the main window; focus handling must not swallow descendant events. | **Approved behavior divergence** | Product ruling, 2026-08-10: “Click-to-focus on every window.” |
| D007 | Claude terminal prompt and status strip | The measured Attio terminal types in its prompt row and renders the `>`, `●`, `⎿`, `▶▶ auto`, model-context, cursor, and spinner marks as JetBrains Mono glyphs; its three traffic lights are CSS spans. The measured source contains no terminal SVGs and no microphone/enter controls. | Keep all typing inside the prompt row and preserve the measured source glyph/status strip exactly. Require the exact local JetBrains Mono subsets to load and require every measured glyph and traffic light to have nonzero painted geometry. The earlier microphone/enter request remains authorized only if its exact owned source component is identified later; do not invent or substitute icons in this parity pass. | **Approved product constraint; measured parity complete** | Explicit product instruction reaffirmed 2026-08-10: typing stays in-row and terminal fonts/icons must load. Source inspection on 2026-08-10 found no microphone/enter icon assets in these terminal subtrees. |

## Pending decisions

None. Any new divergence requires an explicit ledger amendment before implementation.
