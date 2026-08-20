import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import {
	HistoricalSkillDetailSchema,
	HistoricalSkillSummarySchema,
	type IngestSessionInput,
} from "@rudel/api-routes";
import {
	ingestRudelClaudeSessions,
	type RudelClaudeSessionsRow,
} from "@rudel/ch-schema/generated";
import {
	type ClickHouseExecutor,
	type ClickHouseStatement,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { sqlClient } from "../db.js";
import {
	extractSessionSkills,
	SKILL_PARSER_VERSION,
} from "../services/skill-extraction.js";
import {
	backfillSkillExtractions,
	type SkillExtractionBackfillOptions,
} from "../services/skill-extraction-backfill.service.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

setDefaultTimeout(60_000);

const RUN_ID = crypto.randomUUID();
const CLAUDE_SESSION_ID = `skill_claude_${RUN_ID}`;
const CODEX_SESSION_ID = `skill_codex_${RUN_ID}`;
const CLAUDE_BODY = "# Claude readable body\n\nByte-identical content.\n";
const CODEX_BODY = [
	"---",
	"name: shared-skill",
	"description: Codex body.",
	"---",
	"",
	"# Codex readable body",
	"",
].join("\n");

let server: ApiTestServer;
let bearerToken: string;
let userId: string;

beforeAll(async () => {
	server = await startApiTestServer({
		SKILL_ANALYTICS_CUTOVER_MODE: "all",
		SKILL_EXTRACTION_ENABLED: "true",
	});
	({ bearerToken, userId } = await createTestUser(server.baseUrl));
});

afterAll(async () => {
	await server?.stop();
	const clickhouse = getClickhouse();
	for (const table of [
		"rudel.skill_receipts",
		"rudel.skill_uses",
		"rudel.skill_version_contents",
		"rudel.usage_events",
		"rudel.claude_sessions",
		"rudel.codex_sessions",
	]) {
		await clickhouse.execute({
			query: `DELETE FROM ${table} WHERE organization_id = {organizationId:String} SETTINGS lightweight_deletes_sync = 3`,
			query_params: { organizationId: userId },
		});
	}
	await sqlClient`
		DELETE FROM organization
		WHERE id = ${userId}
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id = ${userId}
	`;
});

describe("persistent skill extraction through the real API", () => {
	test("keeps content readable across ingest, replacement, idempotent backfill, and parser upgrades", async () => {
		const claudeUpload = await callRpc("ingestSession", claudeInput());
		expect(claudeUpload.status).toBe(200);
		const initialList = HistoricalSkillSummarySchema.array().parse(
			readJsonEnvelope((await callRpc("analytics/skills/list")).body),
		);
		expect(initialList).toEqual([
			{
				name: "shared-skill",
				sessionCount: 1,
				claudeSessionCount: 1,
				codexSessionCount: 0,
			},
		]);

		const claudeDetail = HistoricalSkillDetailSchema.parse(
			readJsonEnvelope(
				(await callRpc("analytics/skills/detail", { name: "shared-skill" }))
					.body,
			),
		);
		expect(claudeDetail.versions[0]?.content).toBe(CLAUDE_BODY);
		expect(claudeDetail.versions[0]?.sourceAgent).toBe("claude");

		const codexUpload = await callRpc("ingestSession", codexInput());
		expect(codexUpload.status).toBe(200);
		const mergedDetail = HistoricalSkillDetailSchema.parse(
			readJsonEnvelope(
				(await callRpc("analytics/skills/detail", { name: "shared-skill" }))
					.body,
			),
		);
		expect(mergedDetail).toMatchObject({
			claudeSessionCount: 1,
			codexSessionCount: 1,
			sessionCount: 2,
			sourceAgents: ["claude", "codex"],
			unavailableSessionCount: 0,
		});
		expect(
			mergedDetail.versions.map((version) => [
				version.sourceAgent,
				version.content,
			]),
		).toEqual([
			["codex", CODEX_BODY],
			["claude", CLAUDE_BODY],
		]);

		const replacement = await callRpc("ingestSession", {
			...claudeInput(),
			content: claudeTranscript("removed-skill", "# Removed\n"),
			force_replace: true,
		});
		expect(replacement.status).toBe(200);
		const afterReplacement = HistoricalSkillSummarySchema.array().parse(
			readJsonEnvelope((await callRpc("analytics/skills/list")).body),
		);
		expect(afterReplacement).toEqual([
			{
				name: "removed-skill",
				sessionCount: 1,
				claudeSessionCount: 1,
				codexSessionCount: 0,
			},
			{
				name: "shared-skill",
				sessionCount: 1,
				claudeSessionCount: 0,
				codexSessionCount: 1,
			},
		]);

		const physicalBeforeBackfill = await countPhysicalSkillUseRows();
		const cutoff = new Date();
		const options = backfillOptions(SKILL_PARSER_VERSION, cutoff);
		const replay = await backfillSkillExtractions(getClickhouse(), options);
		expect(replay).toMatchObject({
			alreadyCompleteCount: 2,
			completedCount: 0,
			failedCount: 0,
		});
		expect(await countPhysicalSkillUseRows()).toBe(physicalBeforeBackfill);

		const upgraded = await backfillSkillExtractions(
			getClickhouse(),
			backfillOptions(SKILL_PARSER_VERSION + 1, cutoff),
		);
		expect(upgraded).toMatchObject({ completedCount: 2, failedCount: 0 });
		expect(await readLatestSkillParserVersions()).toEqual([
			SKILL_PARSER_VERSION + 1,
			SKILL_PARSER_VERSION + 1,
		]);
		const logicalAfterUpgrade = HistoricalSkillSummarySchema.array().parse(
			readJsonEnvelope((await callRpc("analytics/skills/list")).body),
		);
		expect(logicalAfterUpgrade).toEqual(afterReplacement);
		const physicalAfterUpgrade = await countPhysicalSkillUseRows();

		const upgradedReplay = await backfillSkillExtractions(
			getClickhouse(),
			backfillOptions(SKILL_PARSER_VERSION + 1, cutoff),
		);
		expect(upgradedReplay).toMatchObject({
			alreadyCompleteCount: 2,
			completedCount: 0,
		});
		expect(await countPhysicalSkillUseRows()).toBe(physicalAfterUpgrade);
	});

	test("selects the complete higher-sequence run when extracted_at ties", async () => {
		const clickhouse = getClickhouse();
		const extractedAt = "2026-08-20 12:00:00.000";
		const sessionId = `skill_tie_${RUN_ID}`;
		const olderContentHash = "1".repeat(64);
		const newerContentHash = "2".repeat(64);
		await clickhouse.insert({
			table: "rudel.skill_version_contents",
			values: [
				{
					organization_id: userId,
					skill_name: "tie-skill",
					content_sha256: olderContentHash,
					content: "older body",
					parser_version: 1,
					extraction_seq: "100",
					extracted_at: extractedAt,
				},
				{
					organization_id: userId,
					skill_name: "tie-skill",
					content_sha256: newerContentHash,
					content: "newer body",
					parser_version: 2,
					extraction_seq: "101",
					extracted_at: extractedAt,
				},
			],
		});
		await clickhouse.insert({
			table: "rudel.skill_uses",
			values: [
				buildTieUseRow(sessionId, olderContentHash, "a".repeat(64), "100"),
				buildTieUseRow(sessionId, newerContentHash, "b".repeat(64), "101"),
			],
		});
		await clickhouse.insert({
			table: "rudel.skill_receipts",
			values: [
				buildTieReceiptRow(sessionId, "a".repeat(64), 1, "100"),
				buildTieReceiptRow(sessionId, "b".repeat(64), 2, "101"),
			],
		});

		const detail = HistoricalSkillDetailSchema.parse(
			readJsonEnvelope(
				(await callRpc("analytics/skills/detail", { name: "tie-skill" })).body,
			),
		);
		expect(detail.versions).toHaveLength(1);
		expect(detail.versions[0]).toMatchObject({
			content: "newer body",
			contentSha256: newerContentHash,
			sourceAgent: "claude",
		});
	});

	test("writes one insert per table for a batch and isolates a parse failure", async () => {
		const batchOrganizationId = `skill_batch_org_${RUN_ID}`;
		const batchUserId = `skill_batch_user_${RUN_ID}`;
		const goodSessionId = `skill_batch_good_${RUN_ID}`;
		const failedSessionId = `skill_batch_failed_${RUN_ID}`;
		const clickhouse = getClickhouse();
		const ingestedAt = new Date(Date.now() - 60_000);
		const sessionDate = new Date(Date.now() - 120_000);
		const insertTables: string[] = [];
		const countingExecutor = createCountingExecutor(clickhouse, insertTables);
		try {
			await ingestRudelClaudeSessions(clickhouse, [
				buildRawClaudeRow({
					content: claudeTranscript("batch-good", "# Good batch body\n"),
					ingestedAt,
					organizationId: batchOrganizationId,
					sessionDate,
					sessionId: goodSessionId,
					userId: batchUserId,
				}),
				buildRawClaudeRow({
					content: `${claudeTranscript("batch-failed", "# Failed batch body\n")}\nparse-failure-marker`,
					ingestedAt,
					organizationId: batchOrganizationId,
					sessionDate,
					sessionId: failedSessionId,
					userId: batchUserId,
				}),
			]);
			const result = await backfillSkillExtractions(
				countingExecutor,
				{
					batchMaxBytes: 16 * 1024 * 1024,
					batchMaxRows: 10,
					cutoff: new Date(),
					maxSessionBytes: 16 * 1024 * 1024,
					maxSessions: 10,
					organizationId: batchOrganizationId,
				},
				{
					extractSessionSkills(input) {
						if (input.content.includes("parse-failure-marker")) {
							throw new Error("intentional parser fixture failure");
						}
						return extractSessionSkills(input);
					},
				},
			);

			expect(result).toMatchObject({ completedCount: 1, failedCount: 1 });
			expect(insertTables.sort()).toEqual([
				"rudel.skill_receipts",
				"rudel.skill_uses",
				"rudel.skill_version_contents",
			]);
			expect(
				await countBatchRows("rudel.skill_receipts", batchOrganizationId),
			).toBe(1);
			expect(
				await countBatchRows("rudel.skill_uses", batchOrganizationId),
			).toBe(1);
			expect(
				await countBatchRows(
					"rudel.skill_version_contents",
					batchOrganizationId,
				),
			).toBe(1);
		} finally {
			for (const table of [
				"rudel.skill_receipts",
				"rudel.skill_uses",
				"rudel.skill_version_contents",
				"rudel.claude_sessions",
			]) {
				await clickhouse.execute({
					query: `DELETE FROM ${table} WHERE organization_id = {organizationId:String} SETTINGS lightweight_deletes_sync = 3`,
					query_params: { organizationId: batchOrganizationId },
				});
			}
		}
	});
});

function buildTieUseRow(
	sessionId: string,
	contentSha256: string,
	sourceContentSha256: string,
	extractionSeq: string,
): Record<string, unknown> {
	return {
		agent: "claude",
		content_sha256: contentSha256,
		extracted_at: "2026-08-20 12:00:00.000",
		extraction_seq: extractionSeq,
		is_deleted: 0,
		organization_id: userId,
		parser_version: extractionSeq === "100" ? 1 : 2,
		session_id: sessionId,
		skill_name: "tie-skill",
		source_content_sha256: sourceContentSha256,
		used_at:
			extractionSeq === "100"
				? "2026-08-20 10:00:00.000"
				: "2026-08-20 11:00:00.000",
		user_id: userId,
	};
}

function buildTieReceiptRow(
	sessionId: string,
	sourceContentSha256: string,
	parserVersion: number,
	extractionSeq: string,
): Record<string, unknown> {
	return {
		agent: "claude",
		extracted_at: "2026-08-20 12:00:00.000",
		extraction_seq: extractionSeq,
		organization_id: userId,
		parser_version: parserVersion,
		session_id: sessionId,
		source_content_sha256: sourceContentSha256,
		user_id: userId,
	};
}

function buildRawClaudeRow(input: {
	readonly content: string;
	readonly ingestedAt: Date;
	readonly organizationId: string;
	readonly sessionDate: Date;
	readonly sessionId: string;
	readonly userId: string;
}): RudelClaudeSessionsRow {
	const sessionDate = toClickHouseTimestamp(input.sessionDate);
	return {
		content: input.content,
		filter_version: 5,
		git_branch: null,
		git_remote: "",
		git_sha: null,
		ingested_at: toClickHouseTimestamp(input.ingestedAt),
		last_interaction_date: sessionDate,
		organization_id: input.organizationId,
		package_name: "",
		package_type: "",
		project_path: "/tmp/skill-persistence-batch",
		session_date: sessionDate,
		session_id: input.sessionId,
		subagents: {},
		tag: null,
		user_id: input.userId,
	};
}

function createCountingExecutor(
	delegate: ClickHouseExecutor,
	insertTables: string[],
): ClickHouseExecutor {
	return {
		close: () => delegate.close(),
		execute: (statement) => delegate.execute(statement),
		insert: (params) => {
			insertTables.push(params.table);
			return delegate.insert(params);
		},
		query: <Row>(statement: ClickHouseStatement) =>
			delegate.query<Row>(statement),
	};
}

async function countBatchRows(
	table:
		| "rudel.skill_receipts"
		| "rudel.skill_uses"
		| "rudel.skill_version_contents",
	organizationId: string,
): Promise<number> {
	const [row] = await getClickhouse().query<{ row_count: number }>({
		query: `
			SELECT count() AS row_count
			FROM ${getSafeClickHouseTable(table)}
			WHERE organization_id = {organizationId:String}
		`,
		query_params: { organizationId },
	});
	return row?.row_count ?? 0;
}

function toClickHouseTimestamp(value: Date): string {
	return value.toISOString().replace("T", " ").replace("Z", "");
}

function claudeInput(): IngestSessionInput {
	return {
		content: claudeTranscript("shared-skill", CLAUDE_BODY),
		projectPath: "/tmp/skill-persistence-claude",
		sessionId: CLAUDE_SESSION_ID,
		source: "claude_code",
		upload_mode: "manual",
	};
}

function codexInput(): IngestSessionInput {
	const path = "/Users/test/.codex/skills/shared-skill/SKILL.md";
	return {
		content: [
			JSON.stringify({
				payload: { id: CODEX_SESSION_ID },
				timestamp: "2026-08-20T11:00:00.000Z",
				type: "session_meta",
			}),
			JSON.stringify({
				payload: {
					arguments: JSON.stringify({ cmd: `cat ${path}` }),
					call_id: "skill-call",
					name: "exec_command",
					type: "function_call",
				},
				timestamp: "2026-08-20T11:01:00.000Z",
				type: "response_item",
			}),
			JSON.stringify({
				payload: {
					call_id: "skill-call",
					output: [
						"Chunk ID: integration",
						"Process exited with code 0",
						"Final output:",
						CODEX_BODY,
					].join("\n"),
					type: "function_call_output",
				},
				timestamp: "2026-08-20T11:01:01.000Z",
				type: "response_item",
			}),
		].join("\n"),
		projectPath: "/tmp/skill-persistence-codex",
		sessionId: CODEX_SESSION_ID,
		source: "codex",
		upload_mode: "manual",
	};
}

function claudeTranscript(skillName: string, body: string): string {
	return [
		JSON.stringify({
			message: {
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: `tool-${skillName}`,
						name: "Skill",
						input: { skill: skillName },
					},
				],
			},
			timestamp: "2026-08-20T10:00:00.000Z",
			type: "assistant",
		}),
		JSON.stringify({
			isMeta: true,
			message: {
				role: "user",
				content: `Base directory for this skill: /tmp/skills/${skillName}\n\n${body}`,
			},
			timestamp: "2026-08-20T10:00:01.000Z",
			type: "user",
		}),
	].join("\n");
}

