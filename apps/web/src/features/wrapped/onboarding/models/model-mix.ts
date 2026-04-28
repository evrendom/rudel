import type { MonthlyModelUsage, WrappedSourceSplit } from "@rudel/api-routes";

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

interface WrappedModelShareMonth {
	id: string;
	label: string;
	leaderLabel: string;
	leaderShare: number;
	segments: readonly WrappedModelShareSegment[];
	totalSessions: number;
}

interface ModelStageModel {
	hasSourceComparison: boolean;
	headline: string;
	months: readonly WrappedModelShareMonth[];
	monthsLabel: string;
	subline: string;
	summary: readonly WrappedModelShareSegment[];
	totalSessionsLabel: string;
}

export function resolveModelPreviewInput(
	input: {
		modelByMonth: readonly MonthlyModelUsage[];
		sourceSplit: readonly WrappedSourceSplit[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "codex-zero":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 28],
					["2026-02", "Claude Sonnet 4", 25],
					["2026-03", "Claude Sonnet 4", 24],
					["2026-04", "Claude Sonnet 4", 29],
					["2026-05", "Claude Sonnet 4", 27],
					["2026-06", "Claude Sonnet 4", 31],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 100],
					["codex", 0],
				]),
			};
		case "favorite":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 28],
					["2026-01", "GPT-4.1", 8],
					["2026-02", "Claude Sonnet 4", 25],
					["2026-02", "GPT-4.1", 6],
					["2026-03", "Claude Sonnet 4", 24],
					["2026-03", "GPT-4.1", 7],
					["2026-04", "Claude Sonnet 4", 29],
					["2026-04", "GPT-4.1", 8],
					["2026-05", "Claude Sonnet 4", 27],
					["2026-05", "GPT-4.1", 7],
					["2026-06", "Claude Sonnet 4", 31],
					["2026-06", "GPT-4.1", 9],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 78],
					["codex", 22],
				]),
			};
		case "played-field":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 14],
					["2026-01", "GPT-4.1", 13],
					["2026-01", "Gemini 2.5 Pro", 11],
					["2026-02", "GPT-4.1", 15],
					["2026-02", "Claude Sonnet 4", 14],
					["2026-02", "Gemini 2.5 Pro", 12],
					["2026-03", "Gemini 2.5 Pro", 13],
					["2026-03", "Claude Sonnet 4", 12],
					["2026-03", "GPT-4.1", 12],
					["2026-04", "Claude Sonnet 4", 16],
					["2026-04", "GPT-4.1", 15],
					["2026-04", "Gemini 2.5 Pro", 12],
					["2026-05", "GPT-4.1", 14],
					["2026-05", "Claude Sonnet 4", 13],
					["2026-05", "Gemini 2.5 Pro", 13],
					["2026-06", "Claude Sonnet 4", 15],
					["2026-06", "GPT-4.1", 15],
					["2026-06", "Gemini 2.5 Pro", 11],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 51],
					["codex", 49],
				]),
			};
		case "single-switch":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 22],
					["2026-01", "GPT-4.1", 8],
					["2026-02", "Claude Sonnet 4", 18],
					["2026-02", "GPT-4.1", 7],
					["2026-03", "GPT-4.1", 25],
					["2026-03", "Claude Sonnet 4", 11],
					["2026-04", "GPT-4.1", 29],
					["2026-04", "Claude Sonnet 4", 9],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 42],
					["codex", 58],
				]),
			};
		case "exploring":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 12],
					["2026-02", "GPT-4.1", 17],
					["2026-02", "Claude Sonnet 4", 14],
					["2026-03", "Gemini 2.5 Pro", 15],
					["2026-03", "Claude Sonnet 4", 11],
					["2026-04", "Claude Sonnet 4", 19],
					["2026-04", "GPT-4.1", 14],
					["2026-05", "GPT-4.1", 16],
					["2026-05", "Gemini 2.5 Pro", 13],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 55],
					["codex", 45],
				]),
			};
		case "settled":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 11],
					["2026-02", "Claude Sonnet 4", 19],
					["2026-02", "GPT-4.1", 12],
					["2026-03", "GPT-4.1", 21],
					["2026-03", "Claude Sonnet 4", 14],
					["2026-04", "GPT-4.1", 22],
					["2026-04", "Claude Sonnet 4", 13],
					["2026-05", "Claude Sonnet 4", 17],
					["2026-05", "GPT-4.1", 18],
					["2026-06", "GPT-4.1", 24],
					["2026-06", "Claude Sonnet 4", 14],
					["2026-07", "GPT-4.1", 26],
					["2026-07", "Claude Sonnet 4", 11],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 39],
					["codex", 61],
				]),
			};
		case "rotation":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 12],
					["2026-02", "Claude Sonnet 4", 21],
					["2026-02", "GPT-4.1", 9],
					["2026-03", "GPT-4.1", 19],
					["2026-03", "Claude Sonnet 4", 16],
					["2026-04", "GPT-4.1", 17],
					["2026-04", "Claude Sonnet 4", 15],
					["2026-05", "Claude Sonnet 4", 22],
					["2026-05", "GPT-4.1", 11],
					["2026-06", "Claude Sonnet 4", 24],
					["2026-06", "GPT-4.1", 10],
				]),
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
	modelByMonth: readonly MonthlyModelUsage[];
	sourceSplit: readonly WrappedSourceSplit[];
}): ModelStageModel {
	const months = buildModelShareMonths(input.modelByMonth);
	const summary = buildModelShareSummary(input.sourceSplit);
	const sourceSplit = summarizeModelSourceSplit(summary);
	const activeMonths = months.filter((month) => month.totalSessions > 0);
	const distinctLeaders = new Set(
		activeMonths.map((month) => month.leaderLabel),
	).size;
	const latestLeader =
		activeMonths[activeMonths.length - 1]?.leaderLabel ?? null;
	const earliestLeader = activeMonths[0]?.leaderLabel ?? null;
	const overallLeader = sourceSplit.leadingLabel ?? latestLeader;
	const headline =
		summary.length === 0 && activeMonths.length === 0
			? "Your Claude vs Codex split is warming up"
			: sourceSplit.isBalanced
				? "You kept both tools in play"
				: distinctLeaders <= 1 && overallLeader
					? `${overallLeader} held the line`
					: earliestLeader && latestLeader && earliestLeader !== latestLeader
						? `${latestLeader} took the latest stretch`
						: overallLeader
							? `${overallLeader} led the run`
							: "Your tool split kept moving";
	const subline =
		summary.length === 0 && activeMonths.length === 0
			? "We will chart Claude and Codex once enough history lands."
			: !sourceSplit.hasSourceComparison && overallLeader
				? `The full-run bar leaned ${overallLeader}. The month-by-month comparison unlocks once both Claude and Codex have sessions.`
				: activeMonths.length === 0
					? "The full-run split is ready. The month-by-month view needs a little more history."
					: sourceSplit.isBalanced
						? "The all-time bar stayed close, and the monthly stacks kept both tools in rotation."
						: earliestLeader && latestLeader && earliestLeader !== latestLeader
							? `${earliestLeader} led early, then ${latestLeader} took the latest month.`
							: overallLeader
								? `The full-run bar and the monthly stacks both leaned ${overallLeader}.`
								: "The top bar shows the full-run split. The six stacks show how it moved month to month.";
	const totalSessions = summary.reduce(
		(sum, segment) => sum + segment.sessionCount,
		0,
	);

	return {
		hasSourceComparison: sourceSplit.hasSourceComparison,
		headline,
		months,
		monthsLabel: `${activeMonths.length} active month${activeMonths.length === 1 ? "" : "s"}`,
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

export function hasModelStageSourceComparison(
	sourceSplit: readonly WrappedSourceSplit[],
) {
	return MODEL_STAGE_SOURCE_ORDER.every(
		(source) =>
			(sourceSplit.find((sourceEntry) => sourceEntry.source === source)
				?.session_count ?? 0) > 0,
	);
}

function buildPreviewMonthlyModelUsage(
	entries: readonly [string, string, number][],
): MonthlyModelUsage[] {
	return entries.map(([month, model, sessionCount]) => ({
		month,
		model,
		session_count: sessionCount,
	}));
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

function buildModelShareMonths(
	modelByMonth: readonly MonthlyModelUsage[],
): WrappedModelShareMonth[] {
	const rowsByMonth = buildModelSourceCountsByMonth(modelByMonth);
	const months = getLatestModelStageMonthKeys([...rowsByMonth.keys()]);

	if (months.length === 0) {
		return [];
	}

	return months.map((month) => {
		const monthCounts = rowsByMonth.get(month) ?? new Map();
		const sourceCounts = MODEL_STAGE_SOURCE_ORDER.map((source) => ({
			label: formatModelStageSourceLabel(source),
			sessionCount: monthCounts.get(source) ?? 0,
			source,
		}));
		const totalSessions = sourceCounts.reduce(
			(sum, sourceEntry) => sum + sourceEntry.sessionCount,
			0,
		);
		const leader = [...sourceCounts].sort(
			(leftEntry, rightEntry) =>
				rightEntry.sessionCount - leftEntry.sessionCount ||
				leftEntry.label.localeCompare(rightEntry.label),
		)[0];
		const segments = sourceCounts.flatMap((sourceEntry) =>
			sourceEntry.sessionCount > 0
				? [
						{
							id: `${month}:${sourceEntry.source}`,
							label: sourceEntry.label,
							sessionCount: sourceEntry.sessionCount,
							share: (sourceEntry.sessionCount / totalSessions) * 100,
							source: sourceEntry.source,
						},
					]
				: [],
		);

		if (totalSessions <= 0) {
			return {
				id: `model-month-${month}`,
				label: formatMonthTickLabel(month),
				leaderLabel: "No activity",
				leaderShare: 0,
				segments: [],
				totalSessions: 0,
			};
		}

		return {
			id: `model-month-${month}`,
			label: formatMonthTickLabel(month),
			leaderLabel: leader?.label ?? "No activity",
			leaderShare: Math.round(
				((leader?.sessionCount ?? 0) / totalSessions) * 100,
			),
			segments,
			totalSessions,
		};
	});
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

function buildModelSourceCountsByMonth(
	modelByMonth: readonly MonthlyModelUsage[],
) {
	const rowsByMonth = new Map<
		string,
		Map<WrappedSourceSplit["source"], number>
	>();

	for (const row of modelByMonth) {
		const source = resolveModelStageSource(row.model);
		if (!source || row.session_count <= 0) {
			continue;
		}

		const monthCounts = rowsByMonth.get(row.month) ?? new Map();
		monthCounts.set(source, (monthCounts.get(source) ?? 0) + row.session_count);
		rowsByMonth.set(row.month, monthCounts);
	}

	return rowsByMonth;
}

function getLatestModelStageMonthKeys(months: readonly string[]) {
	const uniqueMonths = [...new Set(months)].sort();
	const latestMonth = uniqueMonths[uniqueMonths.length - 1];
	if (!latestMonth) {
		return [];
	}

	const [yearPart, monthPart] = latestMonth.split("-");
	const monthIndex = Number(monthPart) - 1;
	if (!yearPart || !monthPart || Number.isNaN(monthIndex)) {
		return uniqueMonths.slice(-6);
	}

	const latestDate = new Date(Date.UTC(Number(yearPart), monthIndex, 1));
	if (Number.isNaN(latestDate.getTime())) {
		return uniqueMonths.slice(-6);
	}

	return Array.from({ length: 6 }, (_, index) => {
		const date = new Date(latestDate);
		date.setUTCMonth(date.getUTCMonth() - (5 - index));
		return [
			date.getUTCFullYear().toString(),
			String(date.getUTCMonth() + 1).padStart(2, "0"),
		].join("-");
	});
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
		hasSignal: claudeShare > 0 || codexShare > 0,
		isBalanced: Math.abs(claudeShare - codexShare) <= 8,
		leadingLabel: rankedSegments[0]?.label ?? null,
	};
}

function resolveModelStageSource(
	model: string | null | undefined,
): WrappedSourceSplit["source"] | null {
	const modelLabel = formatModelLabel(model)?.toLowerCase();
	if (!modelLabel) {
		return null;
	}

	if (isSyntheticModelLabel(modelLabel)) {
		return null;
	}

	return modelLabel.includes("claude") ? "claude_code" : "codex";
}

function isSyntheticModelLabel(modelLabel: string) {
	return modelLabel.replaceAll(/[^a-z0-9]+/g, "").includes("synthetic");
}

function formatMonthTickLabel(month: string) {
	const [year, monthPart] = month.split("-");
	if (!year || !monthPart) {
		return month;
	}

	const monthIndex = Number(monthPart) - 1;
	if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
		return month;
	}

	const date = new Date(Date.UTC(Number(year), monthIndex, 1));
	return date.toLocaleString("en", { month: "short" });
}

function formatModelLabel(value: string | null | undefined) {
	const trimmed = value?.trim();
	if (!trimmed || trimmed.toLowerCase() === "unknown") {
		return null;
	}
	return trimmed;
}
