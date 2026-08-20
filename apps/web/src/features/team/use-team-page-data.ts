import type {
	DeveloperSummary,
	DeveloperTeamCard,
	DimensionAnalysisDataPoint,
	UserDailyTrendData,
} from "@rudel/api-routes";
import { format } from "date-fns";
import { useMemo } from "react";
import {
	announceFrontendFixturesEnabled,
	buildTeamAnalyticsFixtures,
	type FrontendFixtureMember,
	isFrontendFixturesEnabled,
} from "@/dev/frontend-fixtures";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import type { TeamRosterMemberSource } from "@/features/team/data/team-roster-data";
import {
	type FullOrganization,
	useFullOrganization,
} from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import {
	expandAnalyticsDateRange,
	MAX_ANALYTICS_DAYS,
	normalizeAnalyticsDateRange,
} from "@/lib/analytics-date-range";
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

export interface TeamPageMemberArchetype {
	key: string;
	name: string;
}

export interface TeamPageMemberRow {
	userId: string;
	displayName: string;
	email: string | null;
	role: string;
	imageUrl?: string | null;
	archetype?: TeamPageMemberArchetype | null;
	cost: number | null;
	favoriteModel: string | null;
	inputTokens: number;
	outputTokens: number;
	totalSessions: number;
	activeDays: number;
	totalTokens: number;
	lastActiveDate: string | null;
	hasActivity: boolean;
}

export interface TeamPageMemberOverviewRow extends TeamPageMemberRow {
	activityTrend: readonly number[];
	modelUsage: readonly TeamPageMemberModelUsage[];
}

export interface TeamPageMemberModelUsage {
	model: string;
	usageCount: number;
}

function getSessionUserId(
	session: ReturnType<typeof authClient.useSession>["data"],
) {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
		: null;
}

function getActiveMemberUserId(
	activeMember: ReturnType<typeof authClient.useActiveMember>["data"],
) {
	return activeMember &&
		"userId" in activeMember &&
		typeof activeMember.userId === "string"
		? activeMember.userId
		: null;
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
	userDailyTrend: readonly UserDailyTrendData[] | undefined,
	modelUsage: readonly DimensionAnalysisDataPoint[] | undefined,
	startDate: string,
	endDate: string,
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
	const observedActivityDates = Array.from(
		new Set((userDailyTrend ?? []).map((row) => row.date)),
	).sort((leftDate, rightDate) => leftDate.localeCompare(rightDate));
	const normalizedActivityRange = normalizeAnalyticsDateRange(
		startDate,
		endDate,
	);
	const expandedActivityDates = normalizedActivityRange
		? expandAnalyticsDateRange(
				normalizedActivityRange.start,
				normalizedActivityRange.end,
			).map((date) => format(date, "yyyy-MM-dd"))
		: [];
	const activityDates =
		expandedActivityDates.length > 0
			? expandedActivityDates
			: observedActivityDates;
	const dailyRowsByUserId = new Map<string, UserDailyTrendData[]>();
	for (const dailyRow of userDailyTrend ?? []) {
		const existingRows = dailyRowsByUserId.get(dailyRow.user_id) ?? [];
		dailyRowsByUserId.set(dailyRow.user_id, [...existingRows, dailyRow]);
	}
	const modelUsageByUserId = new Map(
		(modelUsage ?? []).map(
			(row) => [row.dimension_value, row.split_values ?? {}] as const,
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
			const cost =
				developerSummary !== undefined
					? developerSummary.cost
					: teamCard !== undefined
						? teamCard.cost
						: 0;
			const lastActiveDate =
				developerSummary?.last_active_date ??
				teamCard?.last_active_date ??
				null;
			const favoriteModel =
				teamCard?.favorite_model ?? developerSummary?.favorite_model ?? null;
			const dailyRows = dailyRowsByUserId.get(userId) ?? [];
			const sessionsByDate = new Map(
				dailyRows.map(
					(dailyRow) => [dailyRow.date, dailyRow.sessions] as const,
				),
			);
			const fallbackModelUsage = new Map<string, number>();
			for (const dailyRow of dailyRows) {
				for (const model of new Set(dailyRow.models_used)) {
					if (model.trim().length === 0) {
						continue;
					}

					fallbackModelUsage.set(
						model,
						(fallbackModelUsage.get(model) ?? 0) + 1,
					);
				}
			}
			const measuredModelUsage = Object.entries(
				modelUsageByUserId.get(userId) ?? {},
			).filter(
				([model, usageCount]) =>
					model.trim().length > 0 && model !== "unknown" && usageCount > 0,
			);
			const resolvedModelUsage =
				measuredModelUsage.length > 0
					? measuredModelUsage
					: Array.from(fallbackModelUsage.entries());
			if (
				resolvedModelUsage.length === 0 &&
				favoriteModel &&
				favoriteModel !== "unknown"
			) {
				resolvedModelUsage.push([favoriteModel, 0]);
			}
			const modelUsage = resolvedModelUsage
				.sort(
					([leftModel, leftUsage], [rightModel, rightUsage]) =>
						rightUsage - leftUsage || leftModel.localeCompare(rightModel),
				)
				.map(([model, usageCount]) => ({ model, usageCount }));

			return {
				userId,
				displayName,
				email: member?.email ?? null,
				role: member?.role
					? formatMemberRole(member.role)
					: "Tracked collaborator",
				imageUrl: member?.imageUrl,
				archetype: teamCard?.archetype ?? null,
				cost,
				favoriteModel,
				inputTokens,
				outputTokens,
				totalSessions,
				activeDays,
				totalTokens,
				lastActiveDate,
				hasActivity: totalSessions > 0 || activeDays > 0 || totalTokens > 0,
				activityTrend: activityDates.map(
					(date) => sessionsByDate.get(date) ?? 0,
				),
				modelUsage,
			} satisfies TeamPageMemberOverviewRow;
		})
		.sort(
			(leftRow, rightRow) =>
				Number(rightRow.hasActivity) - Number(leftRow.hasActivity) ||
				rightRow.totalTokens - leftRow.totalTokens ||
				rightRow.totalSessions - leftRow.totalSessions ||
				leftRow.displayName.localeCompare(rightRow.displayName),
		);
}