function backfillOptions(
	parserVersion: number,
	cutoff: Date,
): SkillExtractionBackfillOptions {
	return {
		batchMaxBytes: 16 * 1024 * 1024,
		batchMaxRows: 10,
		cutoff,
		maxSessionBytes: 16 * 1024 * 1024,
		maxSessions: 10,
		organizationId: userId,
		parserVersion,
	};
}

async function readLatestSkillParserVersions(): Promise<number[]> {
	const rows = await getClickhouse().query<{ parser_version: number }>({
		query: `
			SELECT tupleElement(receipt_state, 2) AS parser_version
			FROM (
				SELECT argMax(
					tuple(source_content_sha256, parser_version, extraction_seq, extracted_at),
					extraction_seq
				) AS receipt_state
				FROM rudel.skill_receipts
				WHERE organization_id = {organizationId:String}
				GROUP BY organization_id, user_id, agent, session_id
			)
			ORDER BY parser_version
		`,
		query_params: { organizationId: userId },
	});
	return rows.map((row) => Number(row.parser_version));
}

async function countPhysicalSkillUseRows(): Promise<number> {
	const [row] = await getClickhouse().query<{ row_count: number }>({
		query: `
			SELECT count() AS row_count
			FROM rudel.skill_uses
			WHERE organization_id = {organizationId:String}
		`,
		query_params: { organizationId: userId },
	});
	return row?.row_count ?? 0;
}

