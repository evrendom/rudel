import { createHash, randomInt } from "node:crypto";
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

const EXTRACTION_RANDOM_BIT_COUNT = 20n;
const EXTRACTION_RANDOM_LIMIT = 2 ** Number(EXTRACTION_RANDOM_BIT_COUNT);
const SKILL_RECEIPTS_TABLE = "rudel.skill_receipts";
const SKILL_USES_TABLE = "rudel.skill_uses";
const SKILL_VERSION_CONTENTS_TABLE = "rudel.skill_version_contents";

export interface SkillExtractionReceiptState {
	readonly parserVersion: number;
	readonly sourceContentSha256: string;
}

export interface SkillExtractionWriteInput {
	readonly extractedAt: Date;
	readonly extraction: SkillExtractionResult;
	readonly organizationId: string;
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

export interface ActiveSkillUseRow {
	skill_name: string;
	used_at: string;
}

export interface ExistingSkillVersionRow {
	content_sha256: string;
	skill_name: string;
}

interface SkillExtractionReceiptRow {
	parser_version: number;
	receipt_state: readonly [string, number, string, string];
	source_content_sha256: string;
}

export function buildActiveSkillUsesCte(options?: {
	readonly filterSkillName: boolean;
}): string {
	const skillNameFilter = options?.filterSkillName
		? "AND skill_name = {skillName:String}"
		: "";
	return `
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
		latest_skill_use_row_states AS (
			SELECT
				organization_id,
				user_id,
				agent,
				session_id,
				skill_name,
				argMax(
					tuple(
						content_sha256,
						source_content_sha256,
						used_at,
						parser_version,
						is_deleted,
						extraction_seq,
						extracted_at
					),
					extraction_seq
				) AS use_state
			FROM ${getSafeClickHouseTable(SKILL_USES_TABLE)}
			WHERE organization_id = {organizationId:String}
				${skillNameFilter}
			GROUP BY organization_id, user_id, agent, session_id, skill_name
		),
		latest_skill_use_rows AS (
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
				tupleElement(use_state, 5) AS is_deleted,
				tupleElement(use_state, 6) AS extraction_seq,
				tupleElement(use_state, 7) AS extracted_at
			FROM latest_skill_use_row_states
		),
		active_skill_uses AS (
			SELECT uses.*
			FROM latest_skill_use_rows AS uses
			INNER ANY JOIN latest_skill_receipts AS receipts
				ON receipts.organization_id = uses.organization_id
				AND receipts.user_id = uses.user_id
				AND receipts.agent = uses.agent
				AND receipts.session_id = uses.session_id
			WHERE uses.is_deleted = 0
				AND uses.source_content_sha256 = receipts.receipt_source_content_sha256
				AND uses.parser_version = receipts.receipt_parser_version
		)
	`;
}

export function buildSkillExtractionSeq(
	extractedAt: Date,
	randomBits: number,
): string {
	const epochMilliseconds = extractedAt.getTime();
	if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
		throw new Error("Skill extraction timestamp must be a valid epoch date");
	}
	if (
		!Number.isSafeInteger(randomBits) ||
		randomBits < 0 ||
		randomBits >= EXTRACTION_RANDOM_LIMIT
	) {
		throw new Error("Skill extraction random value must fit in 20 bits");
	}
	return (
		(BigInt(epochMilliseconds) << EXTRACTION_RANDOM_BIT_COUNT) |
		BigInt(randomBits)
	).toString();
}

export function createSkillExtractionRun(
	input: SkillExtractionWriteInput,
): SkillExtractionRunInput {
	validateWriteInput(input);
	return {
		...input,
		extractionSeq: buildSkillExtractionSeq(
			input.extractedAt,
			randomInt(EXTRACTION_RANDOM_LIMIT),
		),
	};
}

export async function writeSkillExtraction(
	executor: ClickHouseExecutor,
	input: SkillExtractionWriteInput,
): Promise<SkillExtractionWriteResult> {
	const run = createSkillExtractionRun(input);
	const [activeUses, existingVersions] = await Promise.all([
		readActiveSessionSkillUses(executor, run),
		readExistingSkillVersions(executor, run),
	]);
	const rows = buildSkillExtractionRows(run, activeUses, existingVersions);
	await writeSkillExtractionRowBatch(executor, rows);
	return rows;
}

export async function writeSkillExtractionRowBatch(
	executor: ClickHouseExecutor,
	rows: SkillExtractionRows,
): Promise<void> {
	if (rows.contentRows.length > 0) {
		await ingestRudelSkillVersionContents(executor, [...rows.contentRows], {
			validate: true,
		});
	}
	if (rows.useRows.length > 0) {
		await ingestRudelSkillUses(executor, [...rows.useRows], { validate: true });
	}
	if (rows.receiptRows.length > 0) {
		await ingestRudelSkillReceipts(executor, [...rows.receiptRows], {
			validate: true,
		});
	}
}