function buildTeamRosterMembers(
	members: FullOrganization["members"] | undefined,
) {
	return (members ?? []).map((member) => ({
		displayName: member.user.name,
		email: member.user.email,
		imageUrl: member.user.image,
		role: member.role,
		userId: member.userId,
	}));
}

export function useTeamPageData() {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const { data: activeMember } = authClient.useActiveMember();
	const { state: dateRangeState, meta: dateRangeMeta } = useDateRange();
	const { meta: workspaceMeta, state: workspaceState } = useOrganization();
	const useFixtures = isFrontendFixturesEnabled();
	announceFrontendFixturesEnabled("team");
	const selectedDays = dateRangeMeta.dayCount;
	const requestedDays = MAX_ANALYTICS_DAYS;
	const activeOrganizationId = workspaceState.activeOrg?.id ?? null;
	const currentUserId =
		getSessionUserId(session) ?? getActiveMemberUserId(activeMember);
	const canInviteTeamMembers =
		activeOrganizationId !== null && workspaceMeta?.isOrgAdmin === true;
	const {
		data: fullOrganization,
		isLoading: isOrganizationPending,
		isError: isOrganizationError,
		invalidate: invalidateFullOrganization,
	} = useFullOrganization(activeOrganizationId ?? undefined);
	const members = useMemo<readonly TeamRosterMemberSource[]>(
		() => buildTeamRosterMembers(fullOrganization?.members),
		[fullOrganization?.members],
	);
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
	const usersDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersDailyTrend.queryOptions({
			input: {
				startDate: dateRangeState.startDate,
				endDate: dateRangeState.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const modelUsageQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: requestedDays,
				dimension: "user_id",
				limit: 1000,
				metric: "session_count",
				splitBy: "model_used",
			},
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
		() =>
			useFixtures
				? buildTeamAnalyticsFixtures({
						endDate: dateRangeState.endDate,
						members: fixtureMembers,
						startDate: dateRangeState.startDate,
					})
				: null,
		[
			dateRangeState.endDate,
			dateRangeState.startDate,
			fixtureMembers,
			useFixtures,
		],
	);
	const teamCards = fixtureData?.teamCards ?? teamCardsQuery.data;
	const developerSummaries =
		fixtureData?.developerSummaries ?? developersQuery.data;
	const userDailyTrend =
		fixtureData?.usersDailyTrend ?? usersDailyTrendQuery.data;
	const modelUsage = useFixtures ? undefined : modelUsageQuery.data;
	const teamMemberRows = useMemo(
		() =>
			buildTeamMemberRows(
				members,
				teamCards,
				developerSummaries,
				userDailyTrend,
				modelUsage,
				dateRangeState.startDate,
				dateRangeState.endDate,
			),
		[
			dateRangeState.endDate,
			dateRangeState.startDate,
			members,
			teamCards,
			developerSummaries,
			modelUsage,
			userDailyTrend,
		],
	);
	const hasRosterData = teamMemberRows.length > 0;
	const isInitialTeamDataPending =
		!useFixtures &&
		(workspaceState.isLoading ||
			(activeOrganizationId !== null &&
				(teamCardsQuery.isPending ||
					developersQuery.isPending ||
					isOrganizationPending)) ||
			isSessionPending);
	const diagnostics: TeamPageDiagnostics = {
		endDate: dateRangeState.endDate,
		endpoint: "analytics.developers.teamCards",
		maxDays: MAX_ANALYTICS_DAYS,
		startDate: dateRangeState.startDate,
		organizationId: activeOrganizationId,
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
		isPending: isInitialTeamDataPending,
		teamMemberRows,
		canInviteTeamMembers,
		currentUserId,
		requestedDays,
		refetch: async () => {
			await Promise.all([
				teamCardsQuery.refetch(),
				developersQuery.refetch(),
				usersDailyTrendQuery.refetch(),
				modelUsageQuery.refetch(),
				activeOrganizationId ? invalidateFullOrganization() : null,
			]);
		},
		teamCards,
	};
}
