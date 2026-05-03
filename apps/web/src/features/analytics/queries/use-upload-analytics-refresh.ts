import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { client } from "@/lib/orpc";

const UPLOAD_ANALYTICS_REFRESH_INTERVAL_MS = 1_000;

interface UseUploadAnalyticsRefreshOptions {
	enabled?: boolean;
	keepPollingAfterUpload?: boolean;
}

export function useUploadAnalyticsRefresh({
	enabled = true,
	keepPollingAfterUpload = false,
}: UseUploadAnalyticsRefreshOptions = {}) {
	const { state } = useOrganization();
	const activeOrganizationId = state.activeOrg?.id;
	const queryClient = useQueryClient();
	const previousRawSessionCountRef = useRef<number | null>(null);
	const rawSessionCountQuery = useQuery({
		queryKey: [
			"upload-analytics-refresh",
			"raw-session-count",
			activeOrganizationId,
		],
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
			const rawSessionCount = query.state.data?.count ?? 0;
			if (!enabled || (rawSessionCount > 0 && !keepPollingAfterUpload)) {
				return false;
			}

			return UPLOAD_ANALYTICS_REFRESH_INTERVAL_MS;
		},
		refetchIntervalInBackground: true,
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
	});
	const rawSessionCount = rawSessionCountQuery.data?.count ?? 0;

	useEffect(() => {
		if (!enabled || !activeOrganizationId) {
			previousRawSessionCountRef.current = null;
			return;
		}

		const previousRawSessionCount = previousRawSessionCountRef.current;
		previousRawSessionCountRef.current = rawSessionCount;

		if (
			previousRawSessionCount === null ||
			rawSessionCount <= previousRawSessionCount
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
	}, [activeOrganizationId, enabled, queryClient, rawSessionCount]);

	return {
		rawSessionCount,
		rawSessionCountQuery,
	};
}
