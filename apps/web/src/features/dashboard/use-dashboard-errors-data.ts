import { useMemo } from "react";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useFullOrganization } from "@/hooks/useFullOrganization";
import { orpc } from "@/lib/orpc";

type UseDashboardErrorsDataOptions = {
	enabled?: boolean;
};

export function useDashboardErrorsData(
	options: UseDashboardErrorsDataOptions = {},
) {
	const { activeOrg } = useOrganization();
	const { endDate, startDate } = useDateRange();
	const { data: fullOrganization } = useFullOrganization(activeOrg?.id);
	const isEnabled = options.enabled ?? true;

	const errorDashboardQuery = useAnalyticsQuery({
		...orpc.analytics.errors.dashboard.queryOptions({
			input: { endDate, startDate },
		}),
		enabled: isEnabled,
	});
	const errorProjectTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: { endDate, startDate, splitBy: "project_path" },
		}),
		enabled: isEnabled,
	});
	const errorDeveloperTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: { endDate, startDate, splitBy: "user_id" },
		}),
		enabled: isEnabled,
	});

	const userLabelById = useMemo(
		() =>
			new Map(
				(fullOrganization?.members ?? []).map((member) => [
					member.userId,
					member.user.name?.trim() ||
						member.user.email?.trim() ||
						member.userId,
				]),
			),
		[fullOrganization?.members],
	);

	return {
		endDate,
		errorDashboard: errorDashboardQuery.data,
		errorDeveloperTrend: errorDeveloperTrendQuery.data,
		errorProjectTrend: errorProjectTrendQuery.data,
		isPending:
			errorDashboardQuery.isPending ||
			errorProjectTrendQuery.isPending ||
			errorDeveloperTrendQuery.isPending,
		startDate,
		userLabelById,
	};
}
