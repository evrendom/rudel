import type { SessionAnalytics } from "@rudel/api-routes";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SessionsOverviewTable } from "./sessions-overview-table";

vi.stubGlobal("PointerEvent", MouseEvent);

vi.mock("@/features/dashboard/components/DashboardDateControls", () => ({
	DashboardDateControls: () => <button type="button">Date range</button>,
}));

vi.mock("@/features/workspace/hooks/useUserMap", () => ({
	useUserMap: () => ({
		avatarMap: {},
		isLoading: false,
		userMap: { "user-1": "Evren", "user-2": "Ada" },
	}),
}));

const session: SessionAnalytics = {
	avg_period_sec: 45,
	duration_min: 12,
	error_count: 3,
	has_commit: true,
	input_tokens: 6_000,
	model_used: "claude-sonnet-4",
	output_tokens: 4_000,
	project_path: "/Users/evren/rudel",
	repository: "obsessiondb/rudel",
	worktree: "podgorica",
	session_date: "2026-05-04T10:00:00.000Z",
	session_id: "session-1",
	skills: ["testing-bun", "typescript-standards", "ui"],
	slash_commands: [],
	subagent_types: [],
	subagent_count: 2,
	success_score: 80,
	total_interactions: 7,
	total_tokens: 10_000,
	used_plan_mode: false,
	user_id: "user-1",
};

const otherSession: SessionAnalytics = {
	...session,
	error_count: 0,
	model_used: "gpt-5",
	repository: "openai/codex",
	session_id: "session-2",
	skills: [],
	subagent_count: 0,
	user_id: "user-2",
	worktree: null,
};

describe("SessionsOverviewTable", () => {
	it("filters rows by model and clears the active filter", async () => {
		const user = userEvent.setup();

		render(
			<SessionsOverviewTable
				activeSessionId={null}
				canOpenSession={() => true}
				getSessionHref={undefined}
				getSessionLinkState={undefined}
				isLoading={false}
				onSessionClick={vi.fn()}
				scrollContainerRef={undefined}
				sessionCountLabel={2}
				sessions={[session, otherSession]}
				sessionDetailDisabledNote={undefined}
				totalSessionCount={2}
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Filter by Repository" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Filter by Member" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Filter by Model" }));
		await user.click(screen.getByRole("checkbox", { name: "gpt-5" }));

		const sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		expect(
			screen.getByRole("button", {
				name: "Sort by Skills Used, ascending",
			}),
		).toBeInTheDocument();
		const subagentsSortButton = screen.getByRole("button", {
			name: "Sort by Subagents Used, ascending",
		});
		expect(
			within(sessionsList).getByTitle("testing-bun, typescript-standards, ui"),
		).toHaveTextContent("testing-bun, typescript-standards+1");
		expect(
			within(sessionsList).getByTitle("2 subagents used"),
		).toHaveTextContent("2");
		expect(within(sessionsList).getByText("obsessiondb/rudel")).toBeVisible();
		expect(
			within(sessionsList).queryByText("openai/codex"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Filter by Model, 1 of 2 selected",
			}),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Clear filters" }));

		expect(within(sessionsList).getByText("openai/codex")).toBeVisible();

		await user.click(subagentsSortButton);
		await user.click(subagentsSortButton);
		const sortedRows = within(sessionsList).getAllByRole("listitem");
		expect(within(sortedRows[0]).getByText("openai/codex")).toBeVisible();
	});

	it("shows worktree suffixes and filters individual worktrees", async () => {
		const user = userEvent.setup();
		const lansingSession = {
			...session,
			project_path: "/Users/x/conductor/workspaces/obsessiondb/rudel/lansing",
			session_id: "session-lansing",
			worktree: "lansing",
		};

		render(
			<SessionsOverviewTable
				activeSessionId={null}
				canOpenSession={() => true}
				getSessionHref={undefined}
				getSessionLinkState={undefined}
				isLoading={false}
				onSessionClick={vi.fn()}
				scrollContainerRef={undefined}
				sessionCountLabel={2}
				sessions={[session, lansingSession]}
				sessionDetailDisabledNote={undefined}
				totalSessionCount={2}
			/>,
		);

		const sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		expect(within(sessionsList).getByText(/podgorica/)).toBeVisible();
		expect(within(sessionsList).getByText(/lansing/)).toBeVisible();

		await user.click(
			screen.getByRole("button", { name: "Filter by Repository" }),
		);
		await user.click(screen.getByRole("checkbox", { name: "podgorica" }));

		expect(
			within(sessionsList).queryByText(/podgorica/),
		).not.toBeInTheDocument();
		expect(within(sessionsList).getByText(/lansing/)).toBeVisible();
		expect(
			screen.getByRole("button", {
				name: "Filter by Repository, 1 of 1 selected, 1 worktree excluded",
			}),
		).toBeInTheDocument();
	});
});
