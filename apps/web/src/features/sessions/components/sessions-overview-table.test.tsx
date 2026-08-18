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
	it("reveals the frozen-column edge when the table scrolls horizontally", () => {
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

		const scrollContainer = document.querySelector<HTMLDivElement>(
			'[data-slot="sessions-overview-scroll-container"]',
		);
		assert(scrollContainer);
		const frozenEdges = document.querySelectorAll(
			'[data-slot="sessions-overview-frozen-edge-shadow"]',
		);
		expect(frozenEdges).toHaveLength(1);
		const frozenEdge = frozenEdges.item(0);
		assert(frozenEdge);
		expect(frozenEdge).toHaveAttribute("data-visible", "false");

		Object.defineProperty(scrollContainer, "scrollLeft", {
			configurable: true,
			value: 120,
			writable: true,
		});
		fireEvent.scroll(scrollContainer);

		expect(frozenEdge).toHaveAttribute("data-visible", "true");

		scrollContainer.scrollLeft = 0;
		fireEvent.scroll(scrollContainer);

		expect(frozenEdge).toHaveAttribute("data-visible", "false");
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
			"Tokens",
			"Cost",
			"Subagents Used",
			"Tool/API Errors",
			"Duration",
			"Skills Used",
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
				name: "Sort by Skills Used, ascending",
			}),
		).toBeInTheDocument();
		const subagentsSortButton = screen.getByRole("button", {
			name: "Sort by Subagents Used, ascending",
		});
		const skillsCell = within(sessionsList).getByTitle(
			"testing-bun, typescript-standards, ui",
		);
		expect(within(skillsCell).getByText("testing-bun")).toBeVisible();
		expect(within(skillsCell).getByText("typescript-standards")).toBeVisible();
		expect(within(skillsCell).getByText("+1")).toBeVisible();
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
			screen.getByRole("button", { name: "Configure Skills Used filter" }),
		);
		await user.click(screen.getByRole("checkbox", { name: "ui" }));

		let sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		expect(within(sessionsList).getByText("openai/codex")).toBeVisible();
		expect(
			within(sessionsList).queryByText("obsessiondb/rudel"),
		).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Clear Skills Used filter" }),
		);
		await user.click(
			screen.getByRole("button", { name: "Back to all filters" }),
		);
		await user.click(
			screen.getByRole("button", {
				name: "Configure Tool/API Errors filter",
			}),
		);
		fireEvent.change(
			screen.getByRole("spinbutton", {
				name: "Minimum Tool/API Errors",
			}),
			{ target: { value: "1" } },
		);

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
