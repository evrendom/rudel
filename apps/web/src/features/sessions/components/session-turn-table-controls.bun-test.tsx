import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionTurnTableControls } from "./session-turn-table-filter";

describe("session turn table controls", () => {
	test("keeps sorting and speaker controls without filters, counts, or column configuration", () => {
		const markup = renderToStaticMarkup(
			createElement(SessionTurnTableControls, {
				activeSortLabel: "Time",
				className: undefined,
				onToggleSortDirection: () => undefined,
				sort: { direction: "asc", key: "time" },
				viewControls: createElement("span", null, "Speaker controls"),
			}),
		);

		expect(markup).toContain("Sorted by");
		expect(markup).toContain("Speaker controls");
		expect(markup).not.toContain("Filter");
		expect(markup).not.toContain("Columns");
		expect(markup).not.toContain("<output");
	});
});
