import { createHash } from "node:crypto";
import { TupleParam } from "@clickhouse/client-web";
import { getLogger } from "@logtape/logtape";
import {
	ingestRudelSkillReceipts,
	ingestRudelSkillUses,
	ingestRudelSkillVersionContents,
	type RudelSkillReceiptsRow,
	type RudelSkillUsesRow,
	type RudelSkillVersionContentsRow,
} from "@rudel/ch-schema/generated";
import {
	type ClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import type {
	ExtractedSkillUse,
	SkillAgent,
	SkillExtractionResult,
} from "./skill-extraction.types.js";

const EXTRACTION_PARSER_BIT_COUNT = 16n;
const SKILL_RECEIPTS_TABLE = "rudel.skill_receipts";
const SKILL_USES_TABLE = "rudel.skill_uses";
const SKILL_VERSION_CONTENTS_TABLE = "rudel.skill_version_contents";
// ClickHouse 26.3 caps each HTTP form field at 128 KiB. A 1,000-tuple lookup
// with production-shaped identifiers serializes to about 153 KiB before URL
// encoding and is rejected as "Field value too long". Five hundred tuples use
// about 77 KiB, leaving headroom for longer identifiers; an exceptional
// oversized tuple still safely degrades to insert.
const SKILL_VERSION_LOOKUP_MAX_TUPLES = 500;
const SKILL_VERSION_LOOKUP_SETTINGS = {
	max_bytes_to_read: String(2 * 1024 * 1024 * 1024),
	max_execution_time: 60,
	max_rows_to_read: "10000000",
	timeout_before_checking_execution_speed: 0,
} as const;

const logger = getLogger(["rudel", "api", "skill-extraction-ingest"]);

export interface SkillExtractionReceiptState {
	readonly parserVersion: number;
	readonly sourceContentSha256: string;
}

export interface SkillExtractionWriteInput {
	readonly extractedAt: Date;
	readonly extraction: SkillExtractionResult;
	readonly organizationId: string;
	readonly rawRevisionIngestedAt: Date;
	readonly sessionDate: Date;
	readonly sessionId: string;
	readonly userId: string;
}

export interface SkillExtractionRunInput extends SkillExtractionWriteInput {
	readonly extractionSeq: string;
}

export interface SkillExtractionRows {
	readonly contentRows: readonly RudelSkillVersionContentsRow[];
	readonly receiptRows: readonly RudelSkillReceiptsRow[];
	readonly useRows: readonly RudelSkillUsesRow[];
}

export type SkillExtractionWriteResult = SkillExtractionRows;

export interface ExistingSkillVersionRow {
	content_sha256: string;
	skill_name: string;
	user_id: string;
}

export function chunkSkillVersionLookupIdentities(
	identities: readonly TupleParam[],
): readonly (readonly TupleParam[])[] {
	const chunks: TupleParam[][] = [];
	for (
		let index = 0;
		index < identities.length;
		index += SKILL_VERSION_LOOKUP_MAX_TUPLES
	) {
		chunks.push(
			identities.slice(index, index + SKILL_VERSION_LOOKUP_MAX_TUPLES),
		);
	}
	return chunks;
}

interface SkillExtractionReceiptRow {
	parser_version: number;
	source_content_sha256: string;
}

export function buildActiveSkillUsesCte(options?: {
	readonly filterSkillName: boolean;
}): string {
	const skillNameFilter = options?.filterSkillName
		? "AND skill_name = {skillName:String}"
		: "";
	const filteredIdentityCte = options?.filterSkillName
		? `
		skill_filtered_use_identities AS (
			SELECT DISTINCT user_id, agent, session_id
			FROM ${getSafeClickHouseTable(SKILL_USES_TABLE)}
			WHERE organization_id = {organizationId:String}
				AND skill_name = {skillName:String}
		),`
		: "";
	const receiptIdentityFilter = options?.filterSkillName
		? `AND (user_id, agent, session_id) IN (
				SELECT user_id, agent, session_id
				FROM skill_filtered_use_identities
			)`
		: "";
	return `
		${filteredIdentityCte}
		latest_skill_receipt_rows AS (
			SELECT
				organization_id,
				user_id,
				agent,
				session_id,
				argMax(
					tuple(source_content_sha256, parser_version, extraction_seq, extracted_at),
					extraction_seq
				) AS receipt_state
			FROM ${getSafeClickHouseTable(SKILL_RECEIPTS_TABLE)}
			WHERE organization_id = {organizationId:String}
				${receiptIdentityFilter}
			GROUP BY organization_id, user_id, agent, session_id
		),
		latest_skill_receipts AS (
			SELECT
				organization_id,
				user_id,
				agent,
				session_id,
				tupleElement(receipt_state, 1) AS receipt_source_content_sha256,
				tupleElement(receipt_state, 2) AS receipt_parser_version,
				tupleElement(receipt_state, 3) AS receipt_extraction_seq,
				tupleElement(receipt_state, 4) AS receipt_extracted_at
			FROM latest_skill_receipt_rows
		),
		committed_skill_use_row_states AS (
			SELECT
				uses.organization_id AS organization_id,
				uses.user_id AS user_id,
				uses.agent AS agent,
				uses.session_id AS session_id,
				uses.skill_name AS skill_name,
				uses.extraction_seq AS extraction_seq,
				argMax(
					tuple(
						uses.content_sha256,
						uses.source_content_sha256,
						uses.used_at,
						uses.parser_version,
						uses.extracted_at
					),
					uses.extracted_at
				) AS use_state
			FROM (
				SELECT *
				FROM ${getSafeClickHouseTable(SKILL_USES_TABLE)}
				WHERE organization_id = {organizationId:String}
					${skillNameFilter}
			) AS uses
			WHERE (
				uses.organization_id,
				uses.user_id,
				uses.agent,
				uses.session_id,
				uses.extraction_seq,
				uses.source_content_sha256,
				uses.parser_version
			) IN (
				SELECT
					organization_id,
					user_id,
					agent,
					session_id,
					receipt_extraction_seq,
					receipt_source_content_sha256,
					receipt_parser_version
				FROM latest_skill_receipts
			)
			GROUP BY
				uses.organization_id,
				uses.user_id,
				uses.agent,
				uses.session_id,
				uses.skill_name,
				uses.extraction_seq
		),
		active_skill_uses AS (
			SELECT
				organization_id,
				user_id,
				agent,
				session_id,
				skill_name,
				tupleElement(use_state, 1) AS content_sha256,
				tupleElement(use_state, 2) AS source_content_sha256,
				tupleElement(use_state, 3) AS used_at,
				tupleElement(use_state, 4) AS parser_version,
				extraction_seq,
				tupleElement(use_state, 5) AS extracted_at
			FROM committed_skill_use_row_states
		)
	`;
}

export function buildSkillExtractionSeq(
	rawRevisionIngestedAt: Date,
	parserVersion: number,
): string {
	const epochMilliseconds = rawRevisionIngestedAt.getTime();
	if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
		throw new Error("Skill raw revision timestamp must be a valid epoch date");
	}
	if (
		!Number.isSafeInteger(parserVersion) ||
		parserVersion <= 0 ||
		parserVersion > 65_535
	) {
		throw new Error("Skill parser version is out of range");
	}
	return (
		(BigInt(epochMilliseconds) << EXTRACTION_PARSER_BIT_COUNT) |
		BigInt(parserVersion & 0xffff)
	).toString();
}