export function buildSkillExtractionRows(
	input: SkillExtractionRunInput,
	activeUses: readonly ActiveSkillUseRow[],
	existingVersions: readonly ExistingSkillVersionRow[],
): SkillExtractionRows {
	validateRunInput(input);
	return {
		contentRows: buildSkillVersionContentRows(input, existingVersions),
		receiptRows: [buildSkillReceiptRow(input)],
		useRows: buildSkillUseRows(input, activeUses),
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
				`${row.organization_id}\u0000${row.skill_name}\u0000${row.content_sha256}`,
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
				`${row.organization_id}\u0000${row.skill_name}\u0000${row.agent}\u0000${row.user_id}\u0000${row.session_id}`,
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
				tupleElement(receipt_state, 2) AS parser_version,
				receipt_state
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
	activeUses: readonly ActiveSkillUseRow[],
): readonly RudelSkillUsesRow[] {
	const extractedAt = toClickHouseTimestamp(input.extractedAt);
	const currentRows = input.extraction.uses.map((use) =>
		buildUseRow(use, input, extractedAt),
	);
	const desiredNames = new Set(input.extraction.uses.map((use) => use.name));
	const tombstones = activeUses
		.filter((active) => !desiredNames.has(active.skill_name))
		.map((active) => buildTombstoneRow(active, input, extractedAt));
	return [...currentRows, ...tombstones];
}

export function buildSkillVersionContentRows(
	input: SkillExtractionRunInput,
	existingVersions: readonly ExistingSkillVersionRow[],
): readonly RudelSkillVersionContentsRow[] {
	const existing = new Set(
		existingVersions.map((row) =>
			versionKey(row.skill_name, row.content_sha256),
		),
	);
	const rowsByKey = new Map<string, RudelSkillVersionContentsRow>();
	const extractedAt = toClickHouseTimestamp(input.extractedAt);
	for (const use of input.extraction.uses) {
		if (use.content === null) continue;
		const contentSha256 = hashContent(use.content);
		const key = versionKey(use.name, contentSha256);
		if (existing.has(key) || rowsByKey.has(key)) continue;
		rowsByKey.set(key, {
			organization_id: input.organizationId,
			skill_name: use.name,
			content_sha256: contentSha256,
			content: use.content,
			parser_version: input.extraction.parserVersion,
			extraction_seq: input.extractionSeq,
			extracted_at: extractedAt,
		});
	}
	return [...rowsByKey.values()];
}

async function readActiveSessionSkillUses(
	executor: ClickHouseExecutor,
	input: SkillExtractionRunInput,
): Promise<readonly ActiveSkillUseRow[]> {
	return executor.query<ActiveSkillUseRow>({
		query: `
			WITH ${buildActiveSkillUsesCte()}
			SELECT
				skill_name,
				toString(used_at) AS used_at
			FROM active_skill_uses
			WHERE organization_id = {organizationId:String}
				AND user_id = {userId:String}
				AND agent = {agent:String}
				AND session_id = {sessionId:String}
		`,
		query_params: {
			agent: input.extraction.agent,
			organizationId: input.organizationId,
			sessionId: input.sessionId,
			userId: input.userId,
		},
	});
}

async function readExistingSkillVersions(
	executor: ClickHouseExecutor,
	input: SkillExtractionRunInput,
): Promise<readonly ExistingSkillVersionRow[]> {
	const skillNames = [
		...new Set(
			input.extraction.uses
				.filter((use) => use.content !== null)
				.map((use) => use.name),
		),
	];
	if (skillNames.length === 0) return [];
	return executor.query<ExistingSkillVersionRow>({
		query: `
			SELECT skill_name, content_sha256
			FROM ${getSafeClickHouseTable(SKILL_VERSION_CONTENTS_TABLE)}
			WHERE organization_id = {organizationId:String}
				AND skill_name IN {skillNames:Array(String)}
			GROUP BY organization_id, skill_name, content_sha256
		`,
		query_params: {
			organizationId: input.organizationId,
			skillNames,
		},
	});
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
		is_deleted: 0,
		extraction_seq: input.extractionSeq,
		extracted_at: extractedAt,
	};
}

function buildTombstoneRow(
	active: ActiveSkillUseRow,
	input: SkillExtractionRunInput,
	extractedAt: string,
): RudelSkillUsesRow {
	return {
		organization_id: input.organizationId,
		skill_name: active.skill_name,
		agent: input.extraction.agent,
		user_id: input.userId,
		session_id: input.sessionId,
		content_sha256: "",
		source_content_sha256: input.extraction.sourceContentSha256,
		used_at: normalizeClickHouseTimestamp(active.used_at),
		parser_version: input.extraction.parserVersion,
		is_deleted: 1,
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

function versionKey(skillName: string, contentSha256: string): string {
	return `${skillName}\u0000${contentSha256}`;
}

function toClickHouseTimestamp(value: Date): string {
	return value.toISOString().replace("T", " ").replace("Z", "");
}

function normalizeClickHouseTimestamp(value: string): string {
	const date = new Date(
		/(?:Z|[+-]\d\d:\d\d)$/u.test(value) ? value : `${value.replace(" ", "T")}Z`,
	);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid ClickHouse timestamp: ${value}`);
	}
	return toClickHouseTimestamp(date);
}
