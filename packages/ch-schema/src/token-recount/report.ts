import {
	addTokenClasses,
	buildSessionKey,
	checkStoredTokenInvariants,
	compareWithStored,
	detectForkReplay,
	emptyTokenClasses,
	inclusiveInputTokens,
	subtractTokenClasses,
	toFourTokenClasses,
	totalTokens,
} from "./recount.js";
import type {
	FourTokenClasses,
	RecountIdentity,
	RecountSession,
	SessionRecount,
	StoredTokenRow,
	TokenClassDiff,
	TokenClasses,
	TokenInvariantViolation,
} from "./types.js";

export type SampleReason =
	| "random"
	| "subagent_candidate"
	| "capped_candidate"
	| "codex_reset_candidate"
	| "anchor";

export interface ProviderAnchor extends RecountIdentity {
	features: readonly ProviderAnchorFeature[];
	name: string;
	providerTokens: TokenClasses;
	verifiedAt: string;
	evidenceReference: string;
}

export type ProviderAnchorFeature =
	| "cache_1h"
	| "long_context"
	| "intro_boundary"
	| "multi_model"
	| "subagent_heavy"
	| "capped"
	| "codex_resume";

export const REQUIRED_PROVIDER_ANCHOR_FEATURES: readonly ProviderAnchorFeature[] =
	[
		"cache_1h",
		"long_context",
		"intro_boundary",
		"multi_model",
		"subagent_heavy",
		"capped",
		"codex_resume",
	];

export interface SessionMeasurementInput extends RecountIdentity {
	latestSessionDate: string;
	sampleReasons: readonly SampleReason[];
	recount: SessionRecount;
	stored: StoredTokenRow | undefined;
}

export interface RecountReportInput {
	generatedAt: string;
	target: "local" | "prod";
	organizationId: string;
	lookbackDays: number;
	sampleSizePerSource: number;
	measurements: readonly SessionMeasurementInput[];
	anchors: readonly ProviderAnchor[];
	preflight: PreflightReport;
}

export interface PreflightTable {
	database: string;
	name: string;
	engine: string;
	sortingKey: string;
	primaryKey: string;
	partitionKey: string;
	totalRows: number;
	totalBytes: number;
}

export interface PreflightReport {
	databasePresent: boolean;
	tables: readonly PreflightTable[];
	requiredColumnsPresent: boolean;
	missingColumns: readonly string[];
	skippingIndexes: readonly {
		table: string;
		name: string;
		type: string;
		expression: string;
		granularity: number;
	}[];
	explainEstimates: Readonly<
		Record<string, readonly Record<string, unknown>[]>
	>;
}

export interface ReportTokenClasses extends FourTokenClasses {
	cacheCreation5mInputTokens: number;
	cacheCreation1hInputTokens: number;
	inclusiveInputTokens: number;
	totalTokens: number;
}

export interface StoredReportTokens extends FourTokenClasses {
	inputTokens: number;
	totalTokens: number;
}

export interface SessionMeasurementReport extends RecountIdentity {
	latestSessionDate: string;
	sampleReasons: readonly SampleReason[];
	expected: ReportTokenClasses;
	forkAdjustedExpected: ReportTokenClasses;
	stored: StoredReportTokens | undefined;
	diff: TokenClassDiff | undefined;
	absoluteErrorTokens: number;
	flags: readonly string[];
	invariantViolations: readonly TokenInvariantViolation[];
	diagnostics: SessionRecount["diagnostics"];
}

export interface ClassAggregate {
	expected: number;
	stored: number;
	diff: number;
	absoluteError: number;
	errorPercent: number | undefined;
}

export interface AggregateReport {
	sessionsMeasured: number;
	missingAnalyticsRows: number;
	invariantViolations: number;
	uncachedInputTokens: ClassAggregate;
	cacheReadInputTokens: ClassAggregate;
	cacheCreationInputTokens: ClassAggregate;
	outputTokens: ClassAggregate;
	overallAbsoluteErrorPercent: number | undefined;
	forkAdjustedExpectedTokens: number;
	forkReplayTokens: number;
}