export function createSkillExtractionRun(
	input: SkillExtractionWriteInput,
): SkillExtractionRunInput {
	validateWriteInput(input);
	return {
		...input,
		extractionSeq: buildSkillExtractionSeq(
			input.rawRevisionIngestedAt,
			input.extraction.parserVersion,
		),
	};
}

export async function writeSkillExtraction(
	executor: ClickHouseExecutor,
	input: SkillExtractionWriteInput,
): Promise<SkillExtractionWriteResult> {
	const run = createSkillExtractionRun(input);
	const existingVersions = await readExistingSkillVersions(executor, run);
	const rows = buildSkillExtractionRows(run, existingVersions);
	await writeSkillExtractionRowBatch(executor, rows);
	return rows;
}

export async function writeSkillExtractionRowBatch(
	executor: ClickHouseExecutor,
	rows: SkillExtractionRows,
): Promise<void> {
	if (rows.contentRows.length > 0) {
		await writeSkillVersionContentRows(executor, rows.contentRows);
	}
	if (rows.useRows.length > 0) {
		await writeSkillUseRows(executor, rows.useRows);
	}
	if (rows.receiptRows.length > 0) {
		await writeSkillReceiptRows(executor, rows.receiptRows);
	}
}

export async function writeSkillVersionContentRows(
	executor: ClickHouseExecutor,
	rows: readonly RudelSkillVersionContentsRow[],
): Promise<void> {
	await ingestRudelSkillVersionContents(executor, [...rows], {
		validate: true,
	});
}

