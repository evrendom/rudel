import {
	type IngestSessionInput,
	IngestSessionInputSchema,
} from "@rudel/api-routes";
import {
	extractUsageEvents,
	type UsageEventSource,
	type UsageExtractionDiagnostic,
} from "@rudel/usage-events";
import {
	type ClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { computeIngestContentHash } from "../lib/ingest-content-hash.js";
import {
	listUsageBackfillOwnershipStates,
	recordUsageBackfillReceipt,
	reserveUsageBackfillGeneration,
	type UsageBackfillOwnershipState,
	UsageExtractionSupersededError,
} from "./session-ownership.service.js";
import {
	hasMatchingUsageExtractionReceipt,
	writeUsageExtraction,
} from "./usage-event-ingest.service.js";

const DEFAULT_MAX_SESSION_BYTES = 512 * 1024 * 1024;
const MAX_CONFIGURED_SESSION_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_ISSUES = 100;
const RAW_BATCH_TARGET_BYTES = 128 * 1024 * 1024;
const RAW_BATCH_MAX_ROWS = 64;
const SOURCE_SCAN_SETTINGS = {
	max_bytes_to_read: String(16 * 1024 * 1024 * 1024),
	max_execution_time: 300,
	max_rows_to_read: "5000000",
	result_overflow_mode: "throw",
} as const;

export interface UsageEventsBackfillOptions {
	cutoff: Date;
	maxSessionBytes?: number;
	maxSessions: number;
	onProgress?: (progress: UsageEventsBackfillProgress) => void;
	organizationId?: string;
}

export interface UsageEventsBackfillProgress {
	batchCount: number;
	completedBatchCount: number;
	processedCandidateCount: number;
	totalCandidateCount: number;
}

export type UsageEventsBackfillIssueCode =
	| "consistency_repair_required"
	| "extraction_incomplete"
	| "missing_ownership"
	| "missing_raw_snapshot"
	| "ownership_conflict"
	| "oversized_snapshot"
	| "snapshot_superseded"
	| "unexpected_error";

export interface UsageEventsBackfillIssue {
	code: UsageEventsBackfillIssueCode;
	diagnostics: readonly string[];
	sessionId: string;
	source: UsageEventSource;
}

export interface UsageEventsBackfillResult {
	alreadyCompleteCount: number;
	candidateCount: number;
	completeCount: number;
	completedCount: number;
	cutoff: string;
	failedCount: number;
	incompleteCount: number;
	issues: readonly UsageEventsBackfillIssue[];
	oversizedCount: number;
	rawSessionCount: number;
	skippedNoUsageCount: number;
	status: "completed" | "preview";
	supersededCount: number;
	wouldWriteCount: number;
}

interface RawSessionCandidate {
	contentBytes: number;
	ingestedAt: string;
	organizationId: string;
	sessionDate: string;
	sessionId: string;
	source: UsageEventSource;
	userId: string;
}

interface RawSessionCandidateRow {
	latest_content_bytes: number;
	latest_ingested_at: string;
	latest_session_date: string;
	latest_user_id: string;
	organization_id: string;
	raw_session_count: number;
	session_id: string;
}

interface RawSessionCandidateCensus {
	candidates: readonly RawSessionCandidate[];
	rawSessionCount: number;
}

interface RawSessionRow {
	content: string;
	filter_version: number;
	git_branch: string | null;
	git_remote: string;
	git_sha: string | null;
	raw_ingested_at: string;
	organization_id: string;
	package_name: string;
	package_type: string;
	project_path: string;
	raw_session_date: string;
	session_id: string;
	subagents: Record<string, string>;
	tag: string | null;
	user_id: string;
}

interface RawSessionBatch {
	candidates: readonly RawSessionCandidate[];
	contentBytes: number;
	monthEnd: string;
	monthStart: string;
}

type CandidateResult =
	| { status: "already_complete" }
	| { status: "completed" }
	| { status: "would_write" }
	| { status: "superseded"; issue: UsageEventsBackfillIssue }
	| { status: "failed"; issue: UsageEventsBackfillIssue };

export async function previewUsageEventsBackfill(
	executor: ClickHouseExecutor,
	options: UsageEventsBackfillOptions,
): Promise<UsageEventsBackfillResult> {
	return runUsageEventsBackfill(executor, options, false);
}

export async function backfillUsageEvents(
	executor: ClickHouseExecutor,
	options: UsageEventsBackfillOptions,
): Promise<UsageEventsBackfillResult> {
	return runUsageEventsBackfill(executor, options, true);
}

async function runUsageEventsBackfill(
	executor: ClickHouseExecutor,
	options: UsageEventsBackfillOptions,
	execute: boolean,
): Promise<UsageEventsBackfillResult> {
	validateOptions(options);
	const census = await listRawSessionCandidates(executor, options);
	const candidates = census.candidates;
	const ownershipBySession = await loadOwnershipStates(
		candidates,
		options.maxSessions,
	);
	const result: UsageEventsBackfillResult = {
		alreadyCompleteCount: 0,
		candidateCount: candidates.length,
		completeCount: 0,
		completedCount: 0,
		cutoff: options.cutoff.toISOString(),
		failedCount: 0,
		incompleteCount: 0,
		issues: [],
		oversizedCount: 0,
		rawSessionCount: census.rawSessionCount,
		skippedNoUsageCount: census.rawSessionCount - candidates.length,
		status: execute ? "completed" : "preview",
		supersededCount: 0,
		wouldWriteCount: 0,
	};

	const readableCandidates: RawSessionCandidate[] = [];
	const maxSessionBytes = options.maxSessionBytes ?? DEFAULT_MAX_SESSION_BYTES;
	for (const candidate of candidates) {
		const ownership = ownershipBySession.get(candidateKey(candidate));
		if (candidate.contentBytes > maxSessionBytes) {
			applyCandidateResult(result, {
				status: "failed",
				issue: issue(candidate, "oversized_snapshot", [
					`${candidate.contentBytes} > ${maxSessionBytes}`,
				]),
			});
			continue;
		}
		if (!ownership) {
			applyCandidateResult(result, {
				status: "failed",
				issue: issue(candidate, "missing_ownership"),
			});
			continue;
		}
		if (ownership.userId !== candidate.userId) {
			applyCandidateResult(result, {
				status: "failed",
				issue: issue(candidate, "ownership_conflict"),
			});
			continue;
		}
		readableCandidates.push(candidate);
	}

	const batches = createRawSessionBatches(readableCandidates);
	let processedCandidateCount = candidates.length - readableCandidates.length;
	for (const [batchIndex, batch] of batches.entries()) {
		const rawRows = await readRawSessions(
			executor,
			batch,
			options.cutoff,
			maxSessionBytes,
		);
		const rawBySession = new Map(
			rawRows.map((raw) => [rawSessionKey(raw), raw]),
		);
		for (const candidate of batch.candidates) {
			const candidateResult = await processCandidate(
				executor,
				candidate,
				rawBySession.get(candidateKey(candidate)),
				ownershipBySession.get(candidateKey(candidate)),
				options,
				execute,
			).catch(
				(error: unknown): CandidateResult => ({
					status: "failed",
					issue: issue(candidate, "unexpected_error", [describeError(error)]),
				}),
			);
			applyCandidateResult(result, candidateResult);
		}
		processedCandidateCount += batch.candidates.length;
		options.onProgress?.({
			batchCount: batches.length,
			completedBatchCount: batchIndex + 1,
			processedCandidateCount,
			totalCandidateCount: candidates.length,
		});
	}

	return result;
}

async function processCandidate(
	executor: ClickHouseExecutor,
	candidate: RawSessionCandidate,
	raw: RawSessionRow | undefined,
	ownership: UsageBackfillOwnershipState | undefined,
	options: UsageEventsBackfillOptions,
	execute: boolean,
): Promise<CandidateResult> {
	if (!raw) {
		return {
			status: "failed",
			issue: issue(candidate, "missing_raw_snapshot"),
		};
	}
	const input = buildIngestInput(candidate.source, raw);
	const contentSha256 = computeIngestContentHash(input);
	if (!ownership) {
		return {
			status: "failed",
			issue: issue(candidate, "missing_ownership"),
		};
	}
	if (ownership.userId !== candidate.userId) {
		return {
			status: "failed",
			issue: issue(candidate, "ownership_conflict"),
		};
	}
	if (
		ownership.lastContentSha256 !== null &&
		ownership.lastContentSha256 !== contentSha256
	) {
		return {
			status: "superseded",
			issue: issue(candidate, "snapshot_superseded"),
		};
	}
	if (hasMatchingUsageExtractionReceipt(ownership, contentSha256)) {
		return { status: "already_complete" };
	}

	const extraction = extractUsageEvents({
		content: input.content,
		organizationId: candidate.organizationId,
		sessionId: candidate.sessionId,
		source: candidate.source,
		subagents: Object.fromEntries(
			(input.subagents ?? []).map((subagent) => [
				subagent.agentId,
				subagent.content,
			]),
		),
		userId: candidate.userId,
	});
	if (!execute) {
		if (extraction.status === "incomplete") {
			return {
				status: "failed",
				issue: issue(
					candidate,
					"extraction_incomplete",
					diagnosticCodes(extraction.diagnostics),
				),
			};
		}
		return { status: "would_write" };
	}

	const generation = await reserveUsageBackfillGeneration(
		candidate.organizationId,
		candidate.sessionId,
		candidate.userId,
		contentSha256,
		options.cutoff,
	);
	if (generation === null) {
		return {
			status: "superseded",
			issue: issue(candidate, "snapshot_superseded"),
		};
	}
	const write = await writeUsageExtraction(executor, {
		contentSha256,
		extraction,
		filterVersion: input.filter_version ?? 0,
		generation,
		ingestedAt: parseClickHouseUtc(raw.raw_ingested_at),
		organizationId: candidate.organizationId,
		replaceAbsentEvents: extraction.status === "complete",
		sessionDate: parseClickHouseUtc(raw.raw_session_date),
		sessionId: candidate.sessionId,
		source: candidate.source,
		userId: candidate.userId,
	});
	if (write.consistency.status === "repair_required") {
		return {
			status: "failed",
			issue: issue(candidate, "consistency_repair_required"),
		};
	}
	if (extraction.status === "incomplete") {
		return {
			status: "failed",
			issue: issue(
				candidate,
				"extraction_incomplete",
				diagnosticCodes(extraction.diagnostics),
			),
		};
	}
	try {
		await recordUsageBackfillReceipt(
			candidate.organizationId,
			candidate.sessionId,
			contentSha256,
			{
				checksum: extraction.receipt.checksum,
				diagnostics: JSON.stringify(extraction.diagnostics),
				eventCount: extraction.receipt.eventCount,
				extractionVersion: extraction.receipt.extractionVersion,
				eventIdentityVersion: extraction.receipt.eventIdentityVersion,
				generation,
				modelRateCardVersion: extraction.receipt.modelRateCardVersion,
			},
		);
	} catch (error) {
		if (error instanceof UsageExtractionSupersededError) {
			return {
				status: "superseded",
				issue: issue(candidate, "snapshot_superseded"),
			};
		}
		throw error;
	}
	return { status: "completed" };
}

async function listRawSessionCandidates(
	executor: ClickHouseExecutor,
	options: UsageEventsBackfillOptions,
): Promise<RawSessionCandidateCensus> {
	const [claude, codex] = await Promise.all([
		listSourceCandidates(executor, "claude_code", options),
		listSourceCandidates(executor, "codex", options),
	]);
	const candidates = [...claude.candidates, ...codex.candidates].sort(
		compareCandidates,
	);
	if (candidates.length > options.maxSessions) {
		throw new Error(
			`Usage-event backfill found more than --max-sessions=${options.maxSessions}. Increase the explicit bound after reviewing the candidate count.`,
		);
	}
	const rawSessionCount = claude.rawSessionCount + codex.rawSessionCount;
	if (rawSessionCount > options.maxSessions) {
		throw new Error(
			`Usage-event backfill raw census exceeds --max-sessions=${options.maxSessions} (${rawSessionCount} sessions). Increase the explicit bound after reviewing table growth.`,
		);
	}
	return {
		candidates,
		rawSessionCount,
	};
}

async function listSourceCandidates(
	executor: ClickHouseExecutor,
	source: UsageEventSource,
	options: UsageEventsBackfillOptions,
): Promise<RawSessionCandidateCensus> {
	const table = getRawTable(source);
	const organizationFilter = options.organizationId
		? "AND organization_id = {organizationId:String}"
		: "";
	const subagentBytes =
		source === "claude_code"
			? "+ arraySum(arrayMap(value -> length(value), mapValues(subagents)))"
			: "";
	const hasUsage =
		source === "claude_code"
			? `position(content, '"usage"') > 0
				OR arrayExists(value -> position(value, '"usage"') > 0, mapValues(subagents))`
			: `position(content, '"last_token_usage"') > 0
				OR position(content, '"token_count"') > 0`;
	const rows = await executor.query<RawSessionCandidateRow>({
		clickhouse_settings: {
			...SOURCE_SCAN_SETTINGS,
			max_result_rows: String(options.maxSessions + 1),
		},
		query: `
			SELECT
				organization_id,
				session_id,
				latest_user_id,
				latest_session_date,
				latest_ingested_at,
				latest_content_bytes,
				raw_session_count
			FROM (
				SELECT *, count() OVER () AS raw_session_count
				FROM (
					SELECT
						organization_id,
						session_id,
						argMax(user_id, ingested_at) AS latest_user_id,
						toString(argMax(session_date, ingested_at)) AS latest_session_date,
						toString(max(ingested_at)) AS latest_ingested_at,
						argMax(length(content) ${subagentBytes}, ingested_at) AS latest_content_bytes,
						argMax(toUInt8(${hasUsage}), ingested_at) AS has_usage
					FROM ${table}
					WHERE ingested_at <= {cutoff:DateTime64(3, 'UTC')}
						${organizationFilter}
					GROUP BY organization_id, session_id
				)
			)
			WHERE has_usage = 1
			ORDER BY organization_id, session_id
			LIMIT {candidateLimit:UInt32}
		`,
		query_params: {
			candidateLimit: options.maxSessions + 1,
			cutoff: toClickHouseTimestamp(options.cutoff),
			organizationId: options.organizationId ?? "",
		},
	});
	const candidates = rows.map((row) => ({
		contentBytes: Number(row.latest_content_bytes),
		ingestedAt: row.latest_ingested_at,
		organizationId: row.organization_id,
		sessionDate: row.latest_session_date,
		sessionId: row.session_id,
		source,
		userId: row.latest_user_id,
	}));
	return {
		candidates,
		rawSessionCount:
			rows[0]?.raw_session_count ??
			(await countSourceSessions(executor, source, options)),
	};
}

async function countSourceSessions(
	executor: ClickHouseExecutor,
	source: UsageEventSource,
	options: UsageEventsBackfillOptions,
): Promise<number> {
	const table = getRawTable(source);
	const organizationFilter = options.organizationId
		? "AND organization_id = {organizationId:String}"
		: "";
	const [row] = await executor.query<{ session_count: number }>({
		clickhouse_settings: {
			...SOURCE_SCAN_SETTINGS,
			max_result_rows: "1",
		},
		query: `
			SELECT count() AS session_count
			FROM (
				SELECT organization_id, session_id
				FROM ${table}
				WHERE ingested_at <= {cutoff:DateTime64(3, 'UTC')}
					${organizationFilter}
				GROUP BY organization_id, session_id
			)
		`,
		query_params: {
			cutoff: toClickHouseTimestamp(options.cutoff),
			organizationId: options.organizationId ?? "",
		},
	});
	return row?.session_count ?? 0;
}

async function loadOwnershipStates(
	candidates: readonly RawSessionCandidate[],
	maxSessions: number,
): Promise<Map<string, UsageBackfillOwnershipState>> {
	const organizationIds = [
		...new Set(candidates.map((candidate) => candidate.organizationId)),
	].sort();
	const ownershipBySession = new Map<string, UsageBackfillOwnershipState>();
	for (const organizationId of organizationIds) {
		const states = await listUsageBackfillOwnershipStates({
			maxRows: maxSessions + 1,
			organizationId,
		});
		if (states.length > maxSessions) {
			throw new Error(
				`Organization ${organizationId} has more than --max-sessions=${maxSessions} ownership rows. Increase the explicit bound after reviewing table growth.`,
			);
		}
		for (const state of states) {
			ownershipBySession.set(
				`${state.organizationId}\u0000${state.sessionId}`,
				state,
			);
		}
	}
	return ownershipBySession;
}

function createRawSessionBatches(
	candidates: readonly RawSessionCandidate[],
): readonly RawSessionBatch[] {
	const batches: RawSessionBatch[] = [];
	let currentCandidates: RawSessionCandidate[] = [];
	let currentBytes = 0;
	let currentMonth = "";

	for (const candidate of candidates) {
		const first = currentCandidates[0];
		const groupChanged =
			first !== undefined &&
			(first.source !== candidate.source ||
				first.organizationId !== candidate.organizationId ||
				currentMonth !== candidate.sessionDate.slice(0, 7));
		const batchFull =
			currentCandidates.length >= RAW_BATCH_MAX_ROWS ||
			(currentCandidates.length > 0 &&
				currentBytes + candidate.contentBytes > RAW_BATCH_TARGET_BYTES);
		if (groupChanged || batchFull) {
			batches.push({
				candidates: currentCandidates,
				contentBytes: currentBytes,
				...monthBounds(currentMonth),
			});
			currentCandidates = [];
			currentBytes = 0;
		}
		if (currentCandidates.length === 0) {
			currentMonth = candidate.sessionDate.slice(0, 7);
		}
		currentCandidates.push(candidate);
		currentBytes += candidate.contentBytes;
	}

	if (currentCandidates.length > 0) {
		batches.push({
			candidates: currentCandidates,
			contentBytes: currentBytes,
			...monthBounds(currentMonth),
		});
	}
	return batches;
}

async function readRawSessions(
	executor: ClickHouseExecutor,
	batch: RawSessionBatch,
	cutoff: Date,
	maxSessionBytes: number,
): Promise<readonly RawSessionRow[]> {
	const first = batch.candidates[0];
	if (!first) return [];
	const table = getRawTable(first.source);
	const subagents =
		first.source === "claude_code"
			? "subagents"
			: "CAST(map(), 'Map(String, String)') AS subagents";
	const resultByteLimit = Math.max(
		16 * 1024 * 1024,
		Math.min(maxSessionBytes * 2, batch.contentBytes * 2),
	);
	return executor.query<RawSessionRow>({
		clickhouse_settings: {
			max_bytes_to_read: SOURCE_SCAN_SETTINGS.max_bytes_to_read,
			max_execution_time: 180,
			max_result_bytes: String(resultByteLimit),
			max_result_rows: String(batch.candidates.length),
			max_rows_to_read: SOURCE_SCAN_SETTINGS.max_rows_to_read,
			result_overflow_mode: "throw",
		},
		query: `
			SELECT
				organization_id,
				user_id,
				session_id,
				toString(session_date) AS raw_session_date,
				project_path,
				git_remote,
				package_name,
				package_type,
				content,
				filter_version,
				toString(ingested_at) AS raw_ingested_at,
				git_branch,
				git_sha,
				tag,
				${subagents}
			FROM ${table}
			WHERE organization_id = {organizationId:String}
				AND session_date >= {monthStart:DateTime64(3, 'UTC')}
				AND session_date < {monthEnd:DateTime64(3, 'UTC')}
				AND session_id IN {sessionIds:Array(String)}
				AND ingested_at <= {cutoff:DateTime64(3, 'UTC')}
			ORDER BY organization_id, session_id, ingested_at DESC
			LIMIT 1 BY organization_id, session_id
			LIMIT {batchLimit:UInt32}
		`,
		query_params: {
			batchLimit: batch.candidates.length,
			cutoff: toClickHouseTimestamp(cutoff),
			monthEnd: batch.monthEnd,
			monthStart: batch.monthStart,
			organizationId: first.organizationId,
			sessionIds: batch.candidates.map((candidate) => candidate.sessionId),
		},
	});
}

function buildIngestInput(
	source: UsageEventSource,
	raw: RawSessionRow,
): IngestSessionInput {
	return IngestSessionInputSchema.parse({
		content: raw.content,
		filter_version: raw.filter_version,
		gitBranch: raw.git_branch ?? undefined,
		gitRemote: raw.git_remote || undefined,
		gitSha: raw.git_sha ?? undefined,
		packageName: raw.package_name || undefined,
		packageType: raw.package_type || undefined,
		projectPath: raw.project_path,
		sessionId: raw.session_id,
		source,
		subagents:
			source === "claude_code"
				? Object.entries(raw.subagents).map(([agentId, content]) => ({
						agentId,
						content,
					}))
				: undefined,
		tag: raw.tag ?? undefined,
	});
}

function applyCandidateResult(
	result: UsageEventsBackfillResult,
	candidateResult: CandidateResult,
): void {
	switch (candidateResult.status) {
		case "already_complete":
			result.alreadyCompleteCount += 1;
			result.completeCount += 1;
			return;
		case "completed":
			result.completeCount += 1;
			result.completedCount += 1;
			return;
		case "would_write":
			result.completeCount += 1;
			result.wouldWriteCount += 1;
			return;
		case "superseded":
			result.supersededCount += 1;
			appendIssue(result, candidateResult.issue);
			return;
		case "failed":
			result.failedCount += 1;
			if (candidateResult.issue.code === "extraction_incomplete") {
				result.incompleteCount += 1;
			}
			if (candidateResult.issue.code === "oversized_snapshot") {
				result.oversizedCount += 1;
			}
			appendIssue(result, candidateResult.issue);
	}
}

function appendIssue(
	result: UsageEventsBackfillResult,
	backfillIssue: UsageEventsBackfillIssue,
): void {
	if (result.issues.length < MAX_ISSUES) {
		result.issues = [...result.issues, backfillIssue];
	}
}

function issue(
	candidate: RawSessionCandidate,
	code: UsageEventsBackfillIssueCode,
	diagnostics: readonly string[] = [],
): UsageEventsBackfillIssue {
	return {
		code,
		diagnostics,
		sessionId: candidate.sessionId,
		source: candidate.source,
	};
}

function diagnosticCodes(
	diagnostics: readonly UsageExtractionDiagnostic[],
): readonly string[] {
	return diagnostics.map((diagnostic) => diagnostic.code);
}

function compareCandidates(
	left: RawSessionCandidate,
	right: RawSessionCandidate,
): number {
	return (
		left.source.localeCompare(right.source) ||
		left.organizationId.localeCompare(right.organizationId) ||
		left.sessionDate.localeCompare(right.sessionDate) ||
		left.sessionId.localeCompare(right.sessionId)
	);
}

function candidateKey(candidate: RawSessionCandidate): string {
	return `${candidate.organizationId}\u0000${candidate.sessionId}`;
}

function rawSessionKey(raw: RawSessionRow): string {
	return `${raw.organization_id}\u0000${raw.session_id}`;
}

function monthBounds(month: string): { monthEnd: string; monthStart: string } {
	if (!/^\d{4}-\d{2}$/u.test(month)) {
		throw new Error(`Invalid ClickHouse session month: ${month}`);
	}
	const start = new Date(`${month}-01T00:00:00.000Z`);
	if (Number.isNaN(start.getTime())) {
		throw new Error(`Invalid ClickHouse session month: ${month}`);
	}
	const end = new Date(
		Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
	);
	return {
		monthEnd: toClickHouseTimestamp(end),
		monthStart: toClickHouseTimestamp(start),
	};
}

function getRawTable(source: UsageEventSource): string {
	return getSafeClickHouseTable(
		source === "claude_code" ? "rudel.claude_sessions" : "rudel.codex_sessions",
	);
}

function parseClickHouseUtc(value: string): Date {
	const normalized = /(?:Z|[+-]\d\d:\d\d)$/u.test(value)
		? value
		: `${value.replace(" ", "T")}Z`;
	const parsed = new Date(normalized);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`ClickHouse returned an invalid UTC timestamp: ${value}`);
	}
	return parsed;
}

function toClickHouseTimestamp(value: Date): string {
	return value.toISOString().replace("T", " ").replace("Z", "");
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function validateOptions(options: UsageEventsBackfillOptions): void {
	if (Number.isNaN(options.cutoff.getTime())) {
		throw new Error("Usage-event backfill cutoff must be a valid date");
	}
	if (options.cutoff.getTime() > Date.now()) {
		throw new Error("Usage-event backfill cutoff cannot be in the future");
	}
	if (!Number.isSafeInteger(options.maxSessions) || options.maxSessions <= 0) {
		throw new Error("Usage-event backfill maxSessions must be positive");
	}
	const maxSessionBytes = options.maxSessionBytes ?? DEFAULT_MAX_SESSION_BYTES;
	if (!Number.isSafeInteger(maxSessionBytes) || maxSessionBytes <= 0) {
		throw new Error("Usage-event backfill maxSessionBytes must be positive");
	}
	if (maxSessionBytes > MAX_CONFIGURED_SESSION_BYTES) {
		throw new Error("Usage-event backfill maxSessionBytes cannot exceed 8 GiB");
	}
}
