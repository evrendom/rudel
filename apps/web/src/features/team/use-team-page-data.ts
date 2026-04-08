import type { DeveloperTeamCard } from "@rudel/api-routes";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	buildTeamRosterPlayers,
	type TeamRosterMemberSource,
} from "@/features/team/data/team-roster-data";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";

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

export interface TeamPageMemberRow {
	userId: string;
	displayName: string;
	email: string | null;
	role: string;
	imageUrl?: string | null;
	favoriteModel: string | null;
	topSkills: DeveloperTeamCard["top_skills"];
	totalSessions: number;
	activeDays: number;
	totalTokens: number;
	lastActiveDate: string | null;
	hasActivity: boolean;
}

function formatMemberRole(role: string | null | undefined) {
	if (!role) {
		return "Member";
	}

	return role
		.trim()
		.toLowerCase()
		.replaceAll(/[_-]+/g, " ")
		.replaceAll(/\b\w/g, (character) => character.toUpperCase());
}

function buildTeamMemberRows(
	members: readonly TeamRosterMemberSource[],
	teamCards: readonly DeveloperTeamCard[] | undefined,
) {
	const memberByUserId = new Map(
		members.map((member) => [member.userId, member] as const),
	);
	const analyticsByUserId = new Map(
		(teamCards ?? []).map((teamCard) => [teamCard.user_id, teamCard] as const),
	);
	const memberIds = new Set<string>([
		...memberByUserId.keys(),
		...analyticsByUserId.keys(),
	]);

	return Array.from(memberIds)
		.map((userId) => {
			const member = memberByUserId.get(userId);
			const teamCard = analyticsByUserId.get(userId);
			const displayName =
				member?.displayName.trim() ||
				teamCard?.display_name.trim() ||
				"Unknown teammate";
			const totalSessions = teamCard?.total_sessions ?? 0;
			const activeDays = teamCard?.active_days ?? 0;
			const totalTokens = teamCard?.total_tokens ?? 0;

			return {
				userId,
				displayName,
				email: member?.email ?? null,
				role: member?.role
					? formatMemberRole(member.role)
					: "Tracked collaborator",
				imageUrl: member?.imageUrl,
				favoriteModel: teamCard?.favorite_model ?? null,
				topSkills: teamCard?.top_skills ?? [],
				totalSessions,
				activeDays,
				totalTokens,
				lastActiveDate: teamCard?.last_active_date ?? null,
				hasActivity: totalSessions > 0 || activeDays > 0 || totalTokens > 0,
			} satisfies TeamPageMemberRow;
		})
		.sort(
			(leftRow, rightRow) =>
				Number(rightRow.hasActivity) - Number(leftRow.hasActivity) ||
				rightRow.totalTokens - leftRow.totalTokens ||
				rightRow.totalSessions - leftRow.totalSessions ||
				leftRow.displayName.localeCompare(rightRow.displayName),
		);
}

export function useTeamPageData() {
	const { state: dateRangeState, meta: dateRangeMeta } = useDateRange();
	const { state: workspaceState } = useOrganization();
	const selectedDays = dateRangeMeta.dayCount;
	const requestedDays = MAX_ANALYTICS_DAYS;
	const {
		data: members = [],
		isLoading: isOrganizationPending,
		isError: isOrganizationError,
		refetch: refetchMembers,
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
						role: string;
						user: {
							image: string | null;
							name: string;
							email: string;
						};
					}>;
				} | null) ?? null;

			return (fullOrganization?.members ?? []).map((member) => ({
				displayName: member.user.name,
				email: member.user.email,
				imageUrl: member.user.image,
				role: member.role,
				userId: member.userId,
			}));
		},
		enabled: Boolean(workspaceState.activeOrg?.id),
	});
	const teamCardsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.teamCards.queryOptions({
			input: { days: requestedDays },
		}),
	});
	const teamCards = teamCardsQuery.data;
	const teamPlayers = useMemo(
		() => buildTeamRosterPlayers(teamCards, members),
		[members, teamCards],
	);
	const teamMemberRows = useMemo(
		() => buildTeamMemberRows(members, teamCards),
		[members, teamCards],
	);
	const hasRosterData = teamMemberRows.length > 0 || teamPlayers.length > 0;
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
			(isOrganizationError
				? new Error("Failed to load workspace members.")
				: null),
		isError: !hasRosterData && (teamCardsQuery.isError || isOrganizationError),
		isPending:
			!hasRosterData && (teamCardsQuery.isPending || isOrganizationPending),
		teamMemberRows,
		teamPlayers,
		requestedDays,
		refetch: async () => {
			await Promise.all([teamCardsQuery.refetch(), refetchMembers()]);
		},
		teamCards,
	};
}