export async function writeSkillUseRows(
	executor: ClickHouseExecutor,
	rows: readonly RudelSkillUsesRow[],
): Promise<void> {
	await ingestRudelSkillUses(executor, [...rows], { validate: true });
}

export async function writeSkillReceiptRows(
	executor: ClickHouseExecutor,
	rows: readonly RudelSkillReceiptsRow[],
): Promise<void> {
	await ingestRudelSkillReceipts(executor, [...rows], { validate: true });
}

export function buildSkillExtractionRows(
	input: SkillExtractionRunInput,
	existingVersions: readonly ExistingSkillVersionRow[],
): SkillExtractionRows {
	validateRunInput(input);
	return {
		contentRows: buildSkillVersionContentRows(input, existingVersions),
		receiptRows: [buildSkillReceiptRow(input)],
		useRows: buildSkillUseRows(input),
	};
}

export function mergeSkillExtractionRows(
	rowSets: readonly SkillExtractionRows[],
): SkillExtractionRows {
	const contents = new Map<string, RudelSkillVersionContentsRow>();
	const receipts = new Map<string, RudelSkillReceiptsRow>();
	const uses = new Map<string, RudelSkillUsesRow>();
	for (const rows of rowSets) {
		for (const row of rows.contentRows) {
			setNewestRow(
				contents,
				`${row.organization_id}\u0000${row.skill_name}\u0000${row.content_sha256}\u0000${row.user_id}`,
				row,
			);
		}
		for (const row of rows.receiptRows) {
			setNewestRow(
				receipts,
				`${row.organization_id}\u0000${row.user_id}\u0000${row.agent}\u0000${row.session_id}`,
				row,
			);
		}
		for (const row of rows.useRows) {
			setNewestRow(
				uses,
				`${row.organization_id}\u0000${row.skill_name}\u0000${row.agent}\u0000${row.user_id}\u0000${row.session_id}\u0000${row.extraction_seq}`,
				row,
			);
		}
	}
	return {
		contentRows: [...contents.values()],
		receiptRows: [...receipts.values()],
		useRows: [...uses.values()],
	};
}

