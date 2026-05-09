import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPage } from "@/features/team/TeamPage";

const {
	mockGetFullOrganization,
	mockUseActiveMember,
	mockUseDateRange,
	mockUseOrganization,
	mockUseSession,
} = vi.hoisted(() => ({
	mockGetFullOrganization: vi.fn(),
	mockUseActiveMember: vi.fn(),
	mockUseDateRange: vi.fn(),
	mockUseOrganization: vi.fn(),
	mockUseSession: vi.fn(),
}));

vi.mock("@/features/analytics/date-range/useDateRange", () => ({
	useDateRange: mockUseDateRange,
}));

vi.mock("@/features/workspace/organization/useOrganization", () => ({
	useOrganization: mockUseOrganization,
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		organization: {
			getFullOrganization: mockGetFullOrganization,
		},
		useActiveMember: mockUseActiveMember,
		useSession: mockUseSession,
	},
}));

let rawSessionCount = 12;

function buildDeveloperSummary() {
	return {
		active_days: 4,
		avg_session_duration_min: 12,
		cost: 18,
		favorite_model: "claude-sonnet-4-5",
		input_tokens: rawSessionCount * 100,
		last_active_date: "2026-04-22",
		output_tokens: rawSessionCount * 200,
		success_rate: 1,
		success_rate_trend: 0,
		total_duration_min: rawSessionCount * 12,
		total_sessions: rawSessionCount,
		total_tokens: rawSessionCount * 300,
		user_id: "user-1",
	};
}

function buildTeamCard() {
	return {
		active_days: 4,
		archetype: { key: "smooth_operator", name: "Smooth Operator" },
		cost: 18,
		display_name: "Ada Lovelace",
		favorite_model: "claude-sonnet-4-5",
		input_tokens: rawSessionCount * 100,
		last_active_date: "2026-04-22",
		output_tokens: rawSessionCount * 200,
		top_skills: [],
		total_sessions: rawSessionCount,
		total_tokens: rawSessionCount * 300,
		user_id: "user-1",
	};
}

vi.mock("@/lib/orpc", () => ({
	orpc: {
		analytics: {
			developers: {
				list: {
					queryOptions: () => ({
						queryFn: async () => [buildDeveloperSummary()],
						queryKey: ["analytics", "developers", "list"],
					}),
				},
				teamCards: {
					queryOptions: () => ({
						queryFn: async () => [buildTeamCard()],
						queryKey: ["analytics", "developers", "teamCards"],
					}),
				},
			},
		},
	},
}));

function createWrapper(queryClient: QueryClient) {
	return function TeamPageManualRefreshSmokeWrapper(props: {
		children: ReactNode;
	}) {
		return (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>{props.children}</MemoryRouter>
			</QueryClientProvider>
		);
	};
}

describe("TeamPage manual refresh smoke", () => {
	beforeEach(() => {
		rawSessionCount = 12;
		mockGetFullOrganization.mockReset();
		mockUseActiveMember.mockReset();
		mockUseDateRange.mockReset();
		mockUseOrganization.mockReset();
		mockUseSession.mockReset();

		mockGetFullOrganization.mockResolvedValue({
			data: {
				members: [
					{
						role: "owner",
						user: {
							email: "ada@example.com",
							image: null,
							name: "Ada Lovelace",
						},
						userId: "user-1",
					},
				],
			},
		});
		mockUseActiveMember.mockReturnValue({
			data: null,
		});
		mockUseSession.mockReturnValue({
			data: {
				user: {
					id: "user-1",
				},
			},
		});
		mockUseDateRange.mockReturnValue({
			actions: {
				setDateRange: vi.fn(),
				setEndDate: vi.fn(),
				setStartDate: vi.fn(),
			},
			meta: {
				dayCount: 365,
				source: "default",
			},
			state: {
				endDate: "2026-04-22",
				startDate: "2025-04-22",
			},
		});
		mockUseOrganization.mockReturnValue({
			state: {
				activeOrg: {
					id: "org-1",
					name: "Org",
					slug: "org",
				},
				isLoading: false,
				organizations: [],
			},
		});
	});

	it("updates the visible team card stats when the user refreshes after new uploads land", async () => {
		const user = userEvent.setup();
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: Infinity,
					retry: false,
					staleTime: 0,
				},
			},
		});

		render(<TeamPage />, {
			wrapper: createWrapper(queryClient),
		});

		expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
		expect(screen.getByTitle("12 sessions")).toBeInTheDocument();

		rawSessionCount = 63;
		expect(screen.getByTitle("12 sessions")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Refresh" }));

		await waitFor(() => {
			expect(screen.getByTitle("63 sessions")).toBeInTheDocument();
		});
		expect(screen.queryByTitle("12 sessions")).not.toBeInTheDocument();

		queryClient.clear();
	});
});
