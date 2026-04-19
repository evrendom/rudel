import type { WrappedSourceSplit, WrappedV1 } from "@rudel/api-routes";
import { thinkerTradingCardTemplate } from "@/features/walk-in/data/thinker-achievement";
import type { MymindTradingCardOptions } from "@/features/walk-in/lib/mymind-runtime";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
});

const WHOLE_CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 0,
	style: "currency",
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
	accentColor: string;
	accentGlow: string;
	archetypeLabel: string;
	cardDescriptionColor: string;
	cardTitleColor: string;
	dominantSourceLabel: string;
	dominantSourceSharePercent: number;
	frameShaderB: number;
	frameShaderG: number;
	frameShaderR: number;
	orbShaderB: number;
	orbShaderG: number;
	orbShaderR: number;
	pictoShaderB: number;
	pictoShaderG: number;
	pictoShaderR: number;
	splitLabel: string;
	summary: string;
}

export interface WalkInMetricRow {
	detail: string;
	label: string;
	progressRatio: number;
	value: string;
}

export interface WalkInCardModel {
	accentColor: string;
	accentGlow: string;
	archetypeLabel: string;
	cardFooter: string;
	cardSubtitle: string;
	dominantSourceLabel: string;
	favoriteModelLabel: string;
	firstSessionLabel: string;
	metricRows: readonly WalkInMetricRow[];
	runtimeOptions: MymindTradingCardOptions;
	sourceSummary: string;
	splitLabel: string;
	statusLabel: string;
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
	const { accountLabel, wrappedData } = options;
	const metrics = wrappedData?.metrics ?? SEED_METRICS;
	const sourceProfile = getSourceProfile(metrics.source_split);
	const favoriteModelLabel = metrics.favorite_model ?? "Claude Sonnet 4";
	const totalSessionsLabel = INTEGER_FORMATTER.format(metrics.total_sessions);
	const totalTokensLabel = COMPACT_NUMBER_FORMATTER.format(
		metrics.total_tokens,
	);
	const firstSessionLabel = formatStoryDate(metrics.first_session_at);
	const runtimeOptions = buildRuntimeOptions({
		favoriteModelLabel,
		metrics,
		sourceProfile,
	});

	return {
		accentColor: sourceProfile.accentColor,
		accentGlow: sourceProfile.accentGlow,
		archetypeLabel: sourceProfile.archetypeLabel,
		cardFooter: `${favoriteModelLabel} • ${totalSessionsLabel} sessions • ${totalTokensLabel} tokens`,
		cardSubtitle: sourceProfile.summary,
		dominantSourceLabel: sourceProfile.dominantSourceLabel,
		favoriteModelLabel,
		firstSessionLabel,
		metricRows: buildMetricRows(metrics, sourceProfile),
		runtimeOptions,
		sourceSummary: sourceProfile.summary,
		splitLabel: sourceProfile.splitLabel,
		statusLabel: wrappedData
			? `Live workspace card for ${accountLabel}`
			: "Seed trading card preview",
		totalSessionsLabel,
		totalTokensLabel,
	};
}

function buildMetricRows(
	metrics: WrappedV1["metrics"],
	sourceProfile: SourceProfile,
): WalkInMetricRow[] {
	const tokensPerSession =
		metrics.total_sessions > 0
			? metrics.total_tokens / metrics.total_sessions
			: 0;

	return [
		{
			detail: `${INTEGER_FORMATTER.format(metrics.active_days)} active days`,
			label: "SES",
			progressRatio: clampRatio(metrics.total_sessions / 180),
			value: INTEGER_FORMATTER.format(metrics.total_sessions),
		},
		{
			detail: sourceProfile.summary,
			label: "SPL",
			progressRatio: clampRatio(sourceProfile.dominantSourceSharePercent / 100),
			value: `${sourceProfile.dominantSourceSharePercent}%`,
		},
		{
			detail: `${COMPACT_NUMBER_FORMATTER.format(tokensPerSession)} per session`,
			label: "TOK",
			progressRatio: clampRatio(metrics.total_tokens / 1_000_000),
			value: COMPACT_NUMBER_FORMATTER.format(metrics.total_tokens),
		},
		{
			detail: "longest lock-in",
			label: "LCK",
			progressRatio: clampRatio(metrics.longest_session_min / 240),
			value: `${Math.round(metrics.longest_session_min)}m`,
		},
		{
			detail: "estimated spend",
			label: "USD",
			progressRatio: clampRatio(metrics.estimated_spend_usd / 300),
			value: WHOLE_CURRENCY_FORMATTER.format(metrics.estimated_spend_usd),
		},
	];
}