export async function readSkillExtractionReceipt(
	executor: ClickHouseExecutor,
	identity: {
		readonly agent: SkillAgent;
		readonly organizationId: string;
		readonly sessionId: string;
		readonly userId: string;
	},
): Promise<SkillExtractionReceiptState | null> {
	const [row] = await executor.query<SkillExtractionReceiptRow>({
		query: `
			SELECT
				tupleElement(receipt_state, 1) AS source_content_sha256,
				tupleElement(receipt_state, 2) AS parser_version
			FROM (
				SELECT
					argMax(
						tuple(source_content_sha256, parser_version, extraction_seq, extracted_at),
						extraction_seq
					) AS receipt_state
				FROM ${getSafeClickHouseTable(SKILL_RECEIPTS_TABLE)}
				WHERE organization_id = {organizationId:String}
					AND user_id = {userId:String}
					AND agent = {agent:String}
					AND session_id = {sessionId:String}
				GROUP BY organization_id, user_id, agent, session_id
			)
		`,
		query_params: {
			agent: identity.agent,
			organizationId: identity.organizationId,
			sessionId: identity.sessionId,
			userId: identity.userId,
		},
	});
	return row
		? {
				parserVersion: Number(row.parser_version),
				sourceContentSha256: row.source_content_sha256,
			}
		: null;
}

export function hasMatchingSkillExtractionReceipt(
	state: SkillExtractionReceiptState | null,
	extraction: Pick<
		SkillExtractionResult,
		"parserVersion" | "sourceContentSha256"
	>,
): boolean {
	return (
		state?.parserVersion === extraction.parserVersion &&
		state.sourceContentSha256 === extraction.sourceContentSha256
	);
}

export function buildSkillUseRows(
	input: SkillExtractionRunInput,
): readonly RudelSkillUsesRow[] {
	const extractedAt = toClickHouseTimestamp(input.extractedAt);
	return input.extraction.uses.map((use) =>
		buildUseRow(use, input, extractedAt),
	);
}

export function buildSkillVersionContentRows(
	input: SkillExtractionRunInput,
	existingVersions: readonly ExistingSkillVersionRow[],
): readonly RudelSkillVersionContentsRow[] {
	const existing = new Set(
		existingVersions.map((row) =>
			versionKey(row.user_id, row.skill_name, row.content_sha256),
		),
	);
	const rowsByKey = new Map<string, RudelSkillVersionContentsRow>();
	const extractedAt = toClickHouseTimestamp(input.extractedAt);
	for (const use of input.extraction.uses) {
		if (use.content === null) continue;
		const contentSha256 = hashContent(use.content);
		const key = versionKey(input.userId, use.name, contentSha256);
		if (existing.has(key) || rowsByKey.has(key)) continue;
		rowsByKey.set(key, {
			organization_id: input.organizationId,
			skill_name: use.name,
			content_sha256: contentSha256,
			user_id: input.userId,
			content: use.content,
			parser_version: input.extraction.parserVersion,
			extraction_seq: input.extractionSeq,
			extracted_at: extractedAt,
		});
	}
	return [...rowsByKey.values()];
}

async function readExistingSkillVersions(
	executor: ClickHouseExecutor,
	input: SkillExtractionRunInput,
): Promise<readonly ExistingSkillVersionRow[]> {
	const versionIdentities = buildSkillVersionContentRows(input, []).map(
		(row) => new TupleParam([row.skill_name, row.content_sha256, row.user_id]),
	);
	if (versionIdentities.length === 0) return [];
	const existingByKey = new Map<string, ExistingSkillVersionRow>();
	for (const chunk of chunkSkillVersionLookupIdentities(versionIdentities)) {
		try {
			const existing = await executor.query<ExistingSkillVersionRow>({
				clickhouse_settings: SKILL_VERSION_LOOKUP_SETTINGS,
				query: `
					SELECT user_id, skill_name, content_sha256
					FROM ${getSafeClickHouseTable(SKILL_VERSION_CONTENTS_TABLE)}
					WHERE organization_id = {organizationId:String}
						AND (skill_name, content_sha256, user_id) IN {versionIdentities:Array(Tuple(String, FixedString(64), String))}
					GROUP BY organization_id, skill_name, content_sha256, user_id
				`,
				query_params: {
					organizationId: input.organizationId,
					versionIdentities: chunk,
				},
			});
			for (const row of existing) {
				existingByKey.set(
					versionKey(row.user_id, row.skill_name, row.content_sha256),
					row,
				);
			}
		} catch (error) {
			logger.warn(
				"Skill content-version lookup failed; candidates will be reinserted (organization_id={organizationId} tuple_count={tupleCount} error={error})",
				{
					error: error instanceof Error ? error.message : String(error),
					organizationId: input.organizationId,
					tupleCount: chunk.length,
				},
			);
		}
	}
	return [...existingByKey.values()];
}

