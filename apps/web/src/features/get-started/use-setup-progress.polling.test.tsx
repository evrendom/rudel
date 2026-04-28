import {
	QueryClient,
	type QueryClientConfig,
	QueryClientProvider,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";

const {
	mockGetOrganizationSessionCount,
	mockSummaryQueryOptions,
	mockUseAnalyticsQuery,
	mockUseOrganization,
} = vi.hoisted(() => ({
	mockGetOrganizationSessionCount: vi.fn(),
	mockSummaryQueryOptions: vi.fn(),
	mockUseAnalyticsQuery: vi.fn(),
	mockUseOrganization: vi.fn(),
}));

vi.mock("@/features/analytics/queries/useAnalyticsQuery", () => ({
	useAnalyticsQuery: mockUseAnalyticsQuery,
}));

vi.mock("@/features/workspace/organization/useOrganization", () => ({
	useOrganization: mockUseOrganization,
}));

vi.mock("@/lib/orpc", () => ({
	client: {
		getOrganizationSessionCount: mockGetOrganizationSessionCount,
	},
	orpc: {
		analytics: {
			sessions: {
				summary: {
					queryOptions: mockSummaryQueryOptions,
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

function createWrapper(queryClient: QueryClient) {
	return function TestQueryClientProvider(props: { children: ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>
				{props.children}
			</QueryClientProvider>
		);
	};
}

describe("useSetupProgress polling", () => {
	beforeEach(() => {
		mockGetOrganizationSessionCount.mockReset();
		mockSummaryQueryOptions.mockReset();
		mockUseAnalyticsQuery.mockReset();
		mockUseOrganization.mockReset();

		mockSummaryQueryOptions.mockReturnValue({
			queryKey: ["analytics", "sessions", "summary"],
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
		mockUseAnalyticsQuery.mockReturnValue({
			data: {
				total_sessions: 0,
			},
			isFetched: true,
			isPending: false,
		});
	});

	it("detects uploaded sessions on the next one-second raw-count poll", async () => {
		const queryClient = new QueryClient(queryClientConfig);
		mockGetOrganizationSessionCount
			.mockResolvedValueOnce({ count: 0 })
			.mockResolvedValueOnce({ count: 0 })
			.mockResolvedValueOnce({ count: 1 });

		const { result } = renderHook(() => useSetupProgress(), {
			wrapper: createWrapper(queryClient),
		});

		await waitFor(() => {
			expect(mockGetOrganizationSessionCount).toHaveBeenCalledTimes(1);
		});
		expect(result.current.hasUploadedSessions).toBe(false);
		expect(result.current.totalSessionCount).toBe(0);

		await waitFor(
			() => {
				expect(mockGetOrganizationSessionCount).toHaveBeenCalledTimes(2);
			},
			{ timeout: 1_500 },
		);
		expect(result.current.hasUploadedSessions).toBe(false);
		expect(result.current.totalSessionCount).toBe(0);

		await waitFor(
			() => {
				expect(result.current.hasUploadedSessions).toBe(true);
			},
			{ timeout: 1_500 },
		);
		expect(mockGetOrganizationSessionCount).toHaveBeenCalledTimes(3);
		expect(result.current.totalSessionCount).toBe(1);

		queryClient.clear();
	});
});
