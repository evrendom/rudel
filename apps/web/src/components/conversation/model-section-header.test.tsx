// @ts-expect-error -- jsdom is an existing test dependency without bundled declarations.
import { JSDOM } from "jsdom";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TranscriptStickyHeaderOverlay } from "@/features/sessions/components/use-transcript-model-header-overlay";
import { AgentTraceTreeSection } from "./conversation-trace-tree";

test("the model row and overlay render identical section-header DOM", () => {
	const header = {
		agentLabel: "GPT 5.2",
		agentModel: "gpt-5.2",
		continues: true,
		kind: "model" as const,
		planMode: true,
		terminal: false,
	};
	const rowMarkup = renderToStaticMarkup(
		<AgentTraceTreeSection
			agentLabel={header.agentLabel}
			agentModel={header.agentModel}
			continuesAfter={header.continues}
			events={[]}
			planMode={header.planMode}
			sections={[]}
			stickyHeader={false}
		/>,
	);
	const rowHeader = new JSDOM(rowMarkup).window.document.querySelector(
		"[data-model-section-header]",
	);
	if (!rowHeader) {
		throw new Error("Expected the in-row model section header");
	}
	const modelHeaderMarkup = rowHeader.outerHTML;

	const overlayMarkup = renderToStaticMarkup(
		<TranscriptStickyHeaderOverlay
			memberMeasureRef={() => {}}
			memberMeasurementOwner={undefined}
			modelMeasureRef={() => {}}
			modelMeasurementOwner={undefined}
			overlayRef={createRef<HTMLDivElement>()}
			owner={{
				endRowIndex: 2,
				header,
				headerRowIndex: 1,
				ownerKey: "turn-1:model",
				startRowIndex: 1,
				turnId: "turn-1",
			}}
		/>,
	);
	const overlayHeader = new JSDOM(overlayMarkup).window.document.querySelector(
		"[data-model-section-header]",
	);
	if (!overlayHeader) {
		throw new Error("Expected the overlay model section header");
	}
	expect(overlayHeader.outerHTML).toBe(modelHeaderMarkup);
});
