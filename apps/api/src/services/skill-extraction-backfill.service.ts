import {
	type ClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { getNextIngestedAt } from "./ingest-timestamp.service.js";
import {
	extractSessionSkills,
	SKILL_PARSER_VERSION,
} from "./skill-extraction.js";
import type { SkillAgent } from "./skill-extraction.types.js";
import {
	buildActiveSkillUsesCte,
	buildSkillExtractionRows,
	createSkillExtractionRun,
	hasMatchingSkillExtractionReceipt,
	mergeSkillExtractionRows,
	type ActiveSkillUseRow,
	type ExistingSkillVersionRow,
	type SkillExtractionReceiptState,
	type SkillExtractionRunInput,
	writeSkillExtractionRowBatch,
} from "./skill-extraction-ingest.service.js";

const MAX_ISSUES = 100;
const SOURCE_SCAN_SETTINGS = {
	max_bytes_to_read: String(16 * 1024 * 1024 * 1024),
	max_execution_time: 300,
	max_rows_to_read: "5000000",
	result_overflow_mode: "throw",
} as const;

export interface SkillExtractionBackfillOptions {
	readonly batchMaxBytes: number;
	readonly batchMaxRows: number;
	readonly cutoff: Date;
	readonly maxSessionBytes: number;
	readonly maxSessions: number;
	readonly onProgress?: (progress: SkillExtractionBackfillProgress) => void;
	readonly organizationId?: string;
	readonly parserVersion?: number;
}

export interface SkillExtractionBackfillProgress {
	readonly batchCount: number;
	readonly completedBatchCount: number;
	readonly processedCandidateCount: number;
	readonly totalCandidateCount: number;
}

export interface SkillExtractionBackfillDependencies {
	readonly extractSessionSkills: typeof extractSessionSkills;
}

const DEFAULT_DEPENDENCIES: SkillExtractionBackfillDependencies = {
	extractSessionSkills,
};

export type SkillExtractionBackfillIssueCode =
	| "missing_raw_snapshot"
	| "oversized_snapshot"
	| "snapshot_superseded"
	| "unexpected_error";

export interface SkillExtractionBackfillIssue {
	readonly code: SkillExtractionBackfillIssueCode;
	readonly detail: string;
	readonly sessionId: string;
	readonly source: "claude_code" | "codex";
}

export interface SkillExtractionBackfillResult {
	alreadyCompleteCount: number;
	candidateCount: number;
	completedCount: number;
	cutoff: string;
	failedCount: number;
	issues: readonly SkillExtractionBackfillIssue[];
	oversizedCount: number;
	parserVersion: number;
	rawSessionCount: number;
	skippedNoSkillMarkerCount: number;
	status: "completed" | "preview";
	supersededCount: number;
	wouldWriteCount: number;
}

interface RawSessionCandidate {
	readonly contentBytes: number;
	readonly ingestedAt: string;
	readonly organizationId: string;
	readonly sessionDate: string;
	readonly sessionId: string;
	readonly source: "claude_code" | "codex";
	readonly userId: string;
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

interface CandidateCensus {
	readonly candidates: readonly RawSessionCandidate[];
	readonly rawSessionCount: number;
}

interface RawSessionRow {
	content: string;
	raw_ingested_at: string;
	raw_session_date: string;
	organization_id: string;
	session_id: string;
	user_id: string;
}

interface RawSessionBatch {
	readonly candidates: readonly RawSessionCandidate[];
	readonly contentBytes: number;
	readonly monthEnd: string;
	readonly monthStart: string;
}

interface ReceiptRow {
	parser_version: number;
	session_id: string;
	source_content_sha256: string;
	user_id: string;
}

interface BatchActiveSkillUseRow extends ActiveSkillUseRow {
	session_id: string;
	user_id: string;
}

interface RevisionRow {
	latest_ingested_at: string;
	session_id: string;
	user_id: string;
}

type CandidateResult =
	| { status: "already_complete" }
	| { status: "completed" }
	| { status: "would_write" }
	| { issue: SkillExtractionBackfillIssue; status: "failed" }
	| { issue: SkillExtractionBackfillIssue; status: "superseded" };

interface PreparedCandidate {
	readonly candidate: RawSessionCandidate;
	readonly run: SkillExtractionRunInput;
}

export function previewSkillExtractionBackfill(
	executor: ClickHouseExecutor,
	options: SkillExtractionBackfillOptions,
	dependencies: SkillExtractionBackfillDependencies = DEFAULT_DEPENDENCIES,
): Promise<SkillExtractionBackfillResult> {
	return runSkillExtractionBackfill(executor, options, false, dependencies);
}

export function backfillSkillExtractions(
	executor: ClickHouseExecutor,
	options: SkillExtractionBackfillOptions,
	dependencies: SkillExtractionBackfillDependencies = DEFAULT_DEPENDENCIES,
): Promise<SkillExtractionBackfillResult> {
	return runSkillExtractionBackfill(executor, options, true, dependencies);
}

async function runSkillExtractionBackfill(
	executor: ClickHouseExecutor,
	options: SkillExtractionBackfillOptions,
	execute: boolean,
	dependencies: SkillExtractionBackfillDependencies,
): Promise<SkillExtractionBackfillResult> {
	validateOptions(options);
	const census = await listRawSessionCandidates(executor, options);
	const parserVersion = options.parserVersion ?? SKILL_PARSER_VERSION;
	const result = createResult(census, parserVersion, options.cutoff, execute);
	const readableCandidates: RawSessionCandidate[] = [];
	for (const candidate of census.candidates) {
		if (candidate.contentBytes > options.maxSessionBytes) {
			applyResult(result, {
				status: "failed",
				issue: issue(
					candidate,
					"oversized_snapshot",
					`${candidate.contentBytes} > ${options.maxSessionBytes}`,
				),
			});
			continue;
		}
		readableCandidates.push(candidate);
	}

	const batches = createRawSessionBatches(readableCandidates, options);
	let processed = census.candidates.length - readableCandidates.length;
	for (const [batchIndex, batch] of batches.entries()) {
		const [rawRows, receipts, revisions, activeUses] = await Promise.all([
			readRawSessions(executor, batch, options.cutoff, options.maxSessionBytes),
			readExtractionReceipts(executor, batch),
			readCurrentRevisions(executor, batch),
			readBatchActiveSkillUses(executor, batch),
		]);
		const rawByIdentity = new Map(
			rawRows.map((row) => [rawIdentity(row.user_id, row.session_id), row]),
		);
		const receiptByIdentity = new Map(
			receipts.map((row) => [
				rawIdentity(row.user_id, row.session_id),
				{
					parserVersion: Number(row.parser_version),
					sourceContentSha256: row.source_content_sha256,
				},
			]),
		);
		const revisionByIdentity = new Map(
			revisions.map((row) => [
				rawIdentity(row.user_id, row.session_id),
				row.latest_ingested_at,
			]),
		);
		const activeUsesByIdentity = groupActiveUsesByIdentity(activeUses);
		const prepared: PreparedCandidate[] = [];

		for (const candidate of batch.candidates) {
			const identity = rawIdentity(candidate.userId, candidate.sessionId);
			try {
				const candidateResult = prepareCandidate(
					candidate,
					rawByIdentity.get(identity),
					receiptByIdentity.get(identity),
					revisionByIdentity.get(identity),
					parserVersion,
					execute,
					dependencies,
				);
				if ("run" in candidateResult) {
					prepared.push(candidateResult);
				} else {
					applyResult(result, candidateResult);
				}
			} catch (error) {
				applyResult(result, {
					status: "failed",
					issue: issue(
						candidate,
						"unexpected_error",
						error instanceof Error ? error.message : String(error),
					),
				});
			}
		}

		if (prepared.length > 0) {
			const existingVersions = await readExistingBatchSkillVersions(
				executor,
				prepared,
			);
			const rows = mergeSkillExtractionRows(
				prepared.map(({ candidate, run }) =>
					buildSkillExtractionRows(
						run,
						activeUsesByIdentity.get(
							rawIdentity(candidate.userId, candidate.sessionId),
						) ?? [],
						existingVersions,
					),
				),
			);
			try {
				await writeSkillExtractionRowBatch(executor, rows);
				for (let index = 0; index < prepared.length; index += 1) {
					applyResult(result, { status: "completed" });
				}
			} catch (error) {
				for (const { candidate } of prepared) {
					applyResult(result, {
						status: "failed",
						issue: issue(
							candidate,
							"unexpected_error",
							error instanceof Error ? error.message : String(error),
						),
					});
				}
			}
		}
		processed += batch.candidates.length;
		options.onProgress?.({
			batchCount: batches.length,
			completedBatchCount: batchIndex + 1,
			processedCandidateCount: processed,
			totalCandidateCount: census.candidates.length,
		});
	}
	return result;
}

function prepareCandidate(
	candidate: RawSessionCandidate,
	raw: RawSessionRow | undefined,
	receipt: SkillExtractionReceiptState | undefined,
	latestIngestedAt: string | undefined,
	parserVersion: number,
	execute: boolean,
	dependencies: SkillExtractionBackfillDependencies,
): CandidateResult | PreparedCandidate {
	if (!raw) {
		return {
			status: "failed",
			issue: issue(candidate, "missing_raw_snapshot", "snapshot missing"),
		};
	}
	if (
		latestIngestedAt === undefined ||
		normalizeTimestamp(latestIngestedAt) !==
			normalizeTimestamp(candidate.ingestedAt)
	) {
		return {
			status: "superseded",
			issue: issue(
				candidate,
				"snapshot_superseded",
				"newer raw revision exists",
			),
		};
	}
	const extraction = dependencies.extractSessionSkills({
		content: raw.content,
		parserVersion,
		sessionDate: parseClickHouseUtc(raw.raw_session_date).toISOString(),
		source: candidate.source,
	});
	if (hasMatchingSkillExtractionReceipt(receipt ?? null, extraction)) {
		return { status: "already_complete" };
	}
	if (!execute) return { status: "would_write" };
	return {
		candidate,
		run: createSkillExtractionRun({
			extractedAt: getNextIngestedAt(),
			extraction,
			organizationId: candidate.organizationId,
			sessionDate: parseClickHouseUtc(raw.raw_session_date),
			sessionId: candidate.sessionId,
			userId: candidate.userId,
		}),
	};
}

async function listRawSessionCandidates(
	executor: ClickHouseExecutor,
	options: SkillExtractionBackfillOptions,
): Promise<CandidateCensus> {
	const [claude, codex] = await Promise.all([
		listSourceCandidates(executor, "claude_code", options),
		listSourceCandidates(executor, "codex", options),
	]);
	const candidates = [...claude.candidates, ...codex.candidates].sort(
		compareCandidates,
	);
	const rawSessionCount = claude.rawSessionCount + codex.rawSessionCount;
	if (
		candidates.length > options.maxSessions ||
		rawSessionCount > options.maxSessions
	) {
		throw new Error(
			`Skill backfill census exceeds maxSessions=${options.maxSessions} (candidates=${candidates.length}, raw=${rawSessionCount})`,
		);
	}
	return { candidates, rawSessionCount };
}

async function listSourceCandidates(
	executor: ClickHouseExecutor,
	source: "claude_code" | "codex",
	options: SkillExtractionBackfillOptions,
): Promise<CandidateCensus> {
	const table = getRawTable(source);
	const organizationFilter = options.organizationId
		? "AND organization_id = {organizationId:String}"
		: "";
	const marker =
		source === "claude_code"
			? `position(content, '"name":"Skill"') > 0`
			: `position(content, 'skills/') > 0 AND position(content, 'SKILL') > 0`;
	const rows = await executor.query<RawSessionCandidateRow>({
		clickhouse_settings: {
			...SOURCE_SCAN_SETTINGS,
			max_result_rows: String(options.maxSessions + 1),
		},
		query: `
			SELECT *
			FROM (
				SELECT
					organization_id,
					session_id,
					argMax(user_id, ingested_at) AS latest_user_id,
					toString(argMax(session_date, ingested_at)) AS latest_session_date,
					toString(max(ingested_at)) AS latest_ingested_at,
					argMax(length(content), ingested_at) AS latest_content_bytes,
					argMax(toUInt8(${marker}), ingested_at) AS has_skill_marker,
					count() OVER () AS raw_session_count
				FROM ${table}
				WHERE ingested_at <= {cutoff:DateTime64(3, 'UTC')}
					${organizationFilter}
				GROUP BY organization_id, session_id
			)
			WHERE has_skill_marker = 1
			ORDER BY organization_id, session_id
			LIMIT {candidateLimit:UInt32}
		`,
		query_params: {
			candidateLimit: options.maxSessions + 1,
			cutoff: toClickHouseTimestamp(options.cutoff),
			organizationId: options.organizationId ?? "",
		},
	});
	const rawSessionCount = await countSourceSessions(executor, source, options);
	return {
		candidates: rows.map((row) => ({
			contentBytes: Number(row.latest_content_bytes),
			ingestedAt: row.latest_ingested_at,
			organizationId: row.organization_id,
			sessionDate: row.latest_session_date,
			sessionId: row.session_id,
			source,
			userId: row.latest_user_id,
		})),
		rawSessionCount,
	};
}

async function countSourceSessions(
	executor: ClickHouseExecutor,
	source: "claude_code" | "codex",
	options: SkillExtractionBackfillOptions,
): Promise<number> {
	const organizationFilter = options.organizationId
		? "AND organization_id = {organizationId:String}"
		: "";
	const [row] = await executor.query<{ session_count: number }>({
		clickhouse_settings: SOURCE_SCAN_SETTINGS,
		query: `
			SELECT count() AS session_count
			FROM (
				SELECT organization_id, session_id
				FROM ${getRawTable(source)}
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

function createRawSessionBatches(
	candidates: readonly RawSessionCandidate[],
	options: Pick<
		SkillExtractionBackfillOptions,
		"batchMaxBytes" | "batchMaxRows"
	>,
): readonly RawSessionBatch[] {
	const batches: RawSessionBatch[] = [];
	let current: RawSessionCandidate[] = [];
	let currentBytes = 0;
	let currentMonth = "";
	for (const candidate of candidates) {
		const first = current[0];
		const month = candidate.sessionDate.slice(0, 7);
		const groupChanged =
			first !== undefined &&
			(first.source !== candidate.source ||
				first.organizationId !== candidate.organizationId ||
				currentMonth !== month);
		const full =
			current.length >= options.batchMaxRows ||
			(current.length > 0 &&
				currentBytes + candidate.contentBytes > options.batchMaxBytes);
		if (groupChanged || full) {
			batches.push({
				candidates: current,
				contentBytes: currentBytes,
				...monthBounds(currentMonth),
			});
			current = [];
			currentBytes = 0;
		}
		if (current.length === 0) currentMonth = month;
		current.push(candidate);
		currentBytes += candidate.contentBytes;
	}
	if (current.length > 0) {
		batches.push({
			candidates: current,
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
	return executor.query<RawSessionRow>({
		clickhouse_settings: {
			max_bytes_to_read: SOURCE_SCAN_SETTINGS.max_bytes_to_read,
			max_execution_time: 180,
			max_result_bytes: String(
				Math.max(
					16 * 1024 * 1024,
					Math.min(maxSessionBytes * 2, batch.contentBytes * 2),
				),
			),
			max_result_rows: String(batch.candidates.length),
			max_rows_to_read: SOURCE_SCAN_SETTINGS.max_rows_to_read,
			result_overflow_mode: "throw",
		},
		query: `
			SELECT
				organization_id,
				user_id,
				session_id,
				content,
				toString(session_date) AS raw_session_date,
				toString(ingested_at) AS raw_ingested_at
			FROM ${getRawTable(first.source)}
			WHERE organization_id = {organizationId:String}
				AND session_date >= {monthStart:DateTime64(3, 'UTC')}
				AND session_date < {monthEnd:DateTime64(3, 'UTC')}
				AND session_id IN {sessionIds:Array(String)}
				AND ingested_at <= {cutoff:DateTime64(3, 'UTC')}
			ORDER BY organization_id, user_id, session_id, ingested_at DESC
			LIMIT 1 BY organization_id, user_id, session_id
			LIMIT {batchLimit:UInt32}
		`,
		query_params: batchParams(batch, cutoff),
	});
}

async function readExtractionReceipts(
	executor: ClickHouseExecutor,
	batch: RawSessionBatch,
): Promise<readonly ReceiptRow[]> {
	const first = batch.candidates[0];
	if (!first) return [];
	return executor.query<ReceiptRow>({
		query: `
			SELECT
				user_id,
				session_id,
				tupleElement(receipt_state, 1) AS source_content_sha256,
				tupleElement(receipt_state, 2) AS parser_version
			FROM (
				SELECT
					user_id,
					session_id,
					argMax(
						tuple(source_content_sha256, parser_version, extraction_seq, extracted_at),
						extraction_seq
					) AS receipt_state
				FROM ${getSafeClickHouseTable("rudel.skill_receipts")}
				WHERE organization_id = {organizationId:String}
					AND agent = {agent:String}
					AND session_id IN {sessionIds:Array(String)}
				GROUP BY organization_id, user_id, agent, session_id
			)
		`,
		query_params: {
			agent: getAgent(first.source),
			organizationId: first.organizationId,
			sessionIds: batch.candidates.map((candidate) => candidate.sessionId),
		},
	});
}

async function readBatchActiveSkillUses(
	executor: ClickHouseExecutor,
	batch: RawSessionBatch,
): Promise<readonly BatchActiveSkillUseRow[]> {
	const first = batch.candidates[0];
	if (!first) return [];
	return executor.query<BatchActiveSkillUseRow>({
		query: `
			WITH ${buildActiveSkillUsesCte()}
			SELECT user_id, session_id, skill_name, toString(used_at) AS used_at
			FROM active_skill_uses
			WHERE agent = {agent:String}
				AND session_id IN {sessionIds:Array(String)}
		`,
		query_params: {
			agent: getAgent(first.source),
			organizationId: first.organizationId,
			sessionIds: batch.candidates.map((candidate) => candidate.sessionId),
		},
	});
}

async function readExistingBatchSkillVersions(
	executor: ClickHouseExecutor,
	prepared: readonly PreparedCandidate[],
): Promise<readonly ExistingSkillVersionRow[]> {
	const first = prepared[0];
	if (!first) return [];
	const skillNames = [
		...new Set(
			prepared.flatMap(({ run }) =>
				run.extraction.uses
					.filter((use) => use.content !== null)
					.map((use) => use.name),
			),
		),
	];
	if (skillNames.length === 0) return [];
	return executor.query<ExistingSkillVersionRow>({
		query: `
			SELECT skill_name, content_sha256
			FROM ${getSafeClickHouseTable("rudel.skill_version_contents")}
			WHERE organization_id = {organizationId:String}
				AND skill_name IN {skillNames:Array(String)}
			GROUP BY organization_id, skill_name, content_sha256
		`,
		query_params: {
			organizationId: first.candidate.organizationId,
			skillNames,
		},
	});
}

async function readCurrentRevisions(
	executor: ClickHouseExecutor,
	batch: RawSessionBatch,
): Promise<readonly RevisionRow[]> {
	const first = batch.candidates[0];
	if (!first) return [];
	return executor.query<RevisionRow>({
		query: `
			SELECT
				user_id,
				session_id,
				toString(max(ingested_at)) AS latest_ingested_at
			FROM ${getRawTable(first.source)}
			WHERE organization_id = {organizationId:String}
				AND session_id IN {sessionIds:Array(String)}
			GROUP BY organization_id, user_id, session_id
		`,
		query_params: {
			organizationId: first.organizationId,
			sessionIds: batch.candidates.map((candidate) => candidate.sessionId),
		},
	});
}

function batchParams(batch: RawSessionBatch, cutoff: Date) {
	const first = batch.candidates[0];
	if (!first) throw new Error("Skill backfill batch must not be empty");
	return {
		batchLimit: batch.candidates.length,
		cutoff: toClickHouseTimestamp(cutoff),
		monthEnd: batch.monthEnd,
		monthStart: batch.monthStart,
		organizationId: first.organizationId,
		sessionIds: batch.candidates.map((candidate) => candidate.sessionId),
	};
}

function createResult(
	census: CandidateCensus,
	parserVersion: number,
	cutoff: Date,
	execute: boolean,
): SkillExtractionBackfillResult {
	return {
		alreadyCompleteCount: 0,
		candidateCount: census.candidates.length,
		completedCount: 0,
		cutoff: cutoff.toISOString(),
		failedCount: 0,
		issues: [],
		oversizedCount: 0,
		parserVersion,
		rawSessionCount: census.rawSessionCount,
		skippedNoSkillMarkerCount:
			census.rawSessionCount - census.candidates.length,
		status: execute ? "completed" : "preview",
		supersededCount: 0,
		wouldWriteCount: 0,
	};
}

function applyResult(
	result: SkillExtractionBackfillResult,
	candidate: CandidateResult,
): void {
	switch (candidate.status) {
		case "already_complete":
			result.alreadyCompleteCount += 1;
			return;
		case "completed":
			result.completedCount += 1;
			return;
		case "would_write":
			result.wouldWriteCount += 1;
			return;
		case "superseded":
			result.supersededCount += 1;
			appendIssue(result, candidate.issue);
			return;
		case "failed":
			result.failedCount += 1;
			if (candidate.issue.code === "oversized_snapshot") {
				result.oversizedCount += 1;
			}
			appendIssue(result, candidate.issue);
	}
}

function appendIssue(
	result: SkillExtractionBackfillResult,
	backfillIssue: SkillExtractionBackfillIssue,
): void {
	if (result.issues.length < MAX_ISSUES) {
		result.issues = [...result.issues, backfillIssue];
	}
}

function issue(
	candidate: RawSessionCandidate,
	code: SkillExtractionBackfillIssueCode,
	detail: string,
): SkillExtractionBackfillIssue {
	return {
		code,
		detail,
		sessionId: candidate.sessionId,
		source: candidate.source,
	};
}

function validateOptions(options: SkillExtractionBackfillOptions): void {
	if (
		Number.isNaN(options.cutoff.getTime()) ||
		options.cutoff.getTime() > Date.now()
	) {
		throw new Error(
			"Skill backfill cutoff must be valid and not in the future",
		);
	}
	for (const [name, value] of [
		["maxSessions", options.maxSessions],
		["maxSessionBytes", options.maxSessionBytes],
		["batchMaxRows", options.batchMaxRows],
		["batchMaxBytes", options.batchMaxBytes],
	] as const) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new Error(`Skill backfill ${name} must be positive`);
		}
	}
	const parserVersion = options.parserVersion ?? SKILL_PARSER_VERSION;
	if (
		!Number.isSafeInteger(parserVersion) ||
		parserVersion <= 0 ||
		parserVersion > 65_535
	) {
		throw new Error("Skill backfill parser version is out of range");
	}
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

function rawIdentity(userId: string, sessionId: string): string {
	return `${userId}\u0000${sessionId}`;
}

function groupActiveUsesByIdentity(
	rows: readonly BatchActiveSkillUseRow[],
): ReadonlyMap<string, readonly ActiveSkillUseRow[]> {
	const grouped = new Map<string, ActiveSkillUseRow[]>();
	for (const row of rows) {
		const key = rawIdentity(row.user_id, row.session_id);
		const group = grouped.get(key) ?? [];
		group.push({ skill_name: row.skill_name, used_at: row.used_at });
		grouped.set(key, group);
	}
	return grouped;
}

function getAgent(source: "claude_code" | "codex"): SkillAgent {
	return source === "claude_code" ? "claude" : "codex";
}

function getRawTable(source: "claude_code" | "codex"): string {
	return getSafeClickHouseTable(
		source === "claude_code" ? "rudel.claude_sessions" : "rudel.codex_sessions",
	);
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

function normalizeTimestamp(value: string): string {
	return parseClickHouseUtc(value).toISOString();
}

function toClickHouseTimestamp(value: Date): string {
	return value.toISOString().replace("T", " ").replace("Z", "");
}
