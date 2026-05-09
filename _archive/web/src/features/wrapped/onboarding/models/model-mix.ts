import type { WrappedSourceSplit } from "@rudel/api-routes";

const MODEL_STAGE_SOURCE_ORDER = ["claude_code", "codex"] as const;

const MODEL_STAGE_TONES: Record<WrappedSourceSplit["source"], string> = {
	claude_code: "#ff9a2f",
	codex: "#2d6df6",
};

interface WrappedModelShareSegment {
	id: string;
	label: string;
	sessionCount: number;
	share: number;
	source: WrappedSourceSplit["source"];
}

interface ModelStageModel {
	headline: string;
	subline: string;
	summary: readonly WrappedModelShareSegment[];
	totalSessionsLabel: string;
}

export function resolveModelPreviewInput(
	input: {
		sourceSplit: readonly WrappedSourceSplit[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "codex-zero":
			return {
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 100],
					["codex", 0],
				]),
			};
		case "favorite":
			return {
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 78],
					["codex", 22],
				]),
			};
		case "played-field":
			return {
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 51],
					["codex", 49],
				]),
			};
		case "single-switch":
			return {
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 42],
					["codex", 58],
				]),
			};
		case "exploring":
			return {
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 55],
					["codex", 45],
				]),
			};
		case "settled":
			return {
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 39],
					["codex", 61],
				]),
			};
		case "rotation":
			return {
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 57],
					["codex", 43],
				]),
			};
		default:
			return input;
	}
}

export function resolveModelStageModel(input: {
	sourceSplit: readonly WrappedSourceSplit[];
}): ModelStageModel {
	const summary = buildModelShareSummary(input.sourceSplit);
	const sourceSplit = summarizeModelSourceSplit(summary);
	const overallLeader = sourceSplit.leadingLabel;
	const headline =
		summary.length === 0
			? "Your Claude vs Codex split is warming up"
			: sourceSplit.isBalanced
				? "You kept both tools in play"
				: overallLeader
					? `${overallLeader} led the run`
					: "Your tool split kept moving";
	const subline =
		summary.length === 0
			? "We will chart Claude and Codex once enough session history lands."
			: !sourceSplit.hasSourceComparison && overallLeader
				? `The all-time bar leaned ${overallLeader}.`
				: sourceSplit.isBalanced
					? "The all-time bar stayed close across the full run."
					: overallLeader
						? `The all-time bar leaned ${overallLeader} across the full run.`
						: "The all-time bar shows your Claude vs Codex session split.";
	const totalSessions = summary.reduce(
		(sum, segment) => sum + segment.sessionCount,
		0,
	);

	return {
		headline,
		subline,
		summary,
		totalSessionsLabel:
			totalSessions > 0
				? `${totalSessions.toLocaleString()} sessions`
				: "No sessions yet",
	};
}

export function formatModelStageSourceLabel(
	source: WrappedSourceSplit["source"],
) {
	return source === "claude_code" ? "Claude" : "Codex";
}

export function getModelStageTone(source: WrappedSourceSplit["source"]) {
	return MODEL_STAGE_TONES[source];
}

function buildPreviewSourceSplit(
	entries: readonly [WrappedSourceSplit["source"], number][],
): WrappedSourceSplit[] {
	return entries.map(([source, sessionSharePercent]) => ({
		source,
		session_count: Math.round(sessionSharePercent),
		session_share_percent: sessionSharePercent,
	}));
}

function buildModelShareSummary(
	sourceSplit: readonly WrappedSourceSplit[],
): WrappedModelShareSegment[] {
	const summaryRows = MODEL_STAGE_SOURCE_ORDER.map((source) => ({
		label: formatModelStageSourceLabel(source),
		sessionCount:
			sourceSplit.find((sourceEntry) => sourceEntry.source === source)
				?.session_count ?? 0,
		sessionShare:
			sourceSplit.find((sourceEntry) => sourceEntry.source === source)
				?.session_share_percent ?? 0,
		source,
	})).filter(
		(sourceEntry) =>
			sourceEntry.sessionCount > 0 || sourceEntry.sessionShare > 0,
	);

	if (summaryRows.length === 0) {
		return [];
	}

	const totalSessions = summaryRows.reduce(
		(sum, sourceEntry) => sum + sourceEntry.sessionCount,
		0,
	);

	return summaryRows.map((sourceEntry) => ({
		id: `model-summary-${sourceEntry.source}`,
		label: sourceEntry.label,
		sessionCount: sourceEntry.sessionCount,
		share:
			totalSessions > 0
				? (sourceEntry.sessionCount / totalSessions) * 100
				: sourceEntry.sessionShare,
		source: sourceEntry.source,
	}));
}

function summarizeModelSourceSplit(
	summary: readonly WrappedModelShareSegment[],
) {
	const claudeShare = Math.round(
		summary.find((segment) => segment.source === "claude_code")?.share ?? 0,
	);
	const codexShare = Math.round(
		summary.find((segment) => segment.source === "codex")?.share ?? 0,
	);
	const rankedSegments = [...summary].sort(
		(leftSegment, rightSegment) =>
			rightSegment.share - leftSegment.share ||
			leftSegment.label.localeCompare(rightSegment.label),
	);

	return {
		claudeShare,
		codexShare,
		hasSourceComparison: MODEL_STAGE_SOURCE_ORDER.every(
			(source) =>
				(summary.find((segment) => segment.source === source)?.sessionCount ??
					0) > 0,
		),
		isBalanced: Math.abs(claudeShare - codexShare) <= 8,
		leadingLabel: rankedSegments[0]?.label ?? null,
	};
}
