import type { SessionAnalytics } from "@rudel/api-routes";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardTokenRecentSessionsTable } from "./DashboardTokenRecentSessionsTable";

vi.mock("@/features/workspace/hooks/useUserMap", () => ({
	useUserMap: () => ({
		userMap: { "user-1": "Evren" },
		isLoading: false,
	}),
}));

const session: SessionAnalytics = {
	session_id: "session-1",
	user_id: "user-1",
	session_date: "2026-05-04T10:00:00.000Z",
	project_path: "/Users/evren/rudel",
	repository: "obsessiondb/rudel",
	worktree: null,
	duration_min: 12,
	error_count: 0,
	total_tokens: 10_000,
	input_tokens: 6_000,
	output_tokens: 4_000,
	success_score: 80,
	total_interactions: 7,
	avg_period_sec: 45,
	subagent_types: [],
	skills: [],
	slash_commands: [],
	has_commit: true,
	model_used: "gpt-5",
	subagent_count: 0,
	used_plan_mode: false,
};

const otherSession: SessionAnalytics = {
	...session,
	session_id: "session-2",
};

describe("DashboardTokenRecentSessionsTable", () => {
	it("shows the demo-disabled note and does not open disabled rows", () => {
		const handleSessionClick = vi.fn();

		render(
			<DashboardTokenRecentSessionsTable
				canOpenSession={() => false}
				onSessionClick={handleSessionClick}
				sessions={[session]}
				sessionDetailDisabledNote="Session detail disabled for demo."
				totalSessionCount={1}
			/>,
		);

		expect(
			screen.getByText("Session detail disabled for demo."),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { pressed: false }),
		).not.toBeInTheDocument();

		fireEvent.click(screen.getByText("obsessiondb/rudel"));

		expect(handleSessionClick).not.toHaveBeenCalled();
	});

	it("keeps the open session row visibly selected", () => {
		render(
			<DashboardTokenRecentSessionsTable
				activeSessionId={session.session_id}
				canOpenSession={() => true}
				onSessionClick={vi.fn()}
				sessions={[session, otherSession]}
				totalSessionCount={2}
			/>,
		);

		const activeRow = screen.getByRole("button", { pressed: true });
		const inactiveRow = screen.getByRole("button", { pressed: false });

		expect(activeRow).toHaveClass(
			"bg-[color:var(--dashboardy-subsurface-strong)]",
		);
		expect(inactiveRow).toHaveClass("opacity-40");
		expect(inactiveRow).toHaveClass(
			"bg-[color:var(--dashboardy-surface)]",
			"odd:bg-[color:var(--dashboardy-surface)]",
		);
	});
});