export type FindingState = "gap_observed" | "no_gap" | "not_exercised";

export interface FindingReport {
	id: "H1" | "H2" | "M8" | "M9_INTERLEAVED" | "M9_FORK";
	state: FindingState;
	exercisedSessions: number;
	gapSessions: number;
	tokenDelta: number;
	note: string;
}

export interface AnchorReport extends RecountIdentity {
	features: readonly ProviderAnchorFeature[];
	name: string;
	verifiedAt: string;
	evidenceReference: string;
	providerTokens: ReportTokenClasses;
	recountTokens: ReportTokenClasses | undefined;
	diff: TokenClassDiff | undefined;
	matched: boolean;
	passed: boolean;
}

export interface AnchorSummary {
	configured: number;
	matched: number;
	passed: number;
	hasClaudeAnchor: boolean;
	hasCodexAnchor: boolean;
	acceptanceReady: boolean;
	coveredFeatures: readonly ProviderAnchorFeature[];
	missingRequiredFeatures: readonly ProviderAnchorFeature[];
	anchors: readonly AnchorReport[];
}

export interface RecountReport {
	reportVersion: 1;
	generatedAt: string;
	target: "local" | "prod";
	organizationId: string;
	lookbackDays: number;
	sampleSizePerSource: number;
	preflight: PreflightReport;
	aggregate: AggregateReport;
	findings: readonly FindingReport[];
	anchorSummary: AnchorSummary;
	forkReplayGroups: number;
	forkReplayEvidence: readonly {
		requestFingerprint: string;
		canonicalSessionKey: string;
		replayedSessionKeys: readonly string[];
		replayedTokens: ReportTokenClasses;
	}[];
	sessions: readonly SessionMeasurementReport[];
}

export function buildRecountReport(input: RecountReportInput): RecountReport {
	const recountSessions: RecountSession[] = input.measurements.map(
		(measurement) => ({
			source: measurement.source,
			organizationId: measurement.organizationId,
			userId: measurement.userId,
			sessionId: measurement.sessionId,
			recount: measurement.recount,
		}),
	);
	const replay = detectForkReplay(recountSessions);
	const sessions = input.measurements.map((measurement) =>
		buildSessionMeasurement(
			measurement,
			replay.adjustmentsBySessionKey.get(buildSessionKey(measurement)) ??
				emptyTokenClasses(),
		),
	);

	return {
		reportVersion: 1,
		generatedAt: input.generatedAt,
		target: input.target,
		organizationId: input.organizationId,
		lookbackDays: input.lookbackDays,
		sampleSizePerSource: input.sampleSizePerSource,
		preflight: input.preflight,
		aggregate: buildAggregate(sessions),
		findings: buildFindings(sessions, replay.evidence.length),
		anchorSummary: buildAnchorSummary(input.anchors, sessions),
		forkReplayGroups: replay.evidence.length,
		forkReplayEvidence: replay.evidence.map((evidence) => ({
			requestFingerprint: evidence.requestFingerprint,
			canonicalSessionKey: evidence.canonicalSessionKey,
			replayedSessionKeys: evidence.replayedSessionKeys,
			replayedTokens: toReportTokens(evidence.replayedTokens),
		})),
		sessions,
	};
}

