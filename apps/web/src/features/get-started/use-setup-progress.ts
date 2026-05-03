import { useUploadAnalyticsRefresh } from "@/features/analytics/queries/use-upload-analytics-refresh";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { orpc } from "@/lib/orpc";

const SETUP_PROGRESS_LOOKBACK_DAYS = 365;
const SETUP_PROGRESS_REFETCH_INTERVAL_MS = 3_000;

interface UseSetupProgressOptions {
	enabled?: boolean;
	keepPollingAfterUpload?: boolean;
}

export function useSetupProgress({
	enabled = true,
	keepPollingAfterUpload = false,
}: UseSetupProgressOptions = {}) {
	const { state } = useOrganization();
	const { rawSessionCount, rawSessionCountQuery } = useUploadAnalyticsRefresh({
		enabled,
		keepPollingAfterUpload,
	});

	const summaryQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.summary.queryOptions({
			input: { days: SETUP_PROGRESS_LOOKBACK_DAYS },
		}),
		refetchIntervalInBackground: true,
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
		enabled,
		refetchInterval: (query) => {
			const totalSessions = query.state.data?.total_sessions ?? 0;
			if (!enabled || (totalSessions > 0 && !keepPollingAfterUpload)) {
				return false;
			}

			return SETUP_PROGRESS_REFETCH_INTERVAL_MS;
		},
	});

	const totalSessionCount = Math.max(
		summaryQuery.data?.total_sessions ?? 0,
		rawSessionCount,
	);
	const isInitialLoading =
		enabled &&
		!summaryQuery.isFetched &&
		!rawSessionCountQuery.isFetched &&
		(state.isLoading ||
			summaryQuery.isPending ||
			rawSessionCountQuery.isPending);

	return {
		hasUploadedSessions: totalSessionCount > 0,
		isLoading: isInitialLoading,
		totalSessionCount,
	};
}
