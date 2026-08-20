import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
} from "./session-turn-table";
import type { SessionTurnTableColumnKey } from "./session-turn-table-column-options";

const option: SessionTurnTableOption = {
	compactionsBefore: [],
	key: "turn-1",
	metrics: {
		editedFiles: [],
		errorCount: 0,
		errorEvents: [],
		estimatedCost: 0.04,
		inputTokens: 1_200,
		outputTokens: 480,
		skills: [],
		skillEvents: [],
		usageEvents: [],
	},
	slashCommands: [],
	timing: {
		durationLabel: "2 min",
		durationSeconds: 120,
		endTime: "10:02",
		startTime: "10:00",
	},
	toolCallCount: 3,
	turnNumber: 1,
};

describe("session turn table scroll root", () => {
	test("owns horizontal scrolling for both the column header and rows", () => {
		const visibleOptions = [{ index: 0, option }];
		const markup = renderToStaticMarkup(
			createElement(SessionTurnTable, {
				model: "gpt-5",
				onSelect: () => undefined,
				onSort: () => undefined,
				options: [option],
				selection: { index: 0, speaker: "model" },
				sessionDurationLabel: "2 min",
				speakerVisibilityControls: null,
				sort: { direction: "asc", key: "time" },
				visibleColumnKeys: new Set<SessionTurnTableColumnKey>(["time"]),
				visibleOptions,
			}),
		);
		const headerStartIndex = markup.indexOf("<thead");
		const bodyStartIndex = markup.indexOf("<tbody");
		const scrollMarkerIndex = markup.indexOf("data-session-turn-table-scroll");
		const scrollTagStartIndex = markup.lastIndexOf("<", scrollMarkerIndex);

		expect(headerStartIndex).toBeGreaterThan(scrollMarkerIndex);
		expect(bodyStartIndex).toBeGreaterThan(headerStartIndex);
		expect(markup.slice(scrollTagStartIndex, scrollTagStartIndex + 4)).toBe(
			"<div",
		);
		expect(markup.match(/data-session-turn-table-scroll(?!bar)/g)).toHaveLength(
			1,
		);
		expect(markup).toContain("sticky top-0");
		expect(markup).toContain("h-(--session-turn-table-header-height)");
		expect(markup).toContain(
			"sticky top-0 z-10 block min-w-full border-b-[0.5px] border-(--session-overview-border)",
		);
		expect(markup).toContain("data-session-turn-table-scrollbar");
		expect(markup).toContain("data-session-turn-table-scrollbar-thumb");
	});
});