export function renderRecountReportMarkdown(report: RecountReport): string {
	const lines = [
		"# Independent token recount",
		"",
		`Generated: ${report.generatedAt}`,
		`Target: ${report.target}`,
		`Storage organization_id: ${report.organizationId}`,
		`Window: ${report.lookbackDays} days`,
		`Sessions measured: ${report.aggregate.sessionsMeasured}`,
		"",
		"## Aggregate error",
		"",
		"| Class | Recount | Stored | Diff | Absolute error | Error % |",
		"|---|---:|---:|---:|---:|---:|",
		aggregateRow("Uncached input", report.aggregate.uncachedInputTokens),
		aggregateRow("Cache read", report.aggregate.cacheReadInputTokens),
		aggregateRow("Cache creation", report.aggregate.cacheCreationInputTokens),
		aggregateRow("Output", report.aggregate.outputTokens),
		"",
		`Overall absolute error: ${formatPercent(report.aggregate.overallAbsoluteErrorPercent)}`,
		`Missing analytics rows: ${report.aggregate.missingAnalyticsRows}`,
		`Invariant violations: ${report.aggregate.invariantViolations}`,
		`Fork replay groups: ${report.forkReplayGroups}`,
		`Fork replay tokens: ${formatInteger(report.aggregate.forkReplayTokens)}`,
		"",
		"## Audit finding evidence",
		"",
		"| Finding | State | Exercised | Gap rows | Token delta | Note |",
		"|---|---|---:|---:|---:|---|",
		...report.findings.map(
			(finding) =>
				`| ${finding.id} | ${finding.state} | ${finding.exercisedSessions} | ${finding.gapSessions} | ${formatInteger(finding.tokenDelta)} | ${finding.note} |`,
		),
		"",
		"## Provider anchors",
		"",
		`Acceptance ready: ${report.anchorSummary.acceptanceReady ? "yes" : "no"}`,
		`Configured / matched / passed: ${report.anchorSummary.configured} / ${report.anchorSummary.matched} / ${report.anchorSummary.passed}`,
		`Covered billing features: ${report.anchorSummary.coveredFeatures.join(", ") || "none"}`,
		`Missing billing features: ${report.anchorSummary.missingRequiredFeatures.join(", ") || "none"}`,
		"",
		"| Anchor | Source | Matched | Passed | Provider total | Recount total | Evidence |",
		"|---|---|---|---|---:|---:|---|",
		...report.anchorSummary.anchors.map(
			(anchor) =>
				`| ${escapeTableCell(anchor.name)} | ${anchor.source} | ${anchor.matched ? "yes" : "no"} | ${anchor.passed ? "yes" : "no"} | ${formatInteger(anchor.providerTokens.totalTokens)} | ${anchor.recountTokens ? formatInteger(anchor.recountTokens.totalTokens) : "—"} | ${escapeTableCell(anchor.evidenceReference)} |`,
		),
		"",
		"## Fork replay evidence",
		"",
		"| Request fingerprint | Canonical session | Replayed sessions | Replayed tokens |",
		"|---|---|---|---:|",
		...report.forkReplayEvidence.map(
			(evidence) =>
				`| ${evidence.requestFingerprint} | ${escapeTableCell(evidence.canonicalSessionKey)} | ${escapeTableCell(evidence.replayedSessionKeys.join(", "))} | ${formatInteger(evidence.replayedTokens.totalTokens)} |`,
		),
		"",
		"## Per-session diffs",
		"",
		"Positive diffs mean the independent recount is higher than the stored row.",
		"",
		"| Source | Session | Reasons | Recount total | Stored total | Δ uncached | Δ read | Δ create | Δ output | Flags |",
		"|---|---|---|---:|---:|---:|---:|---:|---:|---|",
		...report.sessions.map(renderSessionRow),
		"",
		"## ClickHouse preflight",
		"",
		`rudel database present: ${report.preflight.databasePresent ? "yes" : "no"}`,
		`Required columns present: ${report.preflight.requiredColumnsPresent ? "yes" : "no"}`,
		`Missing columns: ${report.preflight.missingColumns.join(", ") || "none"}`,
		`Skipping indexes found: ${report.preflight.skippingIndexes.length}`,
		"",
		"| Table | Engine | ORDER BY | Rows | Bytes |",
		"|---|---|---|---:|---:|",
		...report.preflight.tables.map(
			(table) =>
				`| ${table.database}.${table.name} | ${table.engine} | ${escapeTableCell(table.sortingKey)} | ${formatInteger(table.totalRows)} | ${formatInteger(table.totalBytes)} |`,
		),
		"",
	];
	return lines.join("\n");
}

