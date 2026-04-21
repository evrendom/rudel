import { useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	type TeamPageMemberRow,
	useTeamPageData,
} from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { useWrappedCardData } from "@/features/wrapped/use-card-data";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import type { WrappedTeamMemberCardStatItem } from "./card";
import { buildWrappedOnboardingMetrics } from "./onboarding-metrics";
import { buildResolvedTeamCardRow } from "./row";
import { buildWrappedStatItems } from "./stat-items";

interface UseWrappedTeamCardPageDataResult {
	completionUserId: string | null;
	onboardingMetrics: WrappedOnboardingMetrics;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	visibleTeamCardRow: TeamPageMemberRow;
}

export function useWrappedTeamCardPageData(): UseWrappedTeamCardPageDataResult {
	const { accountLabel, handover, session, wrappedData } = useWrappedCardData();
	const { teamMemberRows } = useTeamPageData();
	const sessionUserId = getSessionUserId(session);
	const sessionUserName = getSessionUserName(session);
	const sessionUserEmail = getSessionUserEmail(session);
	const debugProfileImageSrc = handover.preview.profile.avatarSrc;
	const { data: activeMember } = authClient.useActiveMember();
	const activeMemberUserId = getActiveMemberUserId(activeMember);
	const resolvedUserId = sessionUserId ?? activeMemberUserId;
	const completionUserId = resolvedUserId ?? null;
	const developerDetailsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.details.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const developerFeaturesQuery = useAnalyticsQuery({
		...orpc.analytics.developers.features.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const developerProjectsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.projects.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const developerSessionsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.sessions.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
				outcome: "all",
				limit: 1000,
				offset: 0,
				sortBy: "date",
				sortOrder: "desc",
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const commitBreakdownQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: MAX_ANALYTICS_DAYS,
				dimension: "has_commit",
				limit: 4,
				metric: "session_count",
				userId: resolvedUserId ?? undefined,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const visibleTeamCardRow = useMemo(
		() =>
			buildResolvedTeamCardRow({
				accountLabel,
				debugProfileImageSrc,
				developerDetails: developerDetailsQuery.data,
				sessionUserEmail,
				sessionUserId: resolvedUserId,
				sessionUserName,
				teamMemberRows,
			}),
		[
			accountLabel,
			debugProfileImageSrc,
			developerDetailsQuery.data,
			sessionUserEmail,
			resolvedUserId,
			sessionUserName,
			teamMemberRows,
		],
	);
	const onboardingMetrics = useMemo(
		() =>
			buildWrappedOnboardingMetrics({
				commitBreakdown: commitBreakdownQuery.data,
				developerDetails: developerDetailsQuery.data,
				developerFeatures: developerFeaturesQuery.data,
				developerProjects: developerProjectsQuery.data,
				developerSessions: developerSessionsQuery.data,
				wrappedMetrics: wrappedData?.metrics,
			}),
		[
			commitBreakdownQuery.data,
			developerDetailsQuery.data,
			developerFeaturesQuery.data,
			developerProjectsQuery.data,
			developerSessionsQuery.data,
			wrappedData?.metrics,
		],
	);
	const statItems = useMemo(
		() =>
			buildWrappedStatItems(
				visibleTeamCardRow,
				developerDetailsQuery.data?.distinct_projects ?? 0,
				wrappedData?.metrics.source_split ?? [],
			),
		[
			developerDetailsQuery.data?.distinct_projects,
			visibleTeamCardRow,
			wrappedData?.metrics.source_split,
		],
	);

	return {
		completionUserId,
		onboardingMetrics,
		statItems,
		visibleTeamCardRow,
	};
}

function getSessionUserId(
	session: ReturnType<typeof useWrappedCardData>["session"],
) {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
		: undefined;
}

function getActiveMemberUserId(
	activeMember: ReturnType<typeof authClient.useActiveMember>["data"],
) {
	return activeMember &&
		"userId" in activeMember &&
		typeof activeMember.userId === "string"
		? activeMember.userId
		: undefined;
}

function getSessionUserName(
	session: ReturnType<typeof useWrappedCardData>["session"],
) {
	return session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
		? session.user.name
		: undefined;
}

function getSessionUserEmail(
	session: ReturnType<typeof useWrappedCardData>["session"],
) {
	return session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
		? session.user.email
		: undefined;
}
