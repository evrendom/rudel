import {
	QueryClient,
	type QueryClientConfig,
	QueryClientProvider,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/features/auth/auth-route-utils";
import { WrappedRouteGate } from "@/features/wrapped/WrappedRouteGate";
import { getWrappedSetupCompletionStorageKey } from "@/features/wrapped/wrapped-setup-state";

const {
	mockGetOrganizationSessionCount,
	mockUseAnalyticsTracking,
	mockUseCliSetupStatus,
	mockUseIsMobile,
	mockUseOrganization,
} = vi.hoisted(() => ({
	mockGetOrganizationSessionCount: vi.fn(),
	mockUseAnalyticsTracking: vi.fn(),
	mockUseCliSetupStatus: vi.fn(),
	mockUseIsMobile: vi.fn(),
	mockUseOrganization: vi.fn(),
}));

vi.mock("@/app/hooks/use-mobile", () => ({
	useIsMobile: mockUseIsMobile,
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: mockUseAnalyticsTracking,
}));

vi.mock("@/features/get-started/use-cli-setup-status", () => ({
	useCliSetupStatus: mockUseCliSetupStatus,
}));

vi.mock("@/features/workspace/organization/useOrganization", () => ({
	useOrganization: mockUseOrganization,
}));

let rawSessionCount = 45;

vi.mock("@/lib/orpc", () => ({
	client: {
		getOrganizationSessionCount: mockGetOrganizationSessionCount,
		wrappedDecimalClaim: {
			redeem: vi.fn(),
		},
	},
	orpc: {
		wrappedDecimalClaim: {
			getMine: {
				queryOptions: () => ({
					queryFn: async () => ({ entitled: false }),
					queryKey: ["wrappedDecimalClaim", "getMine"],
				}),
			},
		},
		analytics: {
			developers: {
				projects: {
					queryOptions: () => ({
						queryFn: async () => [
							{
								first_session: "2026-04-22T10:00:00Z",
								git_remote: "github.com/acme/geneva.git",
								last_session: "2026-04-22T10:00:00Z",
								package_name: "",
								project_path: "/Users/ada/geneva",
								sessions: 45,
								total_duration_min: 90,
								total_tokens: 1200,
							},
						],
						queryKey: ["analytics", "developers", "projects"],
					}),
				},
			},
			sessions: {
				summary: {
					queryOptions: () => ({
						queryFn: async () => ({
							total_sessions: rawSessionCount,
						}),
						queryKey: ["analytics", "sessions", "summary"],
					}),
				},
			},
			wrapped: {
				v1: {
					queryOptions: () => ({
						queryFn: async () => ({
							archetype_gate: {
								is_eligible: false,
								reason: "session_threshold",
								thresholds: {
									min_total_sessions: 100,
								},
								values: {
									total_sessions: rawSessionCount,
								},
							},
						}),
						queryKey: ["analytics", "wrapped", "v1"],
					}),
				},
			},
		},
	},
}));

const queryClientConfig: QueryClientConfig = {
	defaultOptions: {
		queries: {
			gcTime: Infinity,
			retry: false,
			staleTime: 0,
		},
	},
};

const now = new Date("2026-04-22T10:00:00.000Z");

const session: NonNullable<AppSession> = {
	session: {
		id: "session-1",
		token: "token-1",
		userId: "user-1",
		createdAt: now,
		updatedAt: now,
		expiresAt: now,
	},
	user: {
		id: "user-1",
		email: "ada@example.com",
		name: "Ada Lovelace",
		emailVerified: true,
		image: "https://rudel.ai/uploads/ada.png",
		createdAt: now,
		updatedAt: now,
	},
};

function createWrapper(queryClient: QueryClient, initialEntry = "/wrapped") {
	return function WrappedPollingSmokeWrapper(props: { children: ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={[initialEntry]}>
					{props.children}
				</MemoryRouter>
			</QueryClientProvider>
		);
	};
}

describe("Wrapped upload polling smoke", () => {
	beforeEach(() => {
		rawSessionCount = 45;
		mockGetOrganizationSessionCount.mockReset();
		mockUseAnalyticsTracking.mockReset();
		mockUseCliSetupStatus.mockReset();
		mockUseIsMobile.mockReset();
		mockUseOrganization.mockReset();
		window.localStorage.clear();
		window.sessionStorage.clear();

		mockGetOrganizationSessionCount.mockImplementation(async () => ({
			count: rawSessionCount,
		}));
		mockUseAnalyticsTracking.mockReturnValue({
			trackWrappedActivationCompleted: vi.fn(),
			trackWrappedOnboardingStarted: vi.fn(),
			trackWrappedProfileCompleted: vi.fn(),
			trackWrappedReferredSignupCompleted: vi.fn(),
		});
		mockUseCliSetupStatus.mockReturnValue({
			hasCliLogin: true,
			isLoading: false,
		});
		mockUseIsMobile.mockReturnValue(false);
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

	afterEach(() => {
		vi.useRealTimers();
	});

	function markSetupCompleted() {
		const storageKey = getWrappedSetupCompletionStorageKey(session.user.id);

		if (storageKey === null) {
			throw new Error("Expected wrapped setup completion storage key");
		}

		window.localStorage.setItem(storageKey, "true");
	}

	it("updates the missing session count on the next poll after a second upload", async () => {
		const queryClient = new QueryClient(queryClientConfig);

		render(
			<WrappedRouteGate isPending={false} publicId={null} session={session} />,
			{
				wrapper: createWrapper(queryClient),
			},
		);

		expect(
			await screen.findByRole("heading", { name: "55 sessions missing" }),
		).toBeInTheDocument();
		expect(screen.getByText("45 sessions across 1 repo")).toBeInTheDocument();

		rawSessionCount = 63;

		await waitFor(
			() => {
				expect(
					screen.getByRole("heading", { name: "37 sessions missing" }),
				).toBeInTheDocument();
			},
			{ timeout: 1_500 },
		);
		expect(screen.getByText("63 sessions across 1 repo")).toBeInTheDocument();
		expect(mockGetOrganizationSessionCount).toHaveBeenCalledTimes(2);

		queryClient.clear();
	});

	it("keeps polling after reloading the repos screen from a completed setup", async () => {
		const queryClient = new QueryClient(queryClientConfig);
		markSetupCompleted();

		render(
			<WrappedRouteGate isPending={false} publicId={null} session={session} />,
			{
				wrapper: createWrapper(queryClient, "/wrapped?flow=sessions-landed"),
			},
		);

		expect(
			await screen.findByRole("heading", { name: "55 sessions missing" }),
		).toBeInTheDocument();
		expect(screen.getByText("45 sessions across 1 repo")).toBeInTheDocument();

		rawSessionCount = 63;

		await waitFor(
			() => {
				expect(
					screen.getByRole("heading", { name: "37 sessions missing" }),
				).toBeInTheDocument();
			},
			{ timeout: 1_500 },
		);
		expect(screen.getByText("63 sessions across 1 repo")).toBeInTheDocument();
		expect(mockGetOrganizationSessionCount).toHaveBeenCalledTimes(2);

		queryClient.clear();
	});
});
