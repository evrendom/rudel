import type { SessionAnalytics } from "@rudel/api-routes";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, describe, expect, it, vi } from "vitest";
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
	git_branch: "rudel/pr2-usage-events",
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
	total_tokens: 10_000,
	used_plan_mode: false,
	user_id: "user-1",
	member_swears: 2,
	member_apologies: 0,
	member_positive: 0,
	model_swears: 0,
	model_apologies: 0,
	model_positive: 1,
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
	it("uses the session-detail metric columns and keeps input and output distinct", () => {
		render(
			<SessionsOverviewTable
				activeSessionId={null}
				canOpenSession={() => true}
				getSessionHref={undefined}
				getSessionLinkState={undefined}
				isLoading={false}
				onSessionClick={vi.fn()}
				scrollContainerRef={undefined}
				sessionCountLabel={1}
				sessions={[session]}
				sessionDetailDisabledNote={undefined}
				totalSessionCount={1}
			/>,
		);

		for (const label of [
			"Repository",
			"Member",
			"Model",
			"Signals",
			"Length",
			"Input",
			"Output",
			"Cost",
			"Errors",
			"Skills",
			"Subagents",
		]) {
			expect(
				screen.getAllByRole("button", {
					name: `Sort by ${label}, ascending`,
				}).length,
			).toBeGreaterThan(0);
		}
		const header = document.querySelector<HTMLElement>(
			'[data-slot="sessions-overview-header"]',
		);
		assert(header);
		expect(
			within(header).queryByRole("button", {
				name: "Sort by Time, ascending",
			}),
		).not.toBeInTheDocument();

		const sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		const sessionDate = sessionsList.querySelector("time");
		assert(sessionDate);
		expect(sessionDate).toHaveTextContent("May 4");
		expect(sessionDate.getAttribute("title")).toMatch(
			/^May 4, \d{2}:\d{2} (AM|PM)$/,
		);
		const modelGlyph = sessionsList.querySelector(
			"[data-session-model-mark-glyph] svg",
		);
		assert(modelGlyph);
		expect(modelGlyph).toHaveClass("text-[#CC7D5E]");
		expect(within(sessionsList).getByText("you swore +1")).toBeVisible();
		expect(within(sessionsList).getByText("model praised")).toBeVisible();
		expect(within(sessionsList).getByText("12m")).toBeVisible();
		expect(within(sessionsList).getByText("pr2-usage-events")).toBeVisible();
		expect(
			within(sessionsList).queryByText("rudel/pr2-usage-events"),
		).not.toBeInTheDocument();
		expect(within(sessionsList).getByText("6K")).toBeVisible();
		expect(within(sessionsList).getByText("4K")).toBeVisible();
		expect(
			within(sessionsList).getByRole("progressbar", {
				name: "6,000 input tokens relative to the largest session",
			}),
		).toBeInTheDocument();
	});

	it("scrolls every column together without frozen cells", () => {
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

		const header = document.querySelector<HTMLElement>(
			'[data-slot="sessions-overview-header"]',
		);
		const firstRow = document.querySelector<HTMLElement>(
			'[data-dashboard-grid-row-scope="session"]',
		);
		assert(header);
		assert(firstRow);
		expect(header.children[0]).not.toHaveClass("sticky");
		expect(header.children[1]).not.toHaveClass("sticky");
		expect(firstRow.children[0]).not.toHaveClass("sticky");
		expect(firstRow.children[1]).not.toHaveClass("sticky");
		expect(
			document.querySelector(
				'[data-slot="sessions-overview-frozen-edge-shadow"]',
			),
		).not.toBeInTheDocument();
	});

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
			screen.queryByRole("button", { name: /Filter by/ }),
		).not.toBeInTheDocument();
		const filterButton = screen.getByRole("button", {
			name: "Filter sessions",
		});
		const controls = filterButton.closest(
			'[data-slot="sessions-overview-controls"]',
		);
		expect(controls).not.toBeNull();
		expect(
			controls?.querySelector(
				'[data-slot="sessions-overview-control-separator"]',
			),
		).not.toBeNull();
		expect(controls?.children).toHaveLength(3);

		await user.click(filterButton);
		for (const filterLabel of [
			"Repository",
			"Member",
			"Model",
			"Length",
			"Tokens",
			"Cost",
			"Errors",
			"Skills",
			"Subagents",
		]) {
			expect(
				screen.getByRole("button", {
					name: `Configure ${filterLabel} filter`,
				}),
			).toBeInTheDocument();
		}
		await user.click(
			screen.getByRole("button", { name: "Configure Model filter" }),
		);
		await user.click(screen.getByRole("checkbox", { name: "gpt-5" }));

		const sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		expect(
			screen.getByRole("button", {
				name: "Sort by Skills, ascending",
			}),
		).toBeInTheDocument();
		const subagentsSortButton = screen.getByRole("button", {
			name: "Sort by Subagents, ascending",
		});
		const skillsCell = within(sessionsList).getByTitle(
			"testing-bun, typescript-standards, ui",
		);
		expect(skillsCell).toHaveTextContent("3");
		expect(
			within(sessionsList).getByTitle("2 subagents used"),
		).toHaveTextContent("2");
		expect(within(sessionsList).getByText("obsessiondb/rudel")).toBeVisible();
		expect(
			within(sessionsList).queryByText("openai/codex"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Filter sessions, 1 active",
			}),
		).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Clear Model filter" }),
		);

		expect(within(sessionsList).getByText("openai/codex")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Filter sessions" }));

		await user.click(subagentsSortButton);
		await user.click(subagentsSortButton);
		const sortedRows = within(sessionsList).getAllByRole("listitem");
		expect(within(sortedRows[0]).getByText("openai/codex")).toBeVisible();
	});

	it("hides worktree names from rows and the repository filter", async () => {
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
		expect(within(sessionsList).getAllByText("obsessiondb/rudel")).toHaveLength(
			2,
		);
		expect(
			within(sessionsList).getAllByTitle("obsessiondb/rudel"),
		).toHaveLength(2);
		expect(
			within(sessionsList).queryByText(/podgorica/),
		).not.toBeInTheDocument();
		expect(within(sessionsList).queryByText(/lansing/)).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Filter sessions" }));
		await user.click(
			screen.getByRole("button", { name: "Configure Repository filter" }),
		);
		expect(
			screen.queryByRole("checkbox", { name: "podgorica" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("checkbox", { name: "lansing" }),
		).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("checkbox", { name: "obsessiondb/rudel" }),
		);
		expect(
			screen.getByText("No sessions match the selected filters."),
		).toBeVisible();
		expect(
			screen.queryByRole("list", { name: "Recent sessions" }),
		).not.toBeInTheDocument();
	});

	it("filters sessions by skill and a numeric min/max range", async () => {
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

		await user.click(screen.getByRole("button", { name: "Filter sessions" }));
		await user.click(
			screen.getByRole("button", { name: "Configure Skills filter" }),
		);
		await user.click(screen.getByRole("checkbox", { name: "ui" }));

		let sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		expect(within(sessionsList).getByText("openai/codex")).toBeVisible();
		expect(
			within(sessionsList).queryByText("obsessiondb/rudel"),
		).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Clear Skills filter" }),
		);
		await user.click(
			screen.getByRole("button", { name: "Back to all filters" }),
		);
		await user.click(
			screen.getByRole("button", {
				name: "Configure Errors filter",
			}),
		);
		const minimumErrors = screen.getByRole("slider", {
			name: "Minimum Errors",
		});
		const maximumErrors = screen.getByRole("slider", {
			name: "Maximum Errors",
		});
		expect(minimumErrors).toHaveClass("slider-range-input-native");
		expect(maximumErrors).toHaveClass("slider-range-input-native");
		fireEvent.change(minimumErrors, { target: { value: "1" } });

		sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		expect(within(sessionsList).getByText("obsessiondb/rudel")).toBeVisible();
		expect(
			within(sessionsList).queryByText("openai/codex"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Filter sessions, 1 active",
			}),
		).toBeInTheDocument();
	});
});
