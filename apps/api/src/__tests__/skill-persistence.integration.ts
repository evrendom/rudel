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
	buildActiveSkillUsesCte,
	buildSkillExtractionRows,
	buildSkillExtractionSeq,
	createSkillExtractionRun,
	writeSkillExtraction,
	writeSkillExtractionRowBatch,
	writeSkillUseRows,
	writeSkillVersionContentRows,
} from "../services/skill-extraction-ingest.service.js";
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

	test("keeps a fast newer raw revision active after a slow older extraction finishes", async () => {
		const clickhouse = getClickhouse();
		const sessionId = `skill_raw_order_${RUN_ID}`;
		const olderRawRevision = new Date("2026-08-20T11:00:00.000Z");
		const newerRawRevision = new Date("2026-08-20T11:01:00.000Z");
		const olderSeq = buildSkillExtractionSeq(olderRawRevision, 1);
		const newerSeq = buildSkillExtractionSeq(newerRawRevision, 1);
		const olderContentHash = "1".repeat(64);
		const newerContentHash = "2".repeat(64);
		await clickhouse.insert({
			table: "rudel.skill_version_contents",
			values: [
				{
					organization_id: userId,
					skill_name: "raw-order-skill",
					content_sha256: newerContentHash,
					user_id: userId,
					content: "newer body",
					parser_version: 1,
					extraction_seq: newerSeq,
					extracted_at: "2026-08-20 11:02:00.000",
				},
			],
		});
		await clickhouse.insert({
			table: "rudel.skill_uses",
			values: [
				buildUseRow({
					contentSha256: newerContentHash,
					extractedAt: "2026-08-20 11:02:00.000",
					extractionSeq: newerSeq,
					parserVersion: 1,
					sessionId,
					skillName: "raw-order-skill",
					sourceContentSha256: "b".repeat(64),
					usedAt: "2026-08-20 11:01:00.000",
				}),
			],
		});
		await clickhouse.insert({
			table: "rudel.skill_receipts",
			values: [
				buildReceiptRow({
					extractedAt: "2026-08-20 11:02:00.000",
					extractionSeq: newerSeq,
					parserVersion: 1,
					sessionId,
					sourceContentSha256: "b".repeat(64),
				}),
			],
		});

		// The older raw revision finishes later and is appended after the newer run.
		await clickhouse.insert({
			table: "rudel.skill_version_contents",
			values: [
				{
					organization_id: userId,
					skill_name: "raw-order-skill",
					content_sha256: olderContentHash,
					user_id: userId,
					content: "older body",
					parser_version: 1,
					extraction_seq: olderSeq,
					extracted_at: "2026-08-20 11:10:00.000",
				},
			],
		});
		await clickhouse.insert({
			table: "rudel.skill_uses",
			values: [
				buildUseRow({
					contentSha256: olderContentHash,
					extractedAt: "2026-08-20 11:10:00.000",
					extractionSeq: olderSeq,
					parserVersion: 1,
					sessionId,
					skillName: "raw-order-skill",
					sourceContentSha256: "a".repeat(64),
					usedAt: "2026-08-20 11:00:00.000",
				}),
			],
		});
		await clickhouse.insert({
			table: "rudel.skill_receipts",
			values: [
				buildReceiptRow({
					extractedAt: "2026-08-20 11:10:00.000",
					extractionSeq: olderSeq,
					parserVersion: 1,
					sessionId,
					sourceContentSha256: "a".repeat(64),
				}),
			],
		});

		const detail = HistoricalSkillDetailSchema.parse(
			readJsonEnvelope(
				(
					await callRpc("analytics/skills/detail", {
						name: "raw-order-skill",
					})
				).body,
			),
		);
		expect(detail.versions).toHaveLength(1);
		expect(detail.versions[0]).toMatchObject({
			content: "newer body",
			contentSha256: newerContentHash,
			sourceAgent: "claude",
		});
	});

	test("keeps the committed generation active when a newer use is orphaned before and after FINAL", async () => {
		const clickhouse = getClickhouse();
		const sessionId = `skill_orphan_generation_${RUN_ID}`;
		const skillName = "orphan-generation-skill";
		const committedHash = "6".repeat(64);
		const orphanHash = "7".repeat(64);
		await insertSkillRun({
			content: "committed body",
			contentSha256: committedHash,
			extractedAt: "2026-08-20 11:11:00.000",
			extractionSeq: buildSkillExtractionSeq(
				new Date("2026-08-20T11:10:00.000Z"),
				1,
			),
			parserVersion: 1,
			sessionId,
			skillName,
			sourceContentSha256: "8".repeat(64),
		});
		const orphanSeq = buildSkillExtractionSeq(
			new Date("2026-08-20T11:12:00.000Z"),
			1,
		);
		await clickhouse.insert({
			table: "rudel.skill_version_contents",
			values: [
				{
					organization_id: userId,
					skill_name: skillName,
					content_sha256: orphanHash,
					user_id: userId,
					content: "orphan body",
					parser_version: 1,
					extraction_seq: orphanSeq,
					extracted_at: "2026-08-20 11:13:00.000",
				},
			],
		});
		await clickhouse.insert({
			table: "rudel.skill_uses",
			values: [
				buildUseRow({
					contentSha256: orphanHash,
					extractedAt: "2026-08-20 11:13:00.000",
					extractionSeq: orphanSeq,
					parserVersion: 1,
					sessionId,
					skillName,
					sourceContentSha256: "9".repeat(64),
					usedAt: "2026-08-20 11:12:00.000",
				}),
			],
		});

		const assertCommittedGeneration = async () => {
			const detail = HistoricalSkillDetailSchema.parse(
				readJsonEnvelope(
					(await callRpc("analytics/skills/detail", { name: skillName })).body,
				),
			);
			expect(detail).toMatchObject({ sessionCount: 1 });
			expect(detail.versions).toHaveLength(1);
			expect(detail.versions[0]).toMatchObject({
				content: "committed body",
				contentSha256: committedHash,
			});
		};

		await assertCommittedGeneration();
		await clickhouse.execute({
			query: "OPTIMIZE TABLE rudel.skill_uses FINAL",
		});
		await assertCommittedGeneration();
	});

	test("activates a higher-parser replay for the same raw revision", async () => {
		const rawRevision = new Date("2026-08-20T11:20:00.000Z");
		const sessionId = `skill_parser_replay_${RUN_ID}`;
		await insertSkillRun({
			content: "parser one body",
			contentSha256: "3".repeat(64),
			extractedAt: "2026-08-20 11:21:00.000",
			extractionSeq: buildSkillExtractionSeq(rawRevision, 1),
			parserVersion: 1,
			sessionId,
			skillName: "parser-replay-skill",
			sourceContentSha256: "c".repeat(64),
		});
		await insertSkillRun({
			content: "parser two body",
			contentSha256: "4".repeat(64),
			extractedAt: "2026-08-20 11:22:00.000",
			extractionSeq: buildSkillExtractionSeq(rawRevision, 2),
			parserVersion: 2,
			sessionId,
			skillName: "parser-replay-skill",
			sourceContentSha256: "d".repeat(64),
		});

		const detail = HistoricalSkillDetailSchema.parse(
			readJsonEnvelope(
				(
					await callRpc("analytics/skills/detail", {
						name: "parser-replay-skill",
					})
				).body,
			),
		);
		expect(detail.versions).toHaveLength(1);
		expect(detail.versions[0]?.content).toBe("parser two body");
	});

	test("retries a failed attempt with a fresh deterministic run and activates it", async () => {
		const sessionId = `skill_receipt_retry_${RUN_ID}`;
		const rawRevision = new Date("2026-08-20T11:30:00.000Z");
		const clickhouse = getClickhouse();
		const writeInput = {
			extractedAt: new Date("2026-08-20T11:31:00.000Z"),
			extraction: extractSessionSkills({
				content: claudeTranscript(
					"receipt-retry-skill",
					"# Receipt retry body\n",
				),
				parserVersion: 1,
				sessionDate: rawRevision.toISOString(),
				source: "claude_code" as const,
			}),
			organizationId: userId,
			rawRevisionIngestedAt: rawRevision,
			sessionDate: rawRevision,
			sessionId,
			userId,
		};
		const failedRun = createSkillExtractionRun(writeInput);
		const failedRows = buildSkillExtractionRows(failedRun, []);
		await writeSkillVersionContentRows(clickhouse, failedRows.contentRows);
		await writeSkillUseRows(clickhouse, failedRows.useRows);

		const beforeRetry = HistoricalSkillDetailSchema.parse(
			readJsonEnvelope(
				(
					await callRpc("analytics/skills/detail", {
						name: "receipt-retry-skill",
					})
				).body,
			),
		);
		expect(beforeRetry).toMatchObject({ sessionCount: 0, versions: [] });

		const retryRun = createSkillExtractionRun(writeInput);
		expect(retryRun).not.toBe(failedRun);
		expect(retryRun.extractionSeq).toBe(failedRun.extractionSeq);
		const retryRows = buildSkillExtractionRows(retryRun, []);
		await writeSkillExtractionRowBatch(clickhouse, retryRows);

		const afterRetry = HistoricalSkillDetailSchema.parse(
			readJsonEnvelope(
				(
					await callRpc("analytics/skills/detail", {
						name: "receipt-retry-skill",
					})
				).body,
			),
		);
		expect(afterRetry).toMatchObject({ sessionCount: 1 });
		expect(afterRetry.versions[0]?.content).toBe("# Receipt retry body\n");
	});

	test("keeps a live newer revision active when an older backfill flushes later", async () => {
		const clickhouse = getClickhouse();
		const organizationId = `skill_concurrent_org_${RUN_ID}`;
		const backfillUserId = `skill_concurrent_user_${RUN_ID}`;
		const sessionId = `skill_concurrent_${RUN_ID}`;
		const skillName = "concurrent-skill";
		const sessionDate = new Date(Date.now() - 120_000);
		const olderIngestedAt = new Date(Date.now() - 90_000);
		const cutoff = new Date(Date.now() - 60_000);
		const newerIngestedAt = new Date(Date.now() - 30_000);
		const oldContent = claudeTranscript(skillName, "# Backfill old body\n");
		const newContent = claudeTranscript(skillName, "# Live new body\n");
		let liveInserted = false;
		const concurrentExecutor = createInsertInterceptor(
			clickhouse,
			async (table) => {
				if (liveInserted || table !== "rudel.skill_version_contents") return;
				liveInserted = true;
				await ingestRudelClaudeSessions(clickhouse, [
					buildRawClaudeRow({
						content: newContent,
						ingestedAt: newerIngestedAt,
						organizationId,
						sessionDate,
						sessionId,
						userId: backfillUserId,
					}),
				]);
				await writeSkillExtraction(clickhouse, {
					extractedAt: new Date(),
					extraction: extractSessionSkills({
						content: newContent,
						parserVersion: SKILL_PARSER_VERSION,
						sessionDate: sessionDate.toISOString(),
						source: "claude_code",
					}),
					organizationId,
					rawRevisionIngestedAt: newerIngestedAt,
					sessionDate,
					sessionId,
					userId: backfillUserId,
				});
			},
		);
		try {
			await ingestRudelClaudeSessions(clickhouse, [
				buildRawClaudeRow({
					content: oldContent,
					ingestedAt: olderIngestedAt,
					organizationId,
					sessionDate,
					sessionId,
					userId: backfillUserId,
				}),
			]);
			const result = await backfillSkillExtractions(concurrentExecutor, {
				batchMaxBytes: 16 * 1024 * 1024,
				batchMaxRows: 1,
				cutoff,
				maxSessionBytes: 16 * 1024 * 1024,
				maxSessions: 10,
				organizationId,
			});
			expect(result).toMatchObject({ completedCount: 1, failedCount: 0 });
			expect(liveInserted).toBe(true);
			const [active] = await clickhouse.query<{ content: string }>({
				query: `
					WITH ${buildActiveSkillUsesCte()}
					SELECT contents.content
					FROM active_skill_uses AS uses
					INNER ANY JOIN rudel.skill_version_contents AS contents
						ON contents.organization_id = uses.organization_id
						AND contents.skill_name = uses.skill_name
						AND contents.content_sha256 = uses.content_sha256
					WHERE uses.organization_id = {organizationId:String}
						AND uses.skill_name = {skillName:String}
				`,
				query_params: { organizationId, skillName },
			});
			expect(active?.content).toBe("# Live new body\n");
		} finally {
			await deleteSkillTestOrganization(organizationId, true);
		}
	});

	test("buffers writes across raw read batches and isolates a parse failure", async () => {
		const batchOrganizationId = `skill_batch_org_${RUN_ID}`;
		const batchUserId = `skill_batch_user_${RUN_ID}`;
		const firstGoodSessionId = `skill_batch_good_one_${RUN_ID}`;
		const secondGoodSessionId = `skill_batch_good_two_${RUN_ID}`;
		const failedSessionId = `skill_batch_failed_${RUN_ID}`;
		const clickhouse = getClickhouse();
		const ingestedAt = new Date(Date.now() - 60_000);
		const sessionDate = new Date(Date.now() - 120_000);
		const insertTables: string[] = [];
		const countingExecutor = createCountingExecutor(clickhouse, insertTables);
		try {
			await ingestRudelClaudeSessions(clickhouse, [
				buildRawClaudeRow({
					content: claudeTranscript("batch-good-one", "# Good batch one\n"),
					ingestedAt,
					organizationId: batchOrganizationId,
					sessionDate,
					sessionId: firstGoodSessionId,
					userId: batchUserId,
				}),
				buildRawClaudeRow({
					content: claudeTranscript("batch-good-two", "# Good batch two\n"),
					ingestedAt,
					organizationId: batchOrganizationId,
					sessionDate,
					sessionId: secondGoodSessionId,
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
					batchMaxRows: 1,
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

			expect(result).toMatchObject({ completedCount: 2, failedCount: 1 });
			expect(insertTables.sort()).toEqual([
				"rudel.skill_receipts",
				"rudel.skill_uses",
				"rudel.skill_version_contents",
			]);
			expect(
				await countBatchRows("rudel.skill_receipts", batchOrganizationId),
			).toBe(2);
			expect(
				await countBatchRows("rudel.skill_uses", batchOrganizationId),
			).toBe(2);
			expect(
				await countBatchRows(
					"rudel.skill_version_contents",
					batchOrganizationId,
				),
			).toBe(2);
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

	test("chunks oversized content-version lookups without changing deduplication", async () => {
		const skillCount = 1_001;
		const organizationId = `skill_lookup_chunks_org_${RUN_ID}`;
		const backfillUserId = `skill_lookup_chunks_user_${RUN_ID}`;
		const sessionId = `skill_lookup_chunks_${RUN_ID}`;
		const clickhouse = getClickhouse();
		const ingestedAt = new Date(Date.now() - 60_000);
		const sessionDate = new Date(Date.now() - 120_000);
		const content = manyClaudeSkillsTranscript(skillCount);
		const extraction = extractSessionSkills({
			content,
			parserVersion: SKILL_PARSER_VERSION,
			sessionDate: sessionDate.toISOString(),
			source: "claude_code",
		});
		expect(extraction.uses).toHaveLength(skillCount);
		const run = createSkillExtractionRun({
			extractedAt: new Date(),
			extraction,
			organizationId,
			rawRevisionIngestedAt: ingestedAt,
			sessionDate,
			sessionId,
			userId: backfillUserId,
		});
		const [existingContentRow] = buildSkillExtractionRows(run, []).contentRows;
		assert.ok(existingContentRow);
		const lookupChunkSizes: number[] = [];
		let insertedContentRowCount = 0;
		const countingExecutor = createSkillVersionLookupInterceptor(clickhouse, {
			async beforeInsert(table, rowCount) {
				if (table === "rudel.skill_version_contents") {
					insertedContentRowCount += rowCount;
				}
			},
			async beforeLookup(statement) {
				const versionIdentities = statement.query_params?.versionIdentities;
				assert.ok(Array.isArray(versionIdentities));
				lookupChunkSizes.push(versionIdentities.length);
			},
		});
		try {
			await writeSkillVersionContentRows(clickhouse, [existingContentRow]);
			await ingestRudelClaudeSessions(clickhouse, [
				buildRawClaudeRow({
					content,
					ingestedAt,
					organizationId,
					sessionDate,
					sessionId,
					userId: backfillUserId,
				}),
			]);
			const result = await backfillSkillExtractions(countingExecutor, {
				batchMaxBytes: 16 * 1024 * 1024,
				batchMaxRows: 1,
				cutoff: new Date(),
				maxSessionBytes: 16 * 1024 * 1024,
				maxSessions: 10,
				organizationId,
			});

			expect(result).toMatchObject({ completedCount: 1, failedCount: 0 });
			expect(lookupChunkSizes).toEqual([1_000, 1]);
			expect(insertedContentRowCount).toBe(skillCount - 1);
			expect(
				await countBatchRows("rudel.skill_version_contents", organizationId),
			).toBe(skillCount);
		} finally {
			await deleteSkillTestOrganization(organizationId, true);
		}
	});

	test("reinserts content and continues when a version lookup chunk fails", async () => {
		const organizationId = `skill_lookup_failure_org_${RUN_ID}`;
		const backfillUserId = `skill_lookup_failure_user_${RUN_ID}`;
		const sessionId = `skill_lookup_failure_${RUN_ID}`;
		const clickhouse = getClickhouse();
		const ingestedAt = new Date(Date.now() - 60_000);
		const sessionDate = new Date(Date.now() - 120_000);
		let lookupFailed = false;
		let insertedContentRowCount = 0;
		const failingExecutor = createSkillVersionLookupInterceptor(clickhouse, {
			async beforeInsert(table, rowCount) {
				if (table === "rudel.skill_version_contents") {
					insertedContentRowCount += rowCount;
				}
			},
			async beforeLookup() {
				if (lookupFailed) return;
				lookupFailed = true;
				throw new Error("intentional content-version lookup failure");
			},
		});
		try {
			await ingestRudelClaudeSessions(clickhouse, [
				buildRawClaudeRow({
					content: claudeTranscript(
						"lookup-failure-skill",
						"# Lookup failure body\n",
					),
					ingestedAt,
					organizationId,
					sessionDate,
					sessionId,
					userId: backfillUserId,
				}),
			]);
			const result = await backfillSkillExtractions(failingExecutor, {
				batchMaxBytes: 16 * 1024 * 1024,
				batchMaxRows: 1,
				cutoff: new Date(),
				maxSessionBytes: 16 * 1024 * 1024,
				maxSessions: 10,
				organizationId,
			});

			expect(lookupFailed).toBe(true);
			expect(result).toMatchObject({ completedCount: 1, failedCount: 0 });
			expect(insertedContentRowCount).toBe(1);
			expect(
				await countBatchRows("rudel.skill_version_contents", organizationId),
			).toBe(1);
		} finally {
			await deleteSkillTestOrganization(organizationId, true);
		}
	});

	test("accounts a receipt-buffer flush failure per candidate without aborting the job", async () => {
		const organizationId = `skill_flush_org_${RUN_ID}`;
		const backfillUserId = `skill_flush_user_${RUN_ID}`;
		const sessionId = `skill_flush_${RUN_ID}`;
		const clickhouse = getClickhouse();
		const ingestedAt = new Date(Date.now() - 60_000);
		const sessionDate = new Date(Date.now() - 120_000);
		const cutoff = new Date();
		const options: SkillExtractionBackfillOptions = {
			batchMaxBytes: 16 * 1024 * 1024,
			batchMaxRows: 1,
			cutoff,
			maxSessionBytes: 16 * 1024 * 1024,
			maxSessions: 10,
			organizationId,
		};
		let receiptFailed = false;
		const failingExecutor = createInsertInterceptor(
			clickhouse,
			async (table) => {
				if (table === "rudel.skill_receipts" && !receiptFailed) {
					receiptFailed = true;
					throw new Error("intentional receipt flush failure");
				}
			},
		);
		try {
			await ingestRudelClaudeSessions(clickhouse, [
				buildRawClaudeRow({
					content: claudeTranscript("flush-skill", "# Flush body\n"),
					ingestedAt,
					organizationId,
					sessionDate,
					sessionId,
					userId: backfillUserId,
				}),
			]);
			const failed = await backfillSkillExtractions(failingExecutor, options);
			expect(failed).toMatchObject({ completedCount: 0, failedCount: 1 });
			expect(failed.issues[0]?.detail).toContain(
				"skill receipt write flush failed",
			);
			expect(await countBatchRows("rudel.skill_receipts", organizationId)).toBe(
				0,
			);
			expect(await countBatchRows("rudel.skill_uses", organizationId)).toBe(1);
			const [active] = await clickhouse.query<{ row_count: number }>({
				query: `
					WITH ${buildActiveSkillUsesCte()}
					SELECT count() AS row_count
					FROM active_skill_uses
				`,
				query_params: { organizationId },
			});
			expect(active?.row_count ?? 0).toBe(0);
		} finally {
			await deleteSkillTestOrganization(organizationId, true);
		}
	});
});

function buildUseRow(input: {
	readonly contentSha256: string;
	readonly extractedAt: string;
	readonly extractionSeq: string;
	readonly organizationId?: string;
	readonly parserVersion: number;
	readonly sessionId: string;
	readonly skillName: string;
	readonly sourceContentSha256: string;
	readonly usedAt: string;
	readonly userId?: string;
}): Record<string, unknown> {
	return {
		agent: "claude",
		content_sha256: input.contentSha256,
		extracted_at: input.extractedAt,
		extraction_seq: input.extractionSeq,
		organization_id: input.organizationId ?? userId,
		parser_version: input.parserVersion,
		session_id: input.sessionId,
		skill_name: input.skillName,
		source_content_sha256: input.sourceContentSha256,
		used_at: input.usedAt,
		user_id: input.userId ?? userId,
	};
}

function buildReceiptRow(input: {
	readonly extractedAt: string;
	readonly extractionSeq: string;
	readonly organizationId?: string;
	readonly parserVersion: number;
	readonly sessionId: string;
	readonly sourceContentSha256: string;
	readonly userId?: string;
}): Record<string, unknown> {
	return {
		agent: "claude",
		extracted_at: input.extractedAt,
		extraction_seq: input.extractionSeq,
		organization_id: input.organizationId ?? userId,
		parser_version: input.parserVersion,
		session_id: input.sessionId,
		source_content_sha256: input.sourceContentSha256,
		user_id: input.userId ?? userId,
	};
}

async function insertSkillRun(input: {
	readonly content: string;
	readonly contentSha256: string;
	readonly extractedAt: string;
	readonly extractionSeq: string;
	readonly parserVersion: number;
	readonly sessionId: string;
	readonly skillName: string;
	readonly sourceContentSha256: string;
}): Promise<void> {
	const clickhouse = getClickhouse();
	await clickhouse.insert({
		table: "rudel.skill_version_contents",
		values: [
			{
				organization_id: userId,
				skill_name: input.skillName,
				content_sha256: input.contentSha256,
				user_id: userId,
				content: input.content,
				parser_version: input.parserVersion,
				extraction_seq: input.extractionSeq,
				extracted_at: input.extractedAt,
			},
		],
	});
	await clickhouse.insert({
		table: "rudel.skill_uses",
		values: [
			buildUseRow({
				contentSha256: input.contentSha256,
				extractedAt: input.extractedAt,
				extractionSeq: input.extractionSeq,
				parserVersion: input.parserVersion,
				sessionId: input.sessionId,
				skillName: input.skillName,
				sourceContentSha256: input.sourceContentSha256,
				usedAt: input.extractedAt,
			}),
		],
	});
	await clickhouse.insert({
		table: "rudel.skill_receipts",
		values: [
			buildReceiptRow({
				extractedAt: input.extractedAt,
				extractionSeq: input.extractionSeq,
				parserVersion: input.parserVersion,
				sessionId: input.sessionId,
				sourceContentSha256: input.sourceContentSha256,
			}),
		],
	});
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

function createInsertInterceptor(
	delegate: ClickHouseExecutor,
	beforeInsert: (table: string) => Promise<void>,
): ClickHouseExecutor {
	return {
		close: () => delegate.close(),
		execute: (statement) => delegate.execute(statement),
		insert: async (params) => {
			await beforeInsert(params.table);
			await delegate.insert(params);
		},
		query: <Row>(statement: ClickHouseStatement) =>
			delegate.query<Row>(statement),
	};
}

function createSkillVersionLookupInterceptor(
	delegate: ClickHouseExecutor,
	handlers: {
		readonly beforeInsert: (table: string, rowCount: number) => Promise<void>;
		readonly beforeLookup: (statement: ClickHouseStatement) => Promise<void>;
	},
): ClickHouseExecutor {
	return {
		close: () => delegate.close(),
		execute: (statement) => delegate.execute(statement),
		insert: async (params) => {
			await handlers.beforeInsert(params.table, params.values.length);
			await delegate.insert(params);
		},
		query: async <Row>(statement: ClickHouseStatement) => {
			if (statement.query.includes("versionIdentities:Array")) {
				await handlers.beforeLookup(statement);
			}
			return delegate.query<Row>(statement);
		},
	};
}

async function deleteSkillTestOrganization(
	organizationId: string,
	includeRaw: boolean,
): Promise<void> {
	const tables = [
		"rudel.skill_receipts",
		"rudel.skill_uses",
		"rudel.skill_version_contents",
		...(includeRaw ? ["rudel.claude_sessions"] : []),
	];
	for (const table of tables) {
		await getClickhouse().execute({
			query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {organizationId:String} SETTINGS lightweight_deletes_sync = 3`,
			query_params: { organizationId },
		});
	}
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

function manyClaudeSkillsTranscript(skillCount: number): string {
	return Array.from({ length: skillCount }, (_, index) => {
		const suffix = index.toString().padStart(4, "0");
		return claudeTranscript(
			`lookup-skill-${suffix}`,
			`# Lookup body ${suffix}\n`,
		);
	}).join("\n");
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
