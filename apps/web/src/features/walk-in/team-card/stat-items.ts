import type { WrappedSourceSplit } from "@rudel/api-routes";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WalkInTeamMemberCardStatItem } from "./card";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import { formatCompactWholeNumber } from "@/lib/format";

export function buildWalkInStatItems(
	row: TeamPageMemberRow,
	distinctProjectCount: number,
	sourceSplit: readonly WrappedSourceSplit[],
): WalkInTeamMemberCardStatItem[] {
	const normalizedSourceSplit = normalizeSourceSplit(sourceSplit);

	return [
		{
			key: "codex-share",
			title: `${normalizedSourceSplit.codexShare}% of wrapped sessions came from Codex`,
			icon: "codex",
			value: `${normalizedSourceSplit.codexShare}%`,
		},
		{
			key: "claude-share",
			title: `${normalizedSourceSplit.claudeShare}% of wrapped sessions came from Claude Code`,
			icon: "claude",
			value: `${normalizedSourceSplit.claudeShare}%`,
		},
		{
			key: "sessions",
			label: "SESS",
			title: `${row.totalSessions.toLocaleString()} sessions`,
			value: row.totalSessions.toLocaleString(),
		},
		{
			key: "days",
			label: "DAYS",
			title: `${row.activeDays.toLocaleString()} active days across ${MAX_ANALYTICS_DAYS.toLocaleString()} tracked days`,
			value: row.activeDays.toLocaleString(),
		},
		{
			key: "tokens",
			label: "TOK",
			title: `${row.totalTokens.toLocaleString()} total tokens`,
			value: formatCompactWholeNumber(row.totalTokens),
		},
		{
			key: "repos",
			label: "REPOS",
			title: `${distinctProjectCount.toLocaleString()} distinct tracked projects`,
			value: distinctProjectCount.toLocaleString(),
		},
	];
}

function normalizeSourceSplit(sourceSplit: readonly WrappedSourceSplit[]) {
	return {
		claudeShare: Math.round(getSourceSharePercent(sourceSplit, "claude_code")),
		codexShare: Math.round(getSourceSharePercent(sourceSplit, "codex")),
	};
}

function getSourceSharePercent(
	sourceSplit: readonly WrappedSourceSplit[],
	source: WrappedSourceSplit["source"],
) {
	return (
		sourceSplit.find((sourceEntry) => sourceEntry.source === source)
			?.session_share_percent ?? 0
	);
}