function buildSessionMeasurement(
	measurement: SessionMeasurementInput,
	replayAdjustment: TokenClasses,
): SessionMeasurementReport {
	const expected = toReportTokens(measurement.recount.tokens);
	const forkAdjustedExpected = toReportTokens(
		subtractTokenClasses(measurement.recount.tokens, replayAdjustment),
	);
	const stored = measurement.stored
		? toStoredReportTokens(measurement.stored)
		: undefined;
	const diff = measurement.stored
		? compareWithStored(measurement.recount, measurement.stored)
		: undefined;

	return {
		source: measurement.source,
		organizationId: measurement.organizationId,
		userId: measurement.userId,
		sessionId: measurement.sessionId,
		latestSessionDate: measurement.latestSessionDate,
		sampleReasons: measurement.sampleReasons,
		expected,
		forkAdjustedExpected,
		stored,
		diff,
		absoluteErrorTokens: diff ? sumAbsoluteDiff(diff) : expected.totalTokens,
		flags: buildFlags(measurement, replayAdjustment, diff),
		invariantViolations: measurement.stored
			? checkStoredTokenInvariants(measurement.stored)
			: [],
		diagnostics: measurement.recount.diagnostics,
	};
}

function buildAggregate(
	sessions: readonly SessionMeasurementReport[],
): AggregateReport {
	const expected = sumReportTokens(sessions.map((session) => session.expected));
	const stored = sumStoredTokens(
		sessions.flatMap((session) => (session.stored ? [session.stored] : [])),
	);
	const absolute = sumAbsoluteClassErrors(sessions);
	const forkAdjusted = sumReportTokens(
		sessions.map((session) => session.forkAdjustedExpected),
	);
	const aggregate = {
		uncachedInputTokens: classAggregate(
			expected.uncachedInputTokens,
			stored.uncachedInputTokens,
			absolute.uncachedInputTokens,
		),
		cacheReadInputTokens: classAggregate(
			expected.cacheReadInputTokens,
			stored.cacheReadInputTokens,
			absolute.cacheReadInputTokens,
		),
		cacheCreationInputTokens: classAggregate(
			expected.cacheCreationInputTokens,
			stored.cacheCreationInputTokens,
			absolute.cacheCreationInputTokens,
		),
		outputTokens: classAggregate(
			expected.outputTokens,
			stored.outputTokens,
			absolute.outputTokens,
		),
	};
	const expectedTotal =
		expected.uncachedInputTokens +
		expected.cacheReadInputTokens +
		expected.cacheCreationInputTokens +
		expected.outputTokens;
	const absoluteTotal =
		absolute.uncachedInputTokens +
		absolute.cacheReadInputTokens +
		absolute.cacheCreationInputTokens +
		absolute.outputTokens;

	return {
		sessionsMeasured: sessions.length,
		missingAnalyticsRows: sessions.filter((session) => !session.stored).length,
		invariantViolations: sessions.reduce(
			(total, session) => total + session.invariantViolations.length,
			0,
		),
		...aggregate,
		overallAbsoluteErrorPercent: percentage(absoluteTotal, expectedTotal),
		forkAdjustedExpectedTokens: forkAdjusted.totalTokens,
		forkReplayTokens: Math.max(
			0,
			expected.totalTokens - forkAdjusted.totalTokens,
		),
	};
}

function buildFindings(
	sessions: readonly SessionMeasurementReport[],
	forkReplayGroups: number,
): readonly FindingReport[] {
	const h1Exercised = sessions.filter((session) =>
		session.flags.includes("has_subagent_tokens"),
	);
	const h1Gaps = h1Exercised.filter((session) =>
		session.flags.includes("H1_subagent_gap"),
	);
	const h2Exercised = sessions.filter(
		(session) => session.diagnostics.currentMvWouldCap,
	);
	const h2Gaps = h2Exercised.filter((session) =>
		session.flags.includes("H2_capped_zero"),
	);
	const m8Exercised = sessions.filter(
		(session) => session.diagnostics.codexResetSegments > 0,
	);
	const m8Gaps = m8Exercised.filter((session) =>
		session.flags.includes("M8_codex_reset_gap"),
	);
	const m9InterleavedExercised = sessions.filter(
		(session) => session.diagnostics.interleavedDuplicateUsageLines > 0,
	);
	const m9InterleavedGaps = m9InterleavedExercised.filter((session) =>
		session.flags.includes("M9_interleaved_dedupe_gap"),
	);
	const replayGapSessions = sessions.filter((session) =>
		session.flags.includes("M9_fork_replay"),
	);

	return [
		finding(
			"H1",
			h1Exercised,
			h1Gaps,
			"Subagent token classes are independently recounted.",
		),
		finding(
			"H2",
			h2Exercised,
			h2Gaps,
			"Sessions over the current MV cap are still fully parsed by the harness.",
		),
		finding(
			"M8",
			m8Exercised,
			m8Gaps,
			"Codex cumulative counters are summed across monotonic reset segments.",
		),
		finding(
			"M9_INTERLEAVED",
			m9InterleavedExercised,
			m9InterleavedGaps,
			"Non-adjacent repeats are globally deduped within each transcript.",
		),
		{
			id: "M9_FORK",
			state: forkReplayGroups > 0 ? "gap_observed" : "not_exercised",
			exercisedSessions: replayGapSessions.length,
			gapSessions: replayGapSessions.length,
			tokenDelta: replayGapSessions.reduce(
				(total, session) =>
					total +
					(session.expected.totalTokens -
						session.forkAdjustedExpected.totalTokens),
				0,
			),
			note: "Cross-session request IDs are compared within the sampled owner/user scope.",
		},
	];
}

