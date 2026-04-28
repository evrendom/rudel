import type { DeveloperSummary, DeveloperTeamCard } from "@rudel/api-routes";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	announceFrontendFixturesEnabled,
	buildTeamAnalyticsFixtures,
	type FrontendFixtureMember,
	isFrontendFixturesEnabled,
} from "@/dev/frontend-fixtures";
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
	cost: number;
	favoriteModel: string | null;
	inputTokens: number;
	outputTokens: number;
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
	developerSummaries: readonly DeveloperSummary[] | undefined,
) {
	const memberByUserId = new Map(
		members.map((member) => [member.userId, member] as const),
	);
	const analyticsByUserId = new Map(
		(teamCards ?? []).map((teamCard) => [teamCard.user_id, teamCard] as const),
	);
	const summaryByUserId = new Map(
		(developerSummaries ?? []).map(
			(summary) => [summary.user_id, summary] as const,
		),
	);
	const memberIds = new Set<string>([
		...memberByUserId.keys(),
		...analyticsByUserId.keys(),
		...summaryByUserId.keys(),
	]);

	return Array.from(memberIds)
		.map((userId) => {
			const member = memberByUserId.get(userId);
			const teamCard = analyticsByUserId.get(userId);
			const developerSummary = summaryByUserId.get(userId);
			const displayName =
				member?.displayName.trim() ||
				teamCard?.display_name.trim() ||
				"Unknown teammate";
			const totalSessions =
				developerSummary?.total_sessions ?? teamCard?.total_sessions ?? 0;
			const activeDays =
				developerSummary?.active_days ?? teamCard?.active_days ?? 0;
			const inputTokens =
				developerSummary?.input_tokens ?? teamCard?.input_tokens ?? 0;
			const outputTokens =
				developerSummary?.output_tokens ?? teamCard?.output_tokens ?? 0;
			const totalTokens =
				developerSummary?.total_tokens ?? teamCard?.total_tokens ?? 0;
			const cost = developerSummary?.cost ?? teamCard?.cost ?? 0;
			const lastActiveDate =
				developerSummary?.last_active_date ??
				teamCard?.last_active_date ??
				null;

			return {
				userId,
				displayName,
				email: member?.email ?? null,
				role: member?.role
					? formatMemberRole(member.role)
					: "Tracked collaborator",
				imageUrl: member?.imageUrl,
				cost,
				favoriteModel:
					teamCard?.favorite_model ?? developerSummary?.favorite_model ?? null,
				inputTokens,
				outputTokens,
				totalSessions,
				activeDays,
				totalTokens,
				lastActiveDate,
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
	const useFixtures = isFrontendFixturesEnabled();
	announceFrontendFixturesEnabled("team");
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
		enabled: !useFixtures,
	});
	const developersQuery = useAnalyticsQuery({
		...orpc.analytics.developers.list.queryOptions({
			input: { days: requestedDays },
		}),
		enabled: !useFixtures,
	});
	const fixtureMembers = useMemo<FrontendFixtureMember[]>(
		() =>
			members.map((member) => ({
				displayName: member.displayName,
				email: member.email ?? null,
				imageUrl: member.imageUrl ?? null,
				userId: member.userId,
			})),
		[members],
	);
	const fixtureData = useMemo(
		() => (useFixtures ? buildTeamAnalyticsFixtures(fixtureMembers) : null),
		[fixtureMembers, useFixtures],
	);
	const teamCards = fixtureData?.teamCards ?? teamCardsQuery.data;
	const developerSummaries =
		fixtureData?.developerSummaries ?? developersQuery.data;
	const teamPlayers = useMemo(
		() => buildTeamRosterPlayers(teamCards, members),
		[members, teamCards],
	);
	const teamMemberRows = useMemo(
		() => buildTeamMemberRows(members, teamCards, developerSummaries),
		[members, teamCards, developerSummaries],
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
		error: useFixtures
			? null
			: (teamCardsQuery.error ??
				developersQuery.error ??
				(isOrganizationError
					? new Error("Failed to load workspace members.")
					: null)),
		isError:
			!useFixtures &&
			!hasRosterData &&
			(teamCardsQuery.isError ||
				developersQuery.isError ||
				isOrganizationError),
		isPending:
			!useFixtures &&
			!hasRosterData &&
			(teamCardsQuery.isPending ||
				developersQuery.isPending ||
				isOrganizationPending),
		teamMemberRows,
		teamPlayers,
		requestedDays,
		refetch: async () => {
			await Promise.all([
				teamCardsQuery.refetch(),
				developersQuery.refetch(),
				refetchMembers(),
			]);
		},
		teamCards,
	};
}
