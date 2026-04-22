import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { orpc } from "@/lib/orpc";

const SETUP_PROGRESS_LOOKBACK_DAYS = 365;
const SETUP_PROGRESS_REFETCH_INTERVAL_MS = 3_000;

export function useSetupProgress({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) {
	const { state } = useOrganization();
	const summaryQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.summary.queryOptions({
			input: { days: SETUP_PROGRESS_LOOKBACK_DAYS },
		}),
		enabled,
		refetchInterval: (query) => {
			const totalSessions = query.state.data?.total_sessions ?? 0;
			if (!enabled || totalSessions > 0) {
				return false;
			}

			return SETUP_PROGRESS_REFETCH_INTERVAL_MS;
		},
	});

	const totalSessionCount = summaryQuery.data?.total_sessions ?? 0;
	const isInitialLoading =
		enabled &&
		!summaryQuery.isFetched &&
		(state.isLoading || summaryQuery.isPending);

	return {
		hasUploadedSessions: totalSessionCount > 0,
		isLoading: isInitialLoading,
		totalSessionCount,
	};
}
