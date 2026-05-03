import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPage } from "@/features/team/TeamPage";

const { mockUseTeamPageData, mockUseUploadAnalyticsRefresh } = vi.hoisted(
	() => ({
		mockUseTeamPageData: vi.fn(),
		mockUseUploadAnalyticsRefresh: vi.fn(),
	}),
);

vi.mock("@/features/analytics/queries/use-upload-analytics-refresh", () => ({
	useUploadAnalyticsRefresh: mockUseUploadAnalyticsRefresh,
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
		mockUseTeamPageData.mockReset();
		mockUseUploadAnalyticsRefresh.mockReset();
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
			refetch: vi.fn(),
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

	it("keeps team cards fresh when new uploads arrive", () => {
		render(<TeamPage />);

		expect(screen.getByText("Team card grid: 1")).toBeInTheDocument();
		expect(mockUseUploadAnalyticsRefresh).toHaveBeenCalledWith({
			keepPollingAfterUpload: true,
		});
	});
});