function buildAnchorSummary(
	anchors: readonly ProviderAnchor[],
	sessions: readonly SessionMeasurementReport[],
): AnchorSummary {
	const sessionsByKey = new Map(
		sessions.map((session) => [buildSessionKey(session), session]),
	);
	const reports = anchors.map((anchor) => {
		const session = sessionsByKey.get(buildSessionKey(anchor));
		const recountTokens = session?.expected;
		const diff = recountTokens
			? diffReportTokens(recountTokens, toReportTokens(anchor.providerTokens))
			: undefined;
		const passed = diff ? sumAbsoluteDiff(diff) === 0 : false;
		return {
			features: anchor.features,
			source: anchor.source,
			organizationId: anchor.organizationId,
			userId: anchor.userId,
			sessionId: anchor.sessionId,
			name: anchor.name,
			verifiedAt: anchor.verifiedAt,
			evidenceReference: anchor.evidenceReference,
			providerTokens: toReportTokens(anchor.providerTokens),
			recountTokens,
			diff,
			matched: Boolean(session),
			passed,
		};
	});
	const hasClaudeAnchor = reports.some(
		(anchor) => anchor.source === "claude_code" && anchor.passed,
	);
	const hasCodexAnchor = reports.some(
		(anchor) => anchor.source === "codex" && anchor.passed,
	);
	const passed = reports.filter((anchor) => anchor.passed).length;
	const coveredFeatures = REQUIRED_PROVIDER_ANCHOR_FEATURES.filter((feature) =>
		reports.some(
			(anchor) => anchor.passed && anchor.features.includes(feature),
		),
	);
	const missingRequiredFeatures = REQUIRED_PROVIDER_ANCHOR_FEATURES.filter(
		(feature) => !coveredFeatures.includes(feature),
	);

	return {
		configured: reports.length,
		matched: reports.filter((anchor) => anchor.matched).length,
		passed,
		hasClaudeAnchor,
		hasCodexAnchor,
		coveredFeatures,
		missingRequiredFeatures,
		acceptanceReady:
			reports.length >= 2 &&
			passed === reports.length &&
			hasClaudeAnchor &&
			hasCodexAnchor,
		anchors: reports,
	};
}

function buildFlags(
	measurement: SessionMeasurementInput,
	replayAdjustment: TokenClasses,
	diff: TokenClassDiff | undefined,
): readonly string[] {
	const flags: string[] = [];
	const subagentTotal = totalTokens(measurement.recount.subagentTokens);
	if (subagentTotal > 0) flags.push("has_subagent_tokens");
	if (subagentTotal > 0 && hasPositiveDiff(diff)) flags.push("H1_subagent_gap");
	if (
		measurement.recount.diagnostics.currentMvWouldCap &&
		totalTokens(measurement.recount.tokens) > 0 &&
		measurement.stored?.totalTokens === 0
	) {
		flags.push("H2_capped_zero");
	}
	if (
		measurement.recount.diagnostics.codexResetSegments > 0 &&
		diff &&
		sumAbsoluteDiff(diff) > 0
	) {
		flags.push("M8_codex_reset_gap");
	}
	if (
		measurement.recount.diagnostics.interleavedDuplicateUsageLines > 0 &&
		hasNegativeDiff(diff)
	) {
		flags.push("M9_interleaved_dedupe_gap");
	}
	if (totalTokens(replayAdjustment) > 0) flags.push("M9_fork_replay");
	if (!measurement.stored) flags.push("missing_analytics_row");
	return flags;
}

