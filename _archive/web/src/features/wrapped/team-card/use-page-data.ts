import type { PublicWrappedShare } from "@rudel/api-routes";
import { useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	type TeamPageMemberRow,
	useTeamPageData,
} from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { useWrappedCardData } from "@/features/wrapped/use-card-data";
import { useWrappedPublicPage } from "@/features/wrapped/use-wrapped-public-page";
import { readWrappedGuestPreviewSnapshot } from "@/features/wrapped/wrapped-guest-preview";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import {
	resolveWrappedArchetypeCardThemeByClassifierKey,
	WRAPPED_ARCHETYPE_CARD_THEMES,
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
	statItems: readonly WrappedTeamMemberCardStatItem[];
	visibleTeamCardRow: TeamPageMemberRow;
}

interface UseWrappedTeamCardPageDataParams {
	devPreviewPublicId?: string;
	devPreviewUserEmail?: string;
	devPreviewUserId?: string;
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
export function useWrappedTeamCardPageData(
	params: UseWrappedTeamCardPageDataParams = {},
): UseWrappedTeamCardPageDataResult {
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
	const { data: activeMember } = authClient.useActiveMember();
	const activeMemberUserId = getActiveMemberUserId(activeMember);
	const resolvedUserId = sessionUserId ?? activeMemberUserId;
	const devPreviewPublicId = import.meta.env.DEV
		? normalizeIdentifier(params.devPreviewPublicId)
		: undefined;
	const devPreviewUserEmail = import.meta.env.DEV
		? normalizeEmail(params.devPreviewUserEmail)
		: undefined;
	const devPreviewUserId = import.meta.env.DEV
		? normalizeIdentifier(params.devPreviewUserId)
		: undefined;
	const devPreviewTargetUserId = devPreviewUserId ?? devPreviewPublicId;
	const devPreviewPublicShareQuery = useWrappedPublicPage(
		devPreviewPublicId ?? null,
	);
	const devPreviewPublicRow = useMemo(
		() =>
			buildDevPreviewPublicTeamRow({
				publicId: devPreviewPublicId,
				share: devPreviewPublicShareQuery.data,
			}),
		[devPreviewPublicId, devPreviewPublicShareQuery.data],
	);
	const effectiveTeamMemberRows = useMemo(
		() =>
			devPreviewPublicRow
				? [devPreviewPublicRow, ...teamMemberRows]
				: teamMemberRows,
		[devPreviewPublicRow, teamMemberRows],
	);
	const devPreviewUserRow = useMemo(
		() =>
			findTeamMemberRowByDevPreviewTarget({
				email: devPreviewUserEmail,
				teamMemberRows: effectiveTeamMemberRows,
				userId: devPreviewTargetUserId,
			}),
		[devPreviewTargetUserId, devPreviewUserEmail, effectiveTeamMemberRows],
	);
	const hasDevPreviewTarget = Boolean(
		devPreviewPublicId || devPreviewUserEmail || devPreviewUserId,
	);
	const sessionMatchesDevPreview =
		!hasDevPreviewTarget ||
		normalizeIdentifier(sessionUserId) === devPreviewTargetUserId ||
		normalizeEmail(sessionUserEmail) === devPreviewUserEmail;
	const targetUserId =
		devPreviewUserRow?.userId ??
		devPreviewTargetUserId ??
		(sessionMatchesDevPreview ? resolvedUserId : undefined);
	const targetUserEmail =
		devPreviewUserRow?.email ??
		devPreviewUserEmail ??
		(sessionMatchesDevPreview ? sessionUserEmail : undefined);
	const targetUserName =
		devPreviewUserRow?.displayName ??
		(sessionMatchesDevPreview ? sessionUserName : undefined) ??
		devPreviewPublicId;
	const targetUserImage =
		devPreviewUserRow?.imageUrl ??
		(sessionMatchesDevPreview ? sessionUserImage : undefined);
	const targetGuestPreviewDisplayName = hasDevPreviewTarget
		? undefined
		: guestPreviewDisplayName;
	const targetGuestPreviewImageUrl = hasDevPreviewTarget
		? undefined
		: guestPreviewImageUrl;
	const activeWrappedData = sessionMatchesDevPreview ? wrappedData : null;
	const completionUserId = targetUserId ?? null;
	// These recent-window developer queries power the richer story beats. They
	// are intentionally left separate for now because the Saturday ship still
	// needs clear visibility into which beat is reading which source.
	const developerDetailsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.details.queryOptions({
			input: {
				userId: targetUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(targetUserId),
	});
	const developerFeaturesQuery = useAnalyticsQuery({
		...orpc.analytics.developers.features.queryOptions({
			input: {
				userId: targetUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(targetUserId),
	});
	const developerProjectsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.projects.queryOptions({
			input: {
				userId: targetUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(targetUserId),
	});
	const developerSessionsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.sessions.queryOptions({
			input: {
				userId: targetUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
				outcome: "all",
				limit: 1000,
				offset: 0,
				sortBy: "date",
				sortOrder: "desc",
			},
		}),
		enabled: Boolean(targetUserId),
	});
	const commitBreakdownQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: MAX_ANALYTICS_DAYS,
				dimension: "has_commit",
				limit: 4,
				metric: "session_count",
				userId: targetUserId ?? undefined,
			},
		}),
		enabled: Boolean(targetUserId),
	});
	const visibleTeamCardRow = useMemo(
		() =>
			buildResolvedTeamCardRow({
				accountLabel:
					devPreviewUserRow?.displayName ??
					targetUserEmail ??
					devPreviewPublicId ??
					accountLabel,
				developerDetails: developerDetailsQuery.data,
				guestPreviewDisplayName: targetGuestPreviewDisplayName,
				guestPreviewImageUrl: targetGuestPreviewImageUrl,
				profileImageFallbackSrc: handover.preview.profile.avatarSrc,
				sessionUserEmail: targetUserEmail,
				sessionUserId: targetUserId,
				sessionUserImage: targetUserImage,
				sessionUserName: targetUserName,
				teamMemberRows: effectiveTeamMemberRows,
				wrappedMetrics: activeWrappedData?.metrics,
			}),
		[
			accountLabel,
			activeWrappedData?.metrics,
			developerDetailsQuery.data,
			devPreviewPublicId,
			devPreviewUserRow?.displayName,
			effectiveTeamMemberRows,
			handover.preview.profile.avatarSrc,
			targetGuestPreviewDisplayName,
			targetGuestPreviewImageUrl,
			targetUserEmail,
			targetUserId,
			targetUserImage,
			targetUserName,
		],
	);
	const baseOnboardingMetrics = useMemo(
		() =>
			buildWrappedOnboardingMetrics({
				commitBreakdown: commitBreakdownQuery.data,
				developerDetails: developerDetailsQuery.data,
				developerFeatures: developerFeaturesQuery.data,
				developerProjects: developerProjectsQuery.data,
				developerSessions: developerSessionsQuery.data,
				wrappedMetrics: activeWrappedData?.metrics,
			}),
		[
			activeWrappedData?.metrics,
			commitBreakdownQuery.data,
			developerDetailsQuery.data,
			developerFeaturesQuery.data,
			developerProjectsQuery.data,
			developerSessionsQuery.data,
		],
	);
	const onboardingMetrics = useMemo(
		() =>
			applyDevPreviewPublicShareMetrics({
				metrics: baseOnboardingMetrics,
				share: devPreviewPublicShareQuery.data,
			}),
		[baseOnboardingMetrics, devPreviewPublicShareQuery.data],
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
		() =>
			resolveLiveArchetype(activeWrappedData?.archetype?.key) ??
			resolveLiveArchetype(devPreviewUserRow?.archetype?.key) ??
			resolveDevPreviewPublicShareArchetype(devPreviewPublicShareQuery.data),
		[
			activeWrappedData?.archetype?.key,
			devPreviewPublicShareQuery.data,
			devPreviewUserRow?.archetype?.key,
		],
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
): WrappedArchetypeCardTheme | null {
	if (!classifierKey) {
		return null;
	}

	return resolveWrappedArchetypeCardThemeByClassifierKey(classifierKey) ?? null;
}

