import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { client, orpc } from "@/lib/orpc";

const SETUP_PROGRESS_LOOKBACK_DAYS = 365;
const SETUP_PROGRESS_REFETCH_INTERVAL_MS = 3_000;
const SETUP_PROGRESS_LANDING_REFETCH_INTERVAL_MS = 1_000;

interface UseSetupProgressOptions {
	enabled?: boolean;
	keepPollingAfterUploadForMs?: number;
}

export function useSetupProgress({
	enabled = true,
	keepPollingAfterUploadForMs,
}: UseSetupProgressOptions = {}) {
	const { state } = useOrganization();
	const activeOrganizationId = state.activeOrg?.id;
	const uploadPollingStartedAtRef = useRef<number | null>(null);

	useEffect(() => {
		if (!enabled || keepPollingAfterUploadForMs === undefined) {
			uploadPollingStartedAtRef.current = null;
		}
	}, [enabled, keepPollingAfterUploadForMs]);

	function shouldKeepPollingAfterUpload(totalSessions: number) {
		if (keepPollingAfterUploadForMs === undefined || totalSessions <= 0) {
			return false;
		}

		if (uploadPollingStartedAtRef.current === null) {
			uploadPollingStartedAtRef.current = Date.now();
		}

		return (
			Date.now() - uploadPollingStartedAtRef.current <
			keepPollingAfterUploadForMs
		);
	}

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
			if (
				!enabled ||
				(totalSessions > 0 && !shouldKeepPollingAfterUpload(totalSessions))
			) {
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
			if (
				!enabled ||
				(totalSessions > 0 && !shouldKeepPollingAfterUpload(totalSessions))
			) {
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

	return {
		hasUploadedSessions: totalSessionCount > 0,
		isLoading: isInitialLoading,
		totalSessionCount,
	};
}