function buildUseRow(
	use: ExtractedSkillUse,
	input: SkillExtractionRunInput,
	extractedAt: string,
): RudelSkillUsesRow {
	return {
		organization_id: input.organizationId,
		skill_name: use.name,
		agent: input.extraction.agent,
		user_id: input.userId,
		session_id: input.sessionId,
		content_sha256: use.content === null ? "" : hashContent(use.content),
		source_content_sha256: input.extraction.sourceContentSha256,
		used_at: toClickHouseTimestamp(new Date(use.usedAt)),
		parser_version: input.extraction.parserVersion,
		extraction_seq: input.extractionSeq,
		extracted_at: extractedAt,
	};
}

function buildSkillReceiptRow(
	input: SkillExtractionRunInput,
): RudelSkillReceiptsRow {
	return {
		organization_id: input.organizationId,
		user_id: input.userId,
		agent: input.extraction.agent,
		session_id: input.sessionId,
		source_content_sha256: input.extraction.sourceContentSha256,
		parser_version: input.extraction.parserVersion,
		extraction_seq: input.extractionSeq,
		extracted_at: toClickHouseTimestamp(input.extractedAt),
	};
}

function setNewestRow<Row extends { readonly extraction_seq: string }>(
	rows: Map<string, Row>,
	key: string,
	row: Row,
): void {
	const previous = rows.get(key);
	if (
		previous === undefined ||
		BigInt(row.extraction_seq) > BigInt(previous.extraction_seq)
	) {
		rows.set(key, row);
	}
}

function validateRunInput(input: SkillExtractionRunInput): void {
	validateWriteInput(input);
	if (!/^\d+$/u.test(input.extractionSeq)) {
		throw new Error("Skill extraction sequence must be an unsigned integer");
	}
}

function validateWriteInput(input: SkillExtractionWriteInput): void {
	if (Number.isNaN(input.extractedAt.getTime())) {
		throw new Error("Skill extraction timestamp must be valid");
	}
	if (Number.isNaN(input.rawRevisionIngestedAt.getTime())) {
		throw new Error("Skill raw revision timestamp must be valid");
	}
	if (Number.isNaN(input.sessionDate.getTime())) {
		throw new Error("Skill extraction session date must be valid");
	}
	if (
		!Number.isSafeInteger(input.extraction.parserVersion) ||
		input.extraction.parserVersion <= 0 ||
		input.extraction.parserVersion > 65_535
	) {
		throw new Error("Skill parser version is out of range");
	}
	if (!/^[a-f0-9]{64}$/u.test(input.extraction.sourceContentSha256)) {
		throw new Error("Skill extraction source hash must be lowercase SHA-256");
	}
	const names = new Set<string>();
	for (const use of input.extraction.uses) {
		if (use.name === "" || names.has(use.name)) {
			throw new Error("Skill extraction uses must have unique non-empty names");
		}
		names.add(use.name);
		if (Number.isNaN(new Date(use.usedAt).getTime())) {
			throw new Error("Skill use timestamp must be valid");
		}
	}
}

function hashContent(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

function versionKey(
	userId: string,
	skillName: string,
	contentSha256: string,
): string {
	return `${userId}\u0000${skillName}\u0000${contentSha256}`;
}

function toClickHouseTimestamp(value: Date): string {
	return value.toISOString().replace("T", " ").replace("Z", "");
}
