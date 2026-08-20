import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSessionTurnTableColumns } from "./session-turn-table-columns";
import { buildSessionTurnMemberTextDisplay } from "./session-turn-table-member-text";
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
	modelSignalCount: 1,
	preview: "Excellent, sorry model response",
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
						content: "Excellent, sorry model response",
						id: "model-message",
						kind: "message",
						text: "Excellent, sorry model response",
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
					model="claude-fable-5"
					onEpisodeToggle={undefined}
					onKeyDown={() => undefined}
					onSelect={() => undefined}
					row={row}
					selected={false}
					showSpeakerColumn={true}
					userImageUrl={undefined}
					userLabel="Member"
					viewed={false}
					visibleIndex={0}
				/>
			</tbody>
		</table>,
	);
}

describe("SessionTurnTable member text", () => {
	test("keeps the server model count stable before and after the body loads", () => {
		const overviewOption: SessionTurnTablePaneOption = {
			...option,
			modelSignalCount: 7,
			preview: "Truncated neutral preview",
			turn: undefined,
		};
		const loadedOption: SessionTurnTablePaneOption = {
			...overviewOption,
			turn: {
				responseItems: [
					{
						events: [
							{
								content: "Sorry, this is fishy",
								id: "loaded-model-message",
								kind: "message",
								text: "Sorry, this is fishy",
								timestamp: "2026-08-18T10:00:01.000Z",
							},
						],
						executionMode: "unknown",
						id: "loaded-model-agent",
						kind: "agent",
						timestamp: "2026-08-18T10:00:01.000Z",
					},
				],
				userItems: option.turn?.userItems ?? [],
			},
		};
		const getModelCount = (candidate: SessionTurnTablePaneOption) =>
			buildSessionTurnTableViewRows(
				[{ index: 0, option: candidate }],
				new Set(["model"]),
				"model",
			)[0]?.signalCount;

		expect([
			getModelCount(overviewOption),
			getModelCount(loadedOption),
		]).toEqual([7, 7]);
	});

	test("uses the server count when the only member signal is beyond the preview", () => {
		const preview = "x".repeat(140);
		const rows = buildSessionTurnTableViewRows(
			[
				{
					index: 0,
					option: {
						...option,
						memberPreview: preview,
						signalCount: 1,
						turn: {
							responseItems: option.turn?.responseItems ?? [],
							userItems: [
								{
									content: `${preview} Great Sorry fishy`,
									id: "late-signal",
									kind: "user",
									timestamp: "2026-08-18T10:00:00.000Z",
								},
							],
						},
					},
				},
			],
			new Set(["member"]),
			"member",
		);

		expect(rows[0]?.signalCount).toBe(1);
	});

	test("renders signals inside the user text and excludes model text", () => {
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
		const signalColumn = buildSessionTurnTableColumns(
			[option],
			"model",
			rows,
		).find((column) => column.key === "signals");
		if (!signalColumn) {
			throw new Error("Expected a model Signals column");
		}

		expect(memberMarkup).toContain('aria-label="Text"');
		expect(memberMarkup).not.toContain('aria-label="Characters"');
		expect(memberMarkup).not.toContain('aria-label="Sentiment words"');
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
		expect(memberMarkup).toContain("data-user-trace-avatar-shell");
		expect(modelMarkup).not.toContain("data-signal");
		expect(modelMarkup).not.toContain("Excellent");
		expect(modelMarkup).toContain("session-turn-table-model-icon-shell");
		expect(signalColumn.getValues(memberRow)).toEqual([]);
		expect(signalColumn.getValues(modelRow)[0]?.label).toBe("1");
	});

	test("keeps the opening for neutral text and shifts late signals into view", () => {
		const neutralText = "Alpha beta gamma delta epsilon zeta";
		expect(buildSessionTurnMemberTextDisplay(neutralText)).toEqual({
			excerpt: neutralText,
			fullText: neutralText,
		});

		const signalText =
			"Alpha beta gamma delta epsilon this context immediately before sorry and after.";
		expect(buildSessionTurnMemberTextDisplay(signalText)).toEqual({
			excerpt: "… this context immediately before sorry and after.",
			fullText: signalText,
		});
	});
});
