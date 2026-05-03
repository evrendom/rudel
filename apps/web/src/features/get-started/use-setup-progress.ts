import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { client, orpc } from "@/lib/orpc";

const SETUP_PROGRESS_LOOKBACK_DAYS = 365;
const SETUP_PROGRESS_REFETCH_INTERVAL_MS = 3_000;
const SETUP_PROGRESS_LANDING_REFETCH_INTERVAL_MS = 1_000;

interface UseSetupProgressOptions {
	enabled?: boolean;
	keepPollingAfterUpload?: boolean;
}

export function useSetupProgress({
	enabled = true,
	keepPollingAfterUpload = false,
}: UseSetupProgressOptions = {}) {
	const { state } = useOrganization();
	const activeOrganizationId = state.activeOrg?.id;
	const queryClient = useQueryClient();
	const previousTotalSessionCountRef = useRef<number | null>(null);

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
	const rawSessionCountQuery = useQuery({
		queryKey: ["setup-progress", "raw-session-count", activeOrganizationId],
		queryFn: async () => {
			if (!activeOrganizationId) {
				return { count: 0 };
			}

			return client.getOrganizationSessionCount({
				organizationId: activeOrganizationId,
			});
		},
		enabled: enabled && !!activeOrganizationId,
		refetchInterval: (query) => {
			const totalSessions = query.state.data?.count ?? 0;
			if (!enabled || (totalSessions > 0 && !keepPollingAfterUpload)) {
				return false;
			}

			return SETUP_PROGRESS_LANDING_REFETCH_INTERVAL_MS;
		},
		refetchIntervalInBackground: true,
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
	});

	const totalSessionCount = Math.max(
		summaryQuery.data?.total_sessions ?? 0,
		rawSessionCountQuery.data?.count ?? 0,
	);
	const isInitialLoading =
		enabled &&
		!summaryQuery.isFetched &&
		!rawSessionCountQuery.isFetched &&
		(state.isLoading ||
			summaryQuery.isPending ||
			rawSessionCountQuery.isPending);

	useEffect(() => {
		if (!enabled || !activeOrganizationId) {
			previousTotalSessionCountRef.current = null;
			return;
		}

		const previousTotalSessionCount = previousTotalSessionCountRef.current;
		previousTotalSessionCountRef.current = totalSessionCount;

		if (
			previousTotalSessionCount === null ||
			totalSessionCount <= previousTotalSessionCount
		) {
			return;
		}

		const analyticsQueryKey = [
			"org",
			activeOrganizationId,
			"analytics",
		] as const;
		queryClient.removeQueries({
			queryKey: analyticsQueryKey,
			type: "inactive",
		});
		void queryClient.resetQueries({
			queryKey: analyticsQueryKey,
			type: "active",
		});
	}, [activeOrganizationId, enabled, queryClient, totalSessionCount]);

	return {
		hasUploadedSessions: totalSessionCount > 0,
		isLoading: isInitialLoading,
		totalSessionCount,
	};
}