async function createTestUser(
	baseUrl: string,
): Promise<{ bearerToken: string; userId: string }> {
	const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: `skill-persistence-${RUN_ID}@example.com`,
			name: "Skill Persistence Test",
			password: "skill-persistence-test-password",
		}),
	});
	expect(response.ok).toBe(true);
	const body: unknown = await response.json();
	assert(isAuthResponse(body));
	const me = await fetch(`${baseUrl}/rpc/me`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${body.token}`,
			"Content-Type": "application/json",
		},
		body: "{}",
	});
	expect(me.ok).toBe(true);
	const meBody: unknown = await me.json();
	const json = readJsonEnvelope(meBody);
	assert(isRecord(json) && typeof json.id === "string");
	return { bearerToken: body.token, userId: json.id };
}

async function callRpc(
	path: string,
	input?: Record<string, unknown> | IngestSessionInput,
) {
	const response = await fetch(`${server.baseUrl}/rpc/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${bearerToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(input ? { json: input } : {}),
	});
	return { body: await response.json(), status: response.status };
}

function readJsonEnvelope(value: unknown): unknown {
	if (isRecord(value) && "json" in value) return value.json;
	throw new Error("RPC response did not contain a json envelope");
}

function isAuthResponse(value: unknown): value is { token: string } {
	return isRecord(value) && typeof value.token === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
