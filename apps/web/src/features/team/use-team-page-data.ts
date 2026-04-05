import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	MAX_ANALYTICS_DAYS,
} from "@/lib/analytics-date-range";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	buildTeamRosterPlayers,
	type TeamRosterMemberSource,
} from "@/features/team/data/team-roster-data";
import { useOrganization } from "@/features/workspace/organization/useOrganization";

export interface TeamPageDiagnostics {
	endDate: string;
	endpoint: string;
	maxDays: number;
	startDate: string;
	organizationId: string | null;
	organizationName: string | null;
	days: number;
	requestedDays: number;
}

export function useTeamPageData() {
	const { state: dateRangeState, meta: dateRangeMeta } = useDateRange();
	const { state: workspaceState } = useOrganization();
	const selectedDays = dateRangeMeta.dayCount;
	const requestedDays = Math.min(selectedDays, MAX_ANALYTICS_DAYS);
	const {
		data: members = [],
		isLoading: isOrganizationPending,
		isError: isOrganizationError,
	} = useQuery<readonly TeamRosterMemberSource[]>({
		queryKey: ["team-page-members", workspaceState.activeOrg?.id],
		queryFn: async () => {
			const response = await authClient.organization.getFullOrganization({
				query: { organizationId: workspaceState.activeOrg?.id ?? "" },
			});
			const fullOrganization =
				(response.data as {
					members?: Array<{
						userId: string;
						user: {
							image: string | null;
							name: string;
						};
					}>;
				} | null) ?? null;

			return (fullOrganization?.members ?? []).map((member) => ({
				displayName: member.user.name,
				imageUrl: member.user.image,
				userId: member.userId,
			}));
		},
		enabled: Boolean(workspaceState.activeOrg?.id),
	});
	const teamCardsQuery = useAnalyticsQuery(
		{
			...orpc.analytics.developers.teamCards.queryOptions({
				input: { days: requestedDays },
			}),
		},
	);
	const teamCards = teamCardsQuery.data;
	const teamPlayers = useMemo(
		() => buildTeamRosterPlayers(teamCards, members),
		[members, teamCards],
	);
	const hasRosterData = teamPlayers.length > 0;
	const diagnostics: TeamPageDiagnostics = {
		endDate: dateRangeState.endDate,
		endpoint: "analytics.developers.teamCards",
		maxDays: MAX_ANALYTICS_DAYS,
		startDate: dateRangeState.startDate,
		organizationId: workspaceState.activeOrg?.id ?? null,
		organizationName: workspaceState.activeOrg?.name ?? null,
		days: selectedDays,
		requestedDays,
	};

	return {
		diagnostics,
		error:
			teamCardsQuery.error ??
			(isOrganizationError ? new Error("Failed to load workspace members.") : null),
		isError: !hasRosterData && (teamCardsQuery.isError || isOrganizationError),
		isPending: !hasRosterData && (teamCardsQuery.isPending || isOrganizationPending),
		teamPlayers,
		requestedDays,
		refetch: teamCardsQuery.refetch,
		teamCards,
	};
}
