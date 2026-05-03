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
	resolveWrappedArchetypeCardThemeByClassifierKey,
	type WrappedArchetypeCardTheme,
} from "./archetypes";
import type { WrappedTeamMemberCardStatItem } from "./card";
import { buildWrappedOnboardingMetrics } from "./onboarding-metrics";
import { buildResolvedTeamCardRow } from "./row";
import { buildWrappedStatItems } from "./stat-items";

interface UseWrappedTeamCardPageDataResult {
	completionUserId: string | null;
	liveArchetype: WrappedArchetypeCardTheme | null;
	onboardingMetrics: WrappedOnboardingMetrics;
	publicUsername: string | undefined;
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
	const sessionUserImage = getSessionUserImage(session);
	const guestPreviewSnapshot = useMemo(
		() => readWrappedGuestPreviewSnapshot(),
		[],
	);
	const guestPreviewDisplayName = guestPreviewSnapshot?.profile.displayName;
	const guestPreviewImageUrl = guestPreviewSnapshot?.profile.imageUrl;
	const guestPreviewUsername = guestPreviewSnapshot?.profile.username;
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
				developerDetails: developerDetailsQuery.data,
				guestPreviewDisplayName,
				guestPreviewImageUrl,
				profileImageFallbackSrc: handover.preview.profile.avatarSrc,
				sessionUserEmail,
				sessionUserId: resolvedUserId,
				sessionUserImage,
				sessionUserName,
				teamMemberRows,
				wrappedMetrics: wrappedData?.metrics,
			}),
		[
			accountLabel,
			developerDetailsQuery.data,
			guestPreviewDisplayName,
			guestPreviewImageUrl,
			handover.preview.profile.avatarSrc,
			sessionUserEmail,
			resolvedUserId,
			sessionUserImage,
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
				onboardingMetrics.distinctProjectCount,
				onboardingMetrics.sourceSplit,
			),
		[
			onboardingMetrics.distinctProjectCount,
			onboardingMetrics.sourceSplit,
			visibleTeamCardRow,
		],
	);
	const liveArchetype = useMemo(
		() => resolveLiveArchetype(wrappedData?.archetype?.key),
		[wrappedData?.archetype?.key],
	);
	const publicUsername = useMemo(
		() =>
			resolveWrappedPublicUsername({
				fallbackDisplayName: visibleTeamCardRow.displayName,
				guestPreviewUsername,
				sessionUserEmail,
				sessionUserName,
			}),
		[
			guestPreviewUsername,
			sessionUserEmail,
			sessionUserName,
			visibleTeamCardRow.displayName,
		],
	);

	return {
		completionUserId,
		liveArchetype,
		onboardingMetrics,
		publicUsername,
		statItems,
		visibleTeamCardRow,
	};
}

function resolveLiveArchetype(
	classifierKey: string | undefined,
): WrappedArchetypeCardTheme | null {
	if (!classifierKey) {
		return null;
	}

	return resolveWrappedArchetypeCardThemeByClassifierKey(classifierKey) ?? null;
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

function getSessionUserImage(
	session: ReturnType<typeof useWrappedCardData>["session"],
) {
	return session?.user &&
		"image" in session.user &&
		typeof session.user.image === "string" &&
		session.user.image.trim().length > 0
		? session.user.image.trim()
		: undefined;
}

function getEmailHandle(email: string | undefined) {
	if (!email) {
		return undefined;
	}

	const [emailHandle] = email.split("@");
	return emailHandle?.trim() || undefined;
}

function resolveWrappedPublicUsername(input: {
	fallbackDisplayName: string;
	guestPreviewUsername: string | undefined;
	sessionUserEmail: string | undefined;
	sessionUserName: string | undefined;
}) {
	const guestPreviewUsername = input.guestPreviewUsername?.trim();

	if (guestPreviewUsername && isWrappedPublicUsername(guestPreviewUsername)) {
		return guestPreviewUsername;
	}

	const candidates = [
		getEmailHandle(input.sessionUserEmail),
		input.sessionUserName,
		input.fallbackDisplayName,
	];

	for (const candidate of candidates) {
		const username = normalizeWrappedPublicUsernameCandidate(candidate);

		if (username) {
			return username;
		}
	}

	return undefined;
}

function normalizeWrappedPublicUsernameCandidate(value: string | undefined) {
	const username = value
		?.trim()
		.replace(/^@+/u, "")
		.replace(/[^A-Za-z0-9_-]+/gu, "-")
		.replace(/-+/gu, "-")
		.replace(/^-|-$/gu, "")
		.slice(0, 64)
		.replace(/-$/u, "");

	return username && isWrappedPublicUsername(username) ? username : undefined;
}

function isWrappedPublicUsername(value: string) {
	return /^[A-Za-z0-9_-]{1,64}$/u.test(value);
}
