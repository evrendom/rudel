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
