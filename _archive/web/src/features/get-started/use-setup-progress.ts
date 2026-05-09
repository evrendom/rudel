import { useUploadAnalyticsRefresh } from "@/features/analytics/queries/use-upload-analytics-refresh";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { orpc } from "@/lib/orpc";

const SETUP_PROGRESS_LOOKBACK_DAYS = 365;
const SETUP_PROGRESS_REFETCH_INTERVAL_MS = 3_000;

interface UseSetupProgressOptions {
	enabled?: boolean;
	keepPollingAfterUpload?: boolean;
	userId?: string | null;
}

export function useSetupProgress({
	enabled = true,
	keepPollingAfterUpload = false,
	userId = null,
}: UseSetupProgressOptions = {}) {
	const { state } = useOrganization();
	const shouldUseOrganizationSummary = !userId;
	const { rawSessionCount, rawSessionCountQuery } = useUploadAnalyticsRefresh({
		enabled,
		keepPollingAfterUpload,
		userId,
	});

	const summaryQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.summary.queryOptions({
			input: { days: SETUP_PROGRESS_LOOKBACK_DAYS },
		}),
		refetchIntervalInBackground: true,
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
		enabled: enabled && shouldUseOrganizationSummary,
		refetchInterval: (query) => {
			const totalSessions = query.state.data?.total_sessions ?? 0;
			if (
				!enabled ||
				!shouldUseOrganizationSummary ||
				(totalSessions > 0 && !keepPollingAfterUpload)
			) {
				return false;
			}

			return SETUP_PROGRESS_REFETCH_INTERVAL_MS;
		},
	});

	const totalSessionCount = Math.max(
		shouldUseOrganizationSummary ? (summaryQuery.data?.total_sessions ?? 0) : 0,
		rawSessionCount,
	);
	const hasFetchedSetupProgress =
		rawSessionCountQuery.isFetched &&
		(!shouldUseOrganizationSummary || summaryQuery.isFetched);
	const hasPendingSetupProgress =
		rawSessionCountQuery.isPending ||
		(shouldUseOrganizationSummary && summaryQuery.isPending);
	const isInitialLoading =
		enabled &&
		!hasFetchedSetupProgress &&
		(state.isLoading || hasPendingSetupProgress);

	return {
		hasUploadedSessions: totalSessionCount > 0,
		isLoading: isInitialLoading,
		totalSessionCount,
	};
}
