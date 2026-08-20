import { SessionDetailOverviewSchema } from "@rudel/api-routes";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildSessionDetailOverviewViewModel } from "./session-detail-overview-model";
import { SessionOverviewSummaryStrip } from "./session-overview-summary-strip";

describe("SessionOverviewSummaryStrip", () => {
	it("shows session identity and activity tags instead of metric cards", () => {
		const overview = SessionDetailOverviewSchema.parse({
			activityTotals: {
				edit: 1,
				error: 2,
				read: 3,
				signal: 0,
				signalScanVersion: 1,
				skill: 0,
				subagent: 1,
				write: 1,
			},
			context: {
				errors: [{ count: 2, label: "exec_command" }],
				files: [
					{ operation: "read", path: "/repo/src/read.ts" },
					{ operation: "read", path: "/repo/src/other.ts" },
					{ operation: "read", path: "/repo/README.md" },
					{ operation: "edited", path: "/repo/src/edited.ts" },
					{ operation: "created", path: "/repo/src/created.ts" },
				],
			},
			revision: "2026-08-16T08:30:00.123Z",
			session: {
				durationMinutes: 90,
				estimatedCost: 470.945,
				gitBranch: "feature/context-strip",
				gitSha: "abcdef1234567890",
				inputTokens: 1_000,
				lastInteractionDate: "2026-08-16T09:30:00.123Z",
				modelUsed: "gpt-5.6-sol",
				outputTokens: 200,
				projectPath: "/src/rudel",
				repository: "rudel/rudel",
				sessionDate: "2026-08-16T08:00:00.123Z",
				sessionId: "session-1",
				skills: ["design"],
				slashCommands: [],
				source: "codex",
				totalTokens: 1_200,
				userId: "owner-1",
			},
			subagents: [
				{
					estimatedCost: 0.2,
					hasTranscript: true,
					inputTokens: 400,
					model: "claude-fable-5",
					outputTokens: 100,
					subagentId: "agent-1",
					totalTokens: 500,
				},
			],
			turnPage: { items: [], nextCursor: null, total: 0 },
		});
		const viewModel = buildSessionDetailOverviewViewModel(overview, {
			"owner-1": "Owner",
		});

		render(
			<SessionOverviewSummaryStrip
				context={overview.context}
				viewModel={viewModel}
			/>,
		);

		const sessionContext = screen.getByRole("region", {
			name: "Session context",
		});
		expect(sessionContext).toHaveAttribute(
			"data-session-context-layout",
			"horizontal",
		);
		expect(
			sessionContext.querySelectorAll("[data-session-context-group]"),
		).toHaveLength(5);
		expect(
			sessionContext.querySelectorAll(
				'[data-session-context-overflow="stack"]',
			),
		).toHaveLength(3);
		expect(
			sessionContext.querySelectorAll('[data-session-context-overflow="wrap"]'),
		).toHaveLength(2);
		expect(screen.queryByTitle("Repo: rudel/rudel")).toBeNull();
		expect(screen.queryByTitle("Branch: feature/context-strip")).toBeNull();
		expect(screen.queryByTitle("Commit: abcdef1234567890")).toBeNull();
		expect(screen.queryByTitle("Session: session-1")).toBeNull();
		const readItems = within(screen.getByRole("list", { name: "Read items" }));
		const typeScriptFiles = readItems.getByRole("button", {
			name: "2 .ts files",
		});
		expect(within(typeScriptFiles).getByText(".ts files")).toBeTruthy();
		expect(within(typeScriptFiles).getByText("2x")).toBeTruthy();
		expect(readItems.getByRole("button", { name: "1 .md file" })).toBeTruthy();
		expect(screen.queryByText("read.ts")).toBeNull();
		fireEvent.mouseEnter(typeScriptFiles);
		const fileList = screen.getByRole("region", { name: "Read .ts files" });
		const readFileName = screen.getByText("read.ts");
		expect(readFileName).toHaveClass("max-w-72", "truncate");
		expect(screen.getByText("other.ts")).toBeTruthy();
		expect(within(fileList).getByRole("list")).toHaveClass(
			"overflow-x-hidden",
			"overflow-y-auto",
		);
		expect(fileList.closest('[data-slot="popover-content"]')).toHaveClass(
			"w-max",
		);
		expect(
			screen.queryByRole("button", {
				name: "Show details for /repo/src/read.ts",
			}),
		).toBeNull();
		expect(
			screen.queryByRole("region", { name: "Details for read.ts" }),
		).toBeNull();
		expect(screen.getByTitle("Skill: design")).toBeTruthy();
		expect(screen.getByText("Exec Command ×2")).toBeTruthy();
		expect(screen.queryByText("Cost")).toBeNull();
		expect(screen.queryByText("Turns")).toBeNull();
	});
});
