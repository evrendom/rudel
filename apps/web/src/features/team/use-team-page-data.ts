import type { DeveloperTeamCard } from "@rudel/api-routes";
import { useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useFullOrganization } from "@/hooks/useFullOrganization";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
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

interface TeamRosterMemberSource {
	userId: string;
	displayName: string;
	email?: string | null;
	imageUrl?: string | null;
	role?: string | null;
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
			const inputTokens = teamCard?.input_tokens ?? 0;
			const outputTokens = teamCard?.output_tokens ?? 0;
			const totalTokens = teamCard?.total_tokens ?? 0;
			const cost = teamCard?.cost ?? 0;
			const lastActiveDate = teamCard?.last_active_date ?? null;

			return {
				userId,
				displayName,
				email: member?.email ?? null,
				role: member?.role
					? formatMemberRole(member.role)
					: "Tracked collaborator",
				imageUrl: member?.imageUrl,
				cost,
				favoriteModel: teamCard?.favorite_model ?? null,
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
	const { meta: dateRangeMeta, state: dateRangeState } = useDateRange();
	const { activeOrg } = useOrganization();
	const {
		data: fullOrganization,
		invalidate: invalidateFullOrganization,
		isLoading: isOrganizationPending,
	} = useFullOrganization(activeOrg?.id);
	const hasActiveOrganization = Boolean(activeOrg?.id);
	const selectedDays = dateRangeMeta.dayCount;
	const requestedDays = MAX_ANALYTICS_DAYS;
	const members = useMemo(
		() =>
			(fullOrganization?.members ?? []).map((member) => ({
				displayName: member.user.name,
				email: member.user.email,
				imageUrl: member.user.image,
				role: member.role,
				userId: member.userId,
			})) satisfies readonly TeamRosterMemberSource[],
		[fullOrganization?.members],
	);
	const teamCardsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.teamCards.queryOptions({
			input: { days: requestedDays },
		}),
	});
	const teamCards = teamCardsQuery.data;
	const teamMemberRows = useMemo(
		() => buildTeamMemberRows(members, teamCards),
		[members, teamCards],
	);
	const hasRosterData = teamMemberRows.length > 0;
	const diagnostics: TeamPageDiagnostics = {
		endDate: dateRangeState.endDate,
		endpoint: "analytics.developers.teamCards",
		maxDays: MAX_ANALYTICS_DAYS,
		startDate: dateRangeState.startDate,
		organizationId: activeOrg?.id ?? null,
		organizationName: activeOrg?.name ?? null,
		days: selectedDays,
		requestedDays,
	};

	return {
		diagnostics,
		error: teamCardsQuery.error,
		hasActiveOrganization,
		isError: hasActiveOrganization && !hasRosterData && teamCardsQuery.isError,
		isPending:
			hasActiveOrganization &&
			!hasRosterData &&
			(teamCardsQuery.isPending || isOrganizationPending),
		teamMemberRows,
		requestedDays,
		refetch: async () => {
			await Promise.all([
				teamCardsQuery.refetch(),
				invalidateFullOrganization(),
			]);
		},
		teamCards,
	};
}
