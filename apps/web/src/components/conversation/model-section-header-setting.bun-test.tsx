import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	formatConversationModelSetting,
	ModelSectionHeader,
} from "./model-section-header";

function renderHeader(modelSetting?: string) {
	return renderToStaticMarkup(
		<ModelSectionHeader
			data={{
				agentLabel: "Fable 5",
				agentModel: "claude-fable-5",
				continues: false,
				modelSetting,
				planMode: false,
				terminal: true,
			}}
			expanded
		/>,
	);
}

describe("ModelSectionHeader model setting", () => {
	test("renders a source-backed setting immediately after the model label", () => {
		const markup = renderHeader("xhigh");

		expect(markup).toContain("Fable 5");
		expect(markup).toContain("Extra High");
		expect(markup.indexOf("Fable 5")).toBeLessThan(
			markup.indexOf("Extra High"),
		);
		expect(markup).toContain("data-trace-model-setting");
	});

	test("uses the ledger icon shell without disabling disclosure hover", () => {
		const markup = renderHeader("xhigh");

		expect(markup).toContain("session-turn-table-model-icon-shell");
		expect(markup).toContain("session-turn-table-model-icon size-5");
		expect(markup).toContain("group-hover:opacity-0");
		expect(markup).toContain('data-trace-disclosure-symbol="chevron"');
	});

	test("does not render a setting when the transcript provides none", () => {
		expect(renderHeader()).not.toContain("data-trace-model-setting");
	});

	test("keeps unknown provider settings verbatim", () => {
		expect(formatConversationModelSetting("provider-special")).toBe(
			"provider-special",
		);
	});
});