function buildDevPreviewPublicTeamRow(input: {
	publicId: string | undefined;
	share: PublicWrappedShare | undefined;
}): TeamPageMemberRow | undefined {
	if (!input.publicId || !input.share) {
		return undefined;
	}

	const row = input.share.snapshot.row;

	return {
		activeDays: row.activeDays,
		archetype: buildDevPreviewPublicTeamRowArchetype(input.share),
		cost: row.cost,
		displayName: row.displayName,
		email: null,
		favoriteModel: row.favoriteModel,
		hasActivity: row.hasActivity,
		imageUrl: row.imageUrl,
		inputTokens: row.inputTokens,
		lastActiveDate: row.lastActiveDate,
		outputTokens: row.outputTokens,
		role: row.role,
		totalSessions: row.totalSessions,
		totalTokens: row.totalTokens,
		userId: input.publicId,
	};
}

function buildDevPreviewPublicTeamRowArchetype(
	share: PublicWrappedShare,
): TeamPageMemberRow["archetype"] {
	const theme = resolveDevPreviewPublicShareArchetype(share);

	if (!theme?.classifierKey) {
		return null;
	}

	return {
		key: theme.classifierKey,
		name: theme.displayLabel,
	};
}

function resolveDevPreviewPublicShareArchetype(
	share: PublicWrappedShare | undefined,
): WrappedArchetypeCardTheme | null {
	if (!share) {
		return null;
	}

	const existingArchetype = WRAPPED_ARCHETYPE_CARD_THEMES.find(
		(candidate) => candidate.displayLabel === share.snapshot.archetypeLabel,
	);

	if (existingArchetype) {
		return existingArchetype;
	}

	return {
		classifierKey: undefined,
		displayLabel: share.snapshot.archetypeLabel,
		id: "public-share-snapshot",
		kind: "special_edition",
		shellClassName: share.snapshot.shellClassName,
		theme: share.snapshot.theme,
	} satisfies WrappedArchetypeCardTheme;
}

