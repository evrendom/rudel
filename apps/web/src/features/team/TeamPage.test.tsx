import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPage } from "@/features/team/TeamPage";

const { mockRefetch, mockUseTeamPageData } = vi.hoisted(() => ({
	mockRefetch: vi.fn(),
	mockUseTeamPageData: vi.fn(),
}));

vi.mock("@/features/team/components/TeamMembersCardGrid", () => ({
	TeamMembersCardGrid: ({ rows }: { rows: readonly unknown[] }) => (
		<div>Team card grid: {rows.length}</div>
	),
}));

vi.mock("@/features/team/use-team-page-data", () => ({
	useTeamPageData: mockUseTeamPageData,
}));

describe("TeamPage", () => {
	beforeEach(() => {
		mockRefetch.mockReset();
		mockRefetch.mockResolvedValue(undefined);
		mockUseTeamPageData.mockReset();
		mockUseTeamPageData.mockReturnValue({
			diagnostics: {
				days: 365,
				endDate: "2026-04-22",
				endpoint: "analytics.developers.teamCards",
				maxDays: 365,
				organizationId: "org-1",
				organizationName: "Org",
				requestedDays: 365,
				startDate: "2025-04-22",
			},
			error: null,
			isError: false,
			isPending: false,
			refetch: mockRefetch,
			teamCards: [],
			teamMemberRows: [
				{
					activeDays: 4,
					cost: 12,
					displayName: "Ada",
					email: "ada@example.com",
					favoriteModel: "o3",
					hasActivity: true,
					imageUrl: null,
					inputTokens: 120,
					lastActiveDate: "2026-04-22",
					outputTokens: 240,
					role: "Member",
					totalSessions: 12,
					totalTokens: 360,
					userId: "user-1",
				},
			],
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("refreshes team cards when the user asks for fresh data", async () => {
		const user = userEvent.setup();

		render(<TeamPage />);

		expect(screen.getByText("Team card grid: 1")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Refresh" }));

		expect(mockRefetch).toHaveBeenCalledTimes(1);
	});

	it("hides raw error diagnostics in production", () => {
		vi.stubEnv("DEV", false);
		const error = new Error("ClickHouse at internal-db:8123 failed");
		Object.assign(error, {
			data: { requestId: "01f6142a-097f-4635-9fbf-f09d2fcbbff8" },
		});
		mockUseTeamPageData.mockReturnValue({
			diagnostics: {
				days: 365,
				endDate: "2026-04-22",
				endpoint: "analytics.developers.teamCards",
				maxDays: 365,
				organizationId: "secret-org-id",
				organizationName: "Secret workspace",
				requestedDays: 365,
				startDate: "2025-04-22",
			},
			error,
			isError: true,
			isPending: false,
			refetch: mockRefetch,
			teamCards: [],
			teamMemberRows: [],
		});

		render(<TeamPage />);

		expect(
			screen.getByText(
				"We couldn't load the team cards for this workspace. Try again, or contact support if the problem continues.",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByText("ClickHouse at internal-db:8123 failed"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("Raw error details")).not.toBeInTheDocument();
		expect(screen.queryByText("secret-org-id")).not.toBeInTheDocument();
		expect(
			screen.queryByText("analytics.developers.teamCards"),
		).not.toBeInTheDocument();
		expect(
			screen.getByText("01f6142a-097f-4635-9fbf-f09d2fcbbff8"),
		).toBeInTheDocument();
	});
});
