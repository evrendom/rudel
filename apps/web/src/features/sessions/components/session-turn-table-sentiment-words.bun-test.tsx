import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSessionTurnTableColumns } from "./session-turn-table-columns";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import { SessionTurnTableRowView } from "./session-turn-table-row";
import { buildSessionTurnTableViewRows } from "./session-turn-table-view-rows";

const option: SessionTurnTablePaneOption = {
	compactionsBefore: [],
	key: "sentiment-turn",
	memberPreview: "Great, sorry, fishy shit??",
	metrics: {
		editedFiles: [],
		errorCount: 0,
		errorEvents: [],
		estimatedCost: undefined,
		inputTokens: undefined,
		outputTokens: undefined,
		skillEvents: [],
		skills: [],
		usageEvents: [],
	},
	preview: "Excellent model response",
	slashCommands: [],
	timing: {
		durationLabel: undefined,
		durationSeconds: undefined,
		endTime: "",
		startTime: "10:00",
	},
	toolCallCount: 0,
	turn: {
		responseItems: [
			{
				events: [
					{
						content: "Excellent model response",
						id: "model-message",
						kind: "message",
						text: "Excellent model response",
						timestamp: "2026-08-18T10:00:01.000Z",
					},
				],
				id: "model-agent",
				executionMode: "unknown",
				kind: "agent",
				timestamp: "2026-08-18T10:00:01.000Z",
			},
		],
		userItems: [
			{
				content: "Great, sorry, fishy shit??",
				id: "member-message",
				kind: "user",
				timestamp: "2026-08-18T10:00:00.000Z",
			},
		],
	},
	turnNumber: 1,
};

function renderRow(
	row: ReturnType<typeof buildSessionTurnTableViewRows>[number],
) {
	const rows = buildSessionTurnTableViewRows(
		[{ index: 0, option }],
		new Set(["member", "model"]),
		"member",
	);
	const columns = buildSessionTurnTableColumns([option], "member", rows);
	return renderToStaticMarkup(
		<table>
			<tbody>
				<SessionTurnTableRowView
					beginsTurn={false}
					collapsedEpisodeKeys={undefined}
					columns={columns}
					emphasized={false}
					episode={undefined}
					gridTemplate="1fr 1fr"
					inViewport={false}
					matchesLens={false}
					onEpisodeToggle={undefined}
					onKeyDown={() => undefined}
					onSelect={() => undefined}
					row={row}
					selected={false}
					userImageUrl={undefined}
					userLabel="Member"
					viewed={false}
					visibleIndex={0}
				/>
			</tbody>
		</table>,
	);
}

describe("SessionTurnTable sentiment words", () => {
	test("renders every user signal category and excludes model signals", () => {
		const rows = buildSessionTurnTableViewRows(
			[{ index: 0, option }],
			new Set(["member", "model"]),
			"member",
		);
		const memberRow = rows.find((row) => row.speaker === "member");
		const modelRow = rows.find((row) => row.speaker === "model");
		if (!memberRow || !modelRow) {
			throw new Error("Expected member and model ledger rows");
		}

		const memberMarkup = renderRow(memberRow);
		const modelMarkup = renderRow(modelRow);

		expect(memberMarkup).toContain('aria-label="Sentiment words"');
		expect(memberMarkup).toContain('data-signal="positive"');
		expect(memberMarkup).toContain('data-signal="apology"');
		expect(memberMarkup).toContain('data-signal="negative"');
		expect(memberMarkup).toContain('data-signal="swear"');
		expect(memberMarkup).toContain("Great");
		expect(memberMarkup).toContain("sorry");
		expect(memberMarkup).toContain("fishy");
		expect(memberMarkup).toContain("shit");
		expect(memberMarkup).toContain("??");
		expect(memberMarkup).not.toContain("Excellent");
		expect(modelMarkup).not.toContain("data-signal");
		expect(modelMarkup).not.toContain("Excellent");
	});
});
