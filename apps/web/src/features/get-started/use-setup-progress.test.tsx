import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";

const {
	mockGetOrganizationSessionCount,
	mockRemoveQueries,
	mockResetQueries,
	mockSummaryQueryOptions,
	mockUseAnalyticsQuery,
	mockUseOrganization,
	mockUseQuery,
} = vi.hoisted(() => ({
	mockGetOrganizationSessionCount: vi.fn(),
	mockRemoveQueries: vi.fn(),
	mockResetQueries: vi.fn(),
	mockSummaryQueryOptions: vi.fn(),
	mockUseAnalyticsQuery: vi.fn(),
	mockUseOrganization: vi.fn(),
	mockUseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: mockUseQuery,
	useQueryClient: () => ({
		removeQueries: mockRemoveQueries,
		resetQueries: mockResetQueries,
	}),
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

interface SummaryQueryData {
	total_sessions: number;
}

interface RawSessionCountData {
	count: number;
}

interface QueryResult<TData> {
	data: TData | undefined;
	isFetched: boolean;
	isPending: boolean;
}

interface RefetchQuery<TData> {
	state: {
		data: TData | undefined;
	};
}

interface SummaryQueryOptions {
	enabled?: boolean;
	refetchInterval?: (query: RefetchQuery<SummaryQueryData>) => false | number;
	refetchIntervalInBackground?: boolean;
	refetchOnReconnect?: boolean | "always";
	refetchOnWindowFocus?: boolean | "always";
}

interface RawQueryOptions {
	enabled?: boolean;
	queryFn?: () => Promise<RawSessionCountData>;
	queryKey?: readonly unknown[];
	refetchInterval?: (
		query: RefetchQuery<RawSessionCountData>,
	) => false | number;
	refetchIntervalInBackground?: boolean;
	refetchOnReconnect?: boolean | "always";
	refetchOnWindowFocus?: boolean | "always";
}

const defaultSummaryQueryResult: QueryResult<SummaryQueryData> = {
	data: {
		total_sessions: 0,
	},
	isFetched: true,
	isPending: false,
};

const defaultRawCountQueryResult: QueryResult<RawSessionCountData> = {
	data: {
		count: 0,
	},
	isFetched: true,
	isPending: false,
};

let capturedSummaryQueryOptions: SummaryQueryOptions | null = null;
let capturedRawQueryOptions: RawQueryOptions | null = null;
let summaryQueryResult: QueryResult<SummaryQueryData>;
let rawCountQueryResult: QueryResult<RawSessionCountData>;

function getCapturedSummaryQueryOptions() {
	if (capturedSummaryQueryOptions === null) {
		throw new Error("Expected summary query options to be captured");
	}

	return capturedSummaryQueryOptions;
}

function getCapturedRawQueryOptions() {
	if (capturedRawQueryOptions === null) {
		throw new Error("Expected raw session count query options to be captured");
	}

	return capturedRawQueryOptions;
}

describe("useSetupProgress", () => {
	beforeEach(() => {
		capturedSummaryQueryOptions = null;
		capturedRawQueryOptions = null;
		summaryQueryResult = defaultSummaryQueryResult;
		rawCountQueryResult = defaultRawCountQueryResult;

		mockGetOrganizationSessionCount.mockReset();
		mockRemoveQueries.mockReset();
		mockResetQueries.mockReset();
		mockSummaryQueryOptions.mockReset();
		mockUseAnalyticsQuery.mockReset();
		mockUseOrganization.mockReset();
		mockUseQuery.mockReset();

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
		mockUseAnalyticsQuery.mockImplementation((options: SummaryQueryOptions) => {
			capturedSummaryQueryOptions = options;
			return summaryQueryResult;
		});
		mockUseQuery.mockImplementation((options: RawQueryOptions) => {
			capturedRawQueryOptions = options;
			return rawCountQueryResult;
		});
		mockResetQueries.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("uses raw uploaded session count as the fastest landing signal", () => {
		rawCountQueryResult = {
			data: {
				count: 2,
			},
			isFetched: true,
			isPending: false,
		};

		const { result } = renderHook(() => useSetupProgress());

		expect(result.current.hasUploadedSessions).toBe(true);
		expect(result.current.totalSessionCount).toBe(2);
	});

	it("polls quickly and refetches when the setup page regains focus", () => {
		renderHook(() => useSetupProgress());

		const summaryOptions = getCapturedSummaryQueryOptions();
		const rawOptions = getCapturedRawQueryOptions();

		expect(summaryOptions.refetchOnWindowFocus).toBe("always");
		expect(summaryOptions.refetchOnReconnect).toBe("always");
		expect(summaryOptions.refetchIntervalInBackground).toBe(true);
		expect(rawOptions.refetchOnWindowFocus).toBe("always");
		expect(rawOptions.refetchOnReconnect).toBe("always");
		expect(rawOptions.refetchIntervalInBackground).toBe(true);
		expect(
			rawOptions.refetchInterval?.({
				state: {
					data: {
						count: 0,
					},
				},
			}),
		).toBe(1_000);
	});

	it("stops raw polling after sessions are detected", () => {
		renderHook(() => useSetupProgress());

		const rawOptions = getCapturedRawQueryOptions();

		expect(
			rawOptions.refetchInterval?.({
				state: {
					data: {
						count: 1,
					},
				},
			}),
		).toBe(false);
	});

	it("keeps raw polling after sessions are detected when requested", () => {
		renderHook(() =>
			useSetupProgress({
				keepPollingAfterUpload: true,
			}),
		);

		const rawOptions = getCapturedRawQueryOptions();

		expect(
			rawOptions.refetchInterval?.({
				state: {
					data: {
						count: 1,
					},
				},
			}),
		).toBe(1_000);
	});

	it("keeps raw polling after ten minutes when requested", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		renderHook(() =>
			useSetupProgress({
				keepPollingAfterUpload: true,
			}),
		);

		const rawOptions = getCapturedRawQueryOptions();
		const uploadedQuery = {
			state: {
				data: {
					count: 1,
				},
			},
		};

		expect(rawOptions.refetchInterval?.(uploadedQuery)).toBe(1_000);

		vi.setSystemTime(10 * 60 * 1000);

		expect(rawOptions.refetchInterval?.(uploadedQuery)).toBe(1_000);
	});

	it("refreshes cached analytics when the uploaded session count increases", async () => {
		rawCountQueryResult = {
			data: {
				count: 72,
			},
			isFetched: true,
			isPending: false,
		};

		const { rerender } = renderHook(() => useSetupProgress());

		expect(mockRemoveQueries).not.toHaveBeenCalled();
		expect(mockResetQueries).not.toHaveBeenCalled();

		rawCountQueryResult = {
			data: {
				count: 132,
			},
			isFetched: true,
			isPending: false,
		};
		rerender();

		await waitFor(() => {
			expect(mockRemoveQueries).toHaveBeenCalledWith({
				queryKey: ["org", "org-1", "analytics"],
				type: "inactive",
			});
		});
		expect(mockResetQueries).toHaveBeenCalledWith({
			queryKey: ["org", "org-1", "analytics"],
			type: "active",
		});
	});
});