function finding(
	id: FindingReport["id"],
	exercised: readonly SessionMeasurementReport[],
	gaps: readonly SessionMeasurementReport[],
	note: string,
): FindingReport {
	return {
		id,
		state:
			exercised.length === 0
				? "not_exercised"
				: gaps.length > 0
					? "gap_observed"
					: "no_gap",
		exercisedSessions: exercised.length,
		gapSessions: gaps.length,
		tokenDelta: gaps.reduce(
			(total, session) => total + Math.abs(sumSignedDiff(session.diff)),
			0,
		),
		note,
	};
}

function toReportTokens(tokens: TokenClasses): ReportTokenClasses {
	return {
		...toFourTokenClasses(tokens),
		cacheCreation5mInputTokens: tokens.cacheCreation5mInputTokens,
		cacheCreation1hInputTokens: tokens.cacheCreation1hInputTokens,
		inclusiveInputTokens: inclusiveInputTokens(tokens),
		totalTokens: totalTokens(tokens),
	};
}

function toStoredReportTokens(stored: StoredTokenRow): StoredReportTokens {
	return {
		uncachedInputTokens: Math.max(
			0,
			stored.inputTokens -
				stored.cacheReadInputTokens -
				stored.cacheCreationInputTokens,
		),
		cacheReadInputTokens: stored.cacheReadInputTokens,
		cacheCreationInputTokens: stored.cacheCreationInputTokens,
		outputTokens: stored.outputTokens,
		inputTokens: stored.inputTokens,
		totalTokens: stored.totalTokens,
	};
}

function diffReportTokens(
	left: ReportTokenClasses,
	right: ReportTokenClasses,
): TokenClassDiff {
	return {
		uncachedInputTokens: left.uncachedInputTokens - right.uncachedInputTokens,
		cacheReadInputTokens:
			left.cacheReadInputTokens - right.cacheReadInputTokens,
		cacheCreationInputTokens:
			left.cacheCreationInputTokens - right.cacheCreationInputTokens,
		outputTokens: left.outputTokens - right.outputTokens,
	};
}

function sumReportTokens(
	rows: readonly ReportTokenClasses[],
): ReportTokenClasses {
	const tokenClasses = rows.reduce<TokenClasses>(
		(total, row) =>
			addTokenClasses(total, {
				uncachedInputTokens: row.uncachedInputTokens,
				cacheReadInputTokens: row.cacheReadInputTokens,
				cacheCreation5mInputTokens: row.cacheCreation5mInputTokens,
				cacheCreation1hInputTokens: row.cacheCreation1hInputTokens,
				outputTokens: row.outputTokens,
			}),
		emptyTokenClasses(),
	);
	return toReportTokens(tokenClasses);
}

function sumStoredTokens(
	rows: readonly StoredReportTokens[],
): StoredReportTokens {
	return rows.reduce<StoredReportTokens>(
		(total, row) => ({
			uncachedInputTokens: total.uncachedInputTokens + row.uncachedInputTokens,
			cacheReadInputTokens:
				total.cacheReadInputTokens + row.cacheReadInputTokens,
			cacheCreationInputTokens:
				total.cacheCreationInputTokens + row.cacheCreationInputTokens,
			outputTokens: total.outputTokens + row.outputTokens,
			inputTokens: total.inputTokens + row.inputTokens,
			totalTokens: total.totalTokens + row.totalTokens,
		}),
		{
			uncachedInputTokens: 0,
			cacheReadInputTokens: 0,
			cacheCreationInputTokens: 0,
			outputTokens: 0,
			inputTokens: 0,
			totalTokens: 0,
		},
	);
}

