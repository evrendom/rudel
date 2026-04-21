import type { WrappedShareSnapshot } from "@rudel/api-routes";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type {
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardTheme,
} from "./card";

interface BuildWrappedShareSnapshotParams {
	archetypeLabel: string;
	headerLeftMetric?: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric?: WrappedTeamMemberCardHeaderMetric;
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
		archetypeLabel,
		headerLeftMetric,
		headerRightMetric,
		row,
		shellClassName,
		statItems,
		theme,
	} = params;

	return {
		archetypeLabel,
		headerLeftMetric,
		headerRightMetric,
		// Copy only the public card fields needed for replay. This keeps the public
		// share payload honest, portable, and easy to reason about.
		row: {
			activeDays: row.activeDays,
			cost: row.cost,
			displayName: row.displayName,
			favoriteModel: row.favoriteModel,
			hasActivity: row.hasActivity,
			imageUrl: row.imageUrl ?? null,
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