function buildRuntimeOptions(params: {
	favoriteModelLabel: string;
	metrics: WrappedV1["metrics"];
	sourceProfile: SourceProfile;
}): MymindTradingCardOptions {
	const { favoriteModelLabel, metrics, sourceProfile } = params;
	const totalSessionsLabel = INTEGER_FORMATTER.format(metrics.total_sessions);
	const totalTokensLabel = COMPACT_NUMBER_FORMATTER.format(
		metrics.total_tokens,
	);

	return {
		...thinkerTradingCardTemplate,
		container: null,
		description: `${favoriteModelLabel}\n${totalSessionsLabel} sessions • ${totalTokensLabel} tokens`,
		descriptionColor: sourceProfile.cardDescriptionColor,
		frameBrightness: 0.92,
		frameColorContrast: 1,
		frameIridescentBlend: 0,
		frameShaderB: sourceProfile.frameShaderB,
		frameShaderG: sourceProfile.frameShaderG,
		frameShaderR: sourceProfile.frameShaderR,
		frameShaderType: 1,
		generalBrightness: 1.04,
		generalSaturation: 0.18,
		level: getCardLevel(metrics.total_sessions),
		orbAlphaMap: null,
		orbBrightness: 0,
		orbColorContrast: 1,
		orbColorMapContrast: 1,
		orbIridescentBlend: 0,
		orbNormalMap: null,
		orbNormalScale: 0,
		orbShaderB: 0.86,
		orbShaderG: 0.86,
		orbShaderR: 0.86,
		overlayBrightness: 0.95,
		overlayColorContrast: 1,
		overlayIridescentBlend: 0,
		pictoAlphaMap: null,
		pictoBrightness: 0,
		pictoColorContrast: 1,
		pictoColorMapContrast: 1,
		pictoIridescentBlend: 0,
		pictoNormalMap: null,
		pictoNormalScale: 0,
		pictoShaderB: 0.82,
		pictoShaderG: 0.82,
		pictoShaderR: 0.82,
		preventReveal: false,
		title: sourceProfile.archetypeLabel,
		titleColor: sourceProfile.cardTitleColor,
		artworkIridescentBlend: 0,
	};
}

function getCardLevel(totalSessions: number): number {
	if (totalSessions >= 160) {
		return 4;
	}

	if (totalSessions >= 80) {
		return 3;
	}

	if (totalSessions >= 30) {
		return 2;
	}

	return 1;
}

function getSourceProfile(
	sourceSplit: readonly WrappedSourceSplit[],
): SourceProfile {
	const claudeShare = getSourceSharePercent(sourceSplit, "claude_code");
	const codexShare = getSourceSharePercent(sourceSplit, "codex");

	if (claudeShare >= 70) {
		return {
			accentColor: "#8AEEB6",
			accentGlow: "rgba(138, 238, 182, 0.42)",
			archetypeLabel: "Claude Loyalist",
			cardDescriptionColor: "#0B3B28",
			cardTitleColor: "#062A1C",
			dominantSourceLabel: "Claude Code",
			dominantSourceSharePercent: Math.round(claudeShare),
			frameShaderB: 0.34,
			frameShaderG: 0.68,
			frameShaderR: 0.18,
			orbShaderB: 0.88,
			orbShaderG: 1,
			orbShaderR: 0.84,
			pictoShaderB: 0.56,
			pictoShaderG: 0.86,
			pictoShaderR: 0.18,
			splitLabel: `Claude ${Math.round(claudeShare)}% / Codex ${Math.round(codexShare)}%`,
			summary: `${Math.round(claudeShare)}% of your sessions leaned Claude Code.`,
		};
	}

	if (codexShare >= 70) {
		return {
			accentColor: "#7CD8FF",
			accentGlow: "rgba(124, 216, 255, 0.44)",
			archetypeLabel: "Codex Pilot",
			cardDescriptionColor: "#123B68",
			cardTitleColor: "#0A2141",
			dominantSourceLabel: "Codex",
			dominantSourceSharePercent: Math.round(codexShare),
			frameShaderB: 0.78,
			frameShaderG: 0.42,
			frameShaderR: 0.1,
			orbShaderB: 1,
			orbShaderG: 0.97,
			orbShaderR: 0.9,
			pictoShaderB: 0.98,
			pictoShaderG: 0.7,
			pictoShaderR: 0.28,
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
			accentColor: "#F6D37A",
			accentGlow: "rgba(246, 211, 122, 0.38)",
			archetypeLabel: "Two-Track Operator",
			cardDescriptionColor: "#5A4310",
			cardTitleColor: "#37280A",
			dominantSourceLabel: "both lanes",
			dominantSourceSharePercent: Math.round(Math.max(claudeShare, codexShare)),
			frameShaderB: 0.2,
			frameShaderG: 0.54,
			frameShaderR: 0.82,
			orbShaderB: 0.84,
			orbShaderG: 0.94,
			orbShaderR: 1,
			pictoShaderB: 0.36,
			pictoShaderG: 0.76,
			pictoShaderR: 0.98,
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
		accentColor: "#F1A56C",
		accentGlow: "rgba(241, 165, 108, 0.34)",
		archetypeLabel: "Hybrid Builder",
		cardDescriptionColor: "#543112",
		cardTitleColor: "#301708",
		dominantSourceLabel,
		dominantSourceSharePercent,
		frameShaderB: 0.2,
		frameShaderG: 0.4,
		frameShaderR: 0.72,
		orbShaderB: 0.78,
		orbShaderG: 0.88,
		orbShaderR: 1,
		pictoShaderB: 0.2,
		pictoShaderG: 0.6,
		pictoShaderR: 0.96,
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

function formatStoryDate(value: string | null): string {
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

function clampRatio(value: number): number {
	return Math.max(0.08, Math.min(1, value));
}
