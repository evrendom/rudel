import { useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	type TeamPageMemberRow,
	useTeamPageData,
} from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { useWrappedCardData } from "@/features/wrapped/use-card-data";
import { readWrappedGuestPreviewSnapshot } from "@/features/wrapped/wrapped-guest-preview";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import {
	WRAPPED_ARCHETYPE_CARD_THEMES,
	type WrappedArchetypeCardTheme,
} from "./archetypes";
import type { WrappedTeamMemberCardStatItem } from "./card";
import { buildWrappedOnboardingMetrics } from "./onboarding-metrics";
import { buildResolvedTeamCardRow } from "./row";
import { buildWrappedStatItems } from "./stat-items";

const DEFAULT_LIVE_ARCHETYPE: WrappedArchetypeCardTheme =
	WRAPPED_ARCHETYPE_CARD_THEMES[0];

interface UseWrappedTeamCardPageDataResult {
	completionUserId: string | null;
	liveArchetype: WrappedArchetypeCardTheme;
	onboardingMetrics: WrappedOnboardingMetrics;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	visibleTeamCardRow: TeamPageMemberRow;
}

// This hook is the current truth-assembly seam for the wrapped page.
//
// Product intentionally reads from two data contracts here:
// - the wrapped summary endpoint for the safest all-time recap facts
// - the existing developer analytics endpoints for richer recent-window detail
//   from the current 365-day analytics range
//
// We keep that wiring explicit instead of hiding it behind a clever abstraction
// so engineers can see exactly why some beats are launch-safe and others are
// still marked "needs_truth_cleanup" or "needs_codex_feature_parity" in
// onboarding/config.ts.
export function useWrappedTeamCardPageData(): UseWrappedTeamCardPageDataResult {
	const { accountLabel, handover, session, wrappedData } = useWrappedCardData();
	const { teamMemberRows } = useTeamPageData();
	const sessionUserId = getSessionUserId(session);
	const sessionUserName = getSessionUserName(session);
	const sessionUserEmail = getSessionUserEmail(session);
	const guestPreviewSnapshot = useMemo(
		() => readWrappedGuestPreviewSnapshot(),
		[],
	);
	const debugProfileImageSrc =
		guestPreviewSnapshot?.profile.imageUrl ??
		handover.preview.profile.avatarSrc;
	const { data: activeMember } = authClient.useActiveMember();
	const activeMemberUserId = getActiveMemberUserId(activeMember);
	const resolvedUserId = sessionUserId ?? activeMemberUserId;
	const completionUserId = resolvedUserId ?? null;
	// These recent-window developer queries power the richer story beats. They
	// are intentionally left separate for now because the Saturday ship still
	// needs clear visibility into which beat is reading which source.
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
				wrappedMetrics: wrappedData?.metrics,
			}),
		[
			accountLabel,
			debugProfileImageSrc,
			developerDetailsQuery.data,
			sessionUserEmail,
			resolvedUserId,
			sessionUserName,
			teamMemberRows,
			wrappedData?.metrics,
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
	const liveArchetype = useMemo(
		() => resolveLiveArchetype(wrappedData?.archetype?.key),
		[wrappedData?.archetype?.key],
	);

	return {
		completionUserId,
		liveArchetype,
		onboardingMetrics,
		statItems,
		visibleTeamCardRow,
	};
}

function resolveLiveArchetype(
	classifierKey: string | undefined,
): WrappedArchetypeCardTheme {
	if (!classifierKey) {
		return DEFAULT_LIVE_ARCHETYPE;
	}
	const matched = WRAPPED_ARCHETYPE_CARD_THEMES.find(
		(theme) =>
			theme.kind === "taxonomy" && theme.classifierKey === classifierKey,
	);
	return matched ?? DEFAULT_LIVE_ARCHETYPE;
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