function sumAbsoluteClassErrors(
	sessions: readonly SessionMeasurementReport[],
): FourTokenClasses {
	return sessions.reduce<FourTokenClasses>(
		(total, session) => ({
			uncachedInputTokens:
				total.uncachedInputTokens +
				Math.abs(
					session.diff?.uncachedInputTokens ??
						session.expected.uncachedInputTokens,
				),
			cacheReadInputTokens:
				total.cacheReadInputTokens +
				Math.abs(
					session.diff?.cacheReadInputTokens ??
						session.expected.cacheReadInputTokens,
				),
			cacheCreationInputTokens:
				total.cacheCreationInputTokens +
				Math.abs(
					session.diff?.cacheCreationInputTokens ??
						session.expected.cacheCreationInputTokens,
				),
			outputTokens:
				total.outputTokens +
				Math.abs(session.diff?.outputTokens ?? session.expected.outputTokens),
		}),
		{
			uncachedInputTokens: 0,
			cacheReadInputTokens: 0,
			cacheCreationInputTokens: 0,
			outputTokens: 0,
		},
	);
}

function classAggregate(
	expected: number,
	stored: number,
	absoluteError: number,
): ClassAggregate {
	return {
		expected,
		stored,
		diff: expected - stored,
		absoluteError,
		errorPercent: percentage(absoluteError, expected),
	};
}

function percentage(
	numerator: number,
	denominator: number,
): number | undefined {
	return denominator === 0 ? undefined : (numerator / denominator) * 100;
}

function sumAbsoluteDiff(diff: TokenClassDiff): number {
	return (
		Math.abs(diff.uncachedInputTokens) +
		Math.abs(diff.cacheReadInputTokens) +
		Math.abs(diff.cacheCreationInputTokens) +
		Math.abs(diff.outputTokens)
	);
}

function sumSignedDiff(diff: TokenClassDiff | undefined): number {
	return diff
		? diff.uncachedInputTokens +
				diff.cacheReadInputTokens +
				diff.cacheCreationInputTokens +
				diff.outputTokens
		: 0;
}

function hasPositiveDiff(diff: TokenClassDiff | undefined): boolean {
	return diff
		? diff.uncachedInputTokens > 0 ||
				diff.cacheReadInputTokens > 0 ||
				diff.cacheCreationInputTokens > 0 ||
				diff.outputTokens > 0
		: false;
}

function hasNegativeDiff(diff: TokenClassDiff | undefined): boolean {
	return diff
		? diff.uncachedInputTokens < 0 ||
				diff.cacheReadInputTokens < 0 ||
				diff.cacheCreationInputTokens < 0 ||
				diff.outputTokens < 0
		: false;
}

function aggregateRow(label: string, aggregate: ClassAggregate): string {
	return `| ${label} | ${formatInteger(aggregate.expected)} | ${formatInteger(aggregate.stored)} | ${formatSignedInteger(aggregate.diff)} | ${formatInteger(aggregate.absoluteError)} | ${formatPercent(aggregate.errorPercent)} |`;
}

function renderSessionRow(session: SessionMeasurementReport): string {
	return `| ${session.source} | ${escapeTableCell(session.sessionId)} | ${session.sampleReasons.join(", ")} | ${formatInteger(session.expected.totalTokens)} | ${session.stored ? formatInteger(session.stored.totalTokens) : "—"} | ${formatSignedInteger(session.diff?.uncachedInputTokens)} | ${formatSignedInteger(session.diff?.cacheReadInputTokens)} | ${formatSignedInteger(session.diff?.cacheCreationInputTokens)} | ${formatSignedInteger(session.diff?.outputTokens)} | ${session.flags.join(", ") || "—"} |`;
}

function formatInteger(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

function formatSignedInteger(value: number | undefined): string {
	if (value === undefined) return "—";
	return `${value > 0 ? "+" : ""}${formatInteger(value)}`;
}

function formatPercent(value: number | undefined): string {
	return value === undefined ? "—" : `${value.toFixed(4)}%`;
}

function escapeTableCell(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
