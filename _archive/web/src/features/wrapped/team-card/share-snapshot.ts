import type {
	WrappedShareAppearance,
	WrappedShareRevealMetrics,
	WrappedShareSnapshot,
} from "@rudel/api-routes";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import type {
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardTheme,
} from "./card";
import type { WrappedTeamMemberCardBackMetric } from "./card-back";
import { getWrappedShareSafeImageUrl } from "./share-media";

interface BuildWrappedShareSnapshotParams {
	appearance: WrappedShareAppearance;
	archetypeLabel: string;
	backMetrics: readonly WrappedTeamMemberCardBackMetric[];
	headerLeftMetric?: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric?: WrappedTeamMemberCardHeaderMetric;
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
	shellClassName: string;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	theme: WrappedTeamMemberCardTheme;
}

// Convert the live wrapped card state into the exact payload we are willing to
// persist and replay publicly. This is the boundary where we deliberately stop
// carrying rich internal data and keep only the rendered snapshot values.
export function buildWrappedShareSnapshot(
	params: BuildWrappedShareSnapshotParams,
): WrappedShareSnapshot {
	const {
		appearance,
		archetypeLabel,
		backMetrics,
		headerLeftMetric,
		headerRightMetric,
		onboardingMetrics,
		row,
		shellClassName,
		statItems,
		theme,
	} = params;

	return {
		appearance,
		archetypeLabel,
		backMetrics: backMetrics.map((metric) => ({
			label: metric.label,
			slot: metric.slot,
			value: metric.value,
		})),
		headerLeftMetric,
		headerRightMetric,
		revealMetrics: buildWrappedShareRevealMetrics(onboardingMetrics),
		// Copy only the public card fields needed for replay. This keeps the public
		// share payload honest, portable, and easy to reason about.
		row: {
			activeDays: row.activeDays,
			cost: row.cost,
			displayName: row.displayName,
			favoriteModel: row.favoriteModel,
			hasActivity: row.hasActivity,
			// Persist the share-safe image url only. That keeps public replay stable
			// even if the live card used a third-party profile image that cannot be
			// exported or replayed reliably later.
			imageUrl: getWrappedShareSafeImageUrl(row.imageUrl),
			inputTokens: row.inputTokens,
			lastActiveDate: row.lastActiveDate,
			outputTokens: row.outputTokens,
			role: row.role,
			totalSessions: row.totalSessions,
			totalTokens: row.totalTokens,
		},
		shellClassName,
		// Stat items are flattened into plain values so the public page does not
		// need the wrapped page's richer derivation logic.
		statItems: statItems.map((statItem) => ({
			icon: statItem.icon,
			key: statItem.key,
			label: statItem.label,
			title: statItem.title,
			value: statItem.value,
		})),
		theme,
	};
}

function buildWrappedShareRevealMetrics(
	onboardingMetrics: WrappedOnboardingMetrics,
): WrappedShareRevealMetrics {
	return {
		avgSessionMin: onboardingMetrics.avgSessionMin,
		commitRate: onboardingMetrics.commitRate,
		daysSinceFirst: onboardingMetrics.daysSinceFirst,
		distinctProjectCount: onboardingMetrics.distinctProjectCount,
		longestSessionMin: onboardingMetrics.longestSessionMin,
	};
}