function applyDevPreviewPublicShareMetrics(input: {
	metrics: WrappedOnboardingMetrics;
	share: PublicWrappedShare | undefined;
}): WrappedOnboardingMetrics {
	if (!input.share) {
		return input.metrics;
	}

	const { revealMetrics, row } = input.share.snapshot;

	return {
		...input.metrics,
		activeDays: Math.max(input.metrics.activeDays, row.activeDays),
		avgSessionMin:
			input.metrics.avgSessionMin ?? revealMetrics?.avgSessionMin ?? null,
		commitRate: input.metrics.commitRate ?? revealMetrics?.commitRate ?? null,
		daysSinceFirst: Math.max(
			input.metrics.daysSinceFirst,
			revealMetrics?.daysSinceFirst ?? 0,
		),
		distinctProjectCount: Math.max(
			input.metrics.distinctProjectCount,
			revealMetrics?.distinctProjectCount ?? 0,
		),
		estimatedCostTokenBasis: Math.max(
			input.metrics.estimatedCostTokenBasis,
			row.totalTokens,
		),
		estimatedCostUsd: Math.max(
			input.metrics.estimatedCostUsd,
			Math.round(row.cost),
		),
		favoriteModel: input.metrics.favoriteModel ?? row.favoriteModel,
		longestSessionMin:
			input.metrics.longestSessionMin ??
			revealMetrics?.longestSessionMin ??
			null,
		totalSessions: Math.max(input.metrics.totalSessions, row.totalSessions),
		totalTokens: Math.max(input.metrics.totalTokens, row.totalTokens),
	};
}

function findTeamMemberRowByDevPreviewTarget(input: {
	email: string | undefined;
	teamMemberRows: readonly TeamPageMemberRow[];
	userId: string | undefined;
}) {
	return input.teamMemberRows.find((row) => {
		if (input.userId && row.userId === input.userId) {
			return true;
		}

		return Boolean(input.email) && normalizeEmail(row.email) === input.email;
	});
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

function normalizeEmail(email: string | null | undefined) {
	return email?.trim().toLowerCase() || undefined;
}

function normalizeIdentifier(value: string | null | undefined) {
	const normalizedValue = value?.trim().replace(/^\/+/u, "");
	return normalizedValue || undefined;
}
