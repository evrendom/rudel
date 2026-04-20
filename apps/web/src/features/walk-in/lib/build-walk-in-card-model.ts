import type { WrappedSourceSplit, WrappedV1 } from "@rudel/api-routes";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
});

const SEED_SOURCE_SPLIT: readonly WrappedSourceSplit[] = [
	{
		session_count: 78,
		session_share_percent: 61,
		source: "claude_code",
	},
	{
		session_count: 50,
		session_share_percent: 39,
		source: "codex",
	},
];

const SEED_METRICS: WrappedV1["metrics"] = {
	active_days: 37,
	days_since_first_session: 214,
	estimated_spend_usd: 126,
	favorite_model: "Claude Sonnet 4",
	first_session_at: "2025-09-17T00:00:00Z",
	last_session_at: "2026-04-18T00:00:00Z",
	longest_session_min: 164,
	source_split: [...SEED_SOURCE_SPLIT],
	total_sessions: 128,
	total_tokens: 482_300,
};

interface SourceProfile {
	archetypeLabel: string;
	splitLabel: string;
	summary: string;
}

export interface WalkInCardModel {
	archetypeLabel: string;
	favoriteModelLabel: string;
	firstSessionLabel: string;
	sourceSummary: string;
	splitLabel: string;
	totalSessionsLabel: string;
	totalTokensLabel: string;
}

export interface BuildWalkInCardModelOptions {
	accountLabel: string;
	wrappedData: WrappedV1 | null;
}

export function buildWalkInCardModel(
	options: BuildWalkInCardModelOptions,
): WalkInCardModel {
	const metrics = options.wrappedData?.metrics ?? SEED_METRICS;
	const sourceProfile = getSourceProfile(metrics.source_split);

	return {
		archetypeLabel: sourceProfile.archetypeLabel,
		favoriteModelLabel: metrics.favorite_model ?? "Claude Sonnet 4",
		firstSessionLabel: formatStoryDate(metrics.first_session_at),
		sourceSummary: sourceProfile.summary,
		splitLabel: sourceProfile.splitLabel,
		totalSessionsLabel: INTEGER_FORMATTER.format(metrics.total_sessions),
		totalTokensLabel: COMPACT_NUMBER_FORMATTER.format(metrics.total_tokens),
	};
}

function getSourceProfile(
	sourceSplit: readonly WrappedSourceSplit[],
): SourceProfile {
	const claudeShare = getSourceSharePercent(sourceSplit, "claude_code");
	const codexShare = getSourceSharePercent(sourceSplit, "codex");

	if (claudeShare >= 70) {
		return {
			archetypeLabel: "Claude Loyalist",
			splitLabel: `Claude ${Math.round(claudeShare)}% / Codex ${Math.round(codexShare)}%`,
			summary: `${Math.round(claudeShare)}% of your sessions leaned Claude Code.`,
		};
	}

	if (codexShare >= 70) {
		return {
			archetypeLabel: "Codex Pilot",
			splitLabel: `Claude ${Math.round(claudeShare)}% / Codex ${Math.round(codexShare)}%`,
			summary: `${Math.round(codexShare)}% of your sessions leaned Codex.`,
		};
	}

	if (
		claudeShare >= 40 &&
		claudeShare <= 60 &&
		codexShare >= 40 &&
		codexShare <= 60
	) {
		return {
			archetypeLabel: "Two-Track Operator",
			splitLabel: `Claude ${Math.round(claudeShare)}% / Codex ${Math.round(codexShare)}%`,
			summary: "Claude Code and Codex both got real airtime.",
		};
	}

	const dominantSourceLabel =
		claudeShare >= codexShare ? "Claude Code" : "Codex";
	const dominantSourceSharePercent = Math.round(
		Math.max(claudeShare, codexShare),
	);

	return {
		archetypeLabel: "Hybrid Builder",
		splitLabel: `Claude ${Math.round(claudeShare)}% / Codex ${Math.round(codexShare)}%`,
		summary: `${dominantSourceSharePercent}% of your sessions leaned ${dominantSourceLabel}.`,
	};
}

function getSourceSharePercent(
	sourceSplit: readonly WrappedSourceSplit[],
	source: WrappedSourceSplit["source"],
): number {
	return (
		sourceSplit.find((sourceItem) => sourceItem.source === source)
			?.session_share_percent ?? 0
	);
}

function formatStoryDate(value: string | null) {
	if (!value) {
		return "No sessions yet";
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return "No sessions yet";
	}

	return new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(date);
}
