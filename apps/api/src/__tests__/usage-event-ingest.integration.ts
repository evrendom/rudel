import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { extractUsageEvents } from "@rudel/usage-events";
import {
	type ClickHouseExecutor,
	createClickHouseExecutor,
} from "../clickhouse.js";
import {
	buildActiveUsageEventsCte,
	writeUsageExtraction,
} from "../services/usage-event-ingest.service.js";

setDefaultTimeout(30_000);

const sessionId = `usage_event_ingest_${crypto.randomUUID()}`;
const organizationId = "usage_event_integration_org";
const userId = "usage_event_integration_user";
const executor = createClickHouseExecutor({
	database: "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
});

afterAll(async () => {
	await executor
		.execute({
			query: `DELETE FROM rudel.usage_events WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String} SETTINGS lightweight_deletes_sync = 3`,
			query_params: { organizationId, sessionId },
		})
		.catch(() => {});
	await executor.close();
});

describe("usage event ClickHouse persistence", () => {
	test("writes a complete generation and atomically retires it with an explicit zero-event replacement", async () => {
		const extraction = extractUsageEvents({
			content: claudeUsageLine(),
			organizationId,
			sessionId,
			source: "claude_code",
			subagents: {},
			userId,
		});
		if (extraction.status !== "complete") {
			throw new Error(
				`Expected complete extraction: ${JSON.stringify(extraction.diagnostics)}`,
			);
		}

		await writeUsageExtraction(executor, {
			contentSha256: "a".repeat(64),
			extraction,
			filterVersion: 1,
			generation: "1",
			ingestedAt: new Date("2026-08-03T12:00:00.000Z"),
			organizationId,
			sessionDate: new Date("2026-08-03T12:00:00.000Z"),
			sessionId,
			source: "claude_code",
			userId,
		});

		const activeBefore = await readActiveRecords();
		expect(activeBefore).toEqual([
			{ is_deleted: 0, receipt_event_count: 0, record_kind: "event" },
		]);

		const emptyExtraction = extractUsageEvents({
			content: JSON.stringify({
				message: { role: "user" },
				timestamp: "2026-08-03T12:01:00.000Z",
				type: "user",
			}),
			organizationId,
			sessionId,
			source: "claude_code",
			subagents: {},
			userId,
		});
		if (emptyExtraction.status !== "complete") {
			throw new Error(
				`Expected complete empty extraction: ${JSON.stringify(emptyExtraction.diagnostics)}`,
			);
		}
		const injectedFailure: ClickHouseExecutor = {
			close: () => Promise.resolve(),
			execute: (statement) => executor.execute(statement),
			insert: () => Promise.reject(new Error("injected replacement failure")),
			query: <T>(statement: Parameters<ClickHouseExecutor["query"]>[0]) =>
				executor.query<T>(statement),
		};
		await expect(
			writeUsageExtraction(injectedFailure, {
				contentSha256: "b".repeat(64),
				extraction: emptyExtraction,
				filterVersion: 1,
				generation: "2",
				ingestedAt: new Date("2026-08-03T12:01:00.000Z"),
				organizationId,
				replaceAbsentEvents: true,
				sessionDate: new Date("2026-08-03T12:01:00.000Z"),
				sessionId,
				source: "claude_code",
				userId,
			}),
		).rejects.toThrow("injected replacement failure");
		expect(await readActiveRecords()).toEqual(activeBefore);

		await writeUsageExtraction(executor, {
			contentSha256: "b".repeat(64),
			extraction: emptyExtraction,
			filterVersion: 1,
			generation: "2",
			ingestedAt: new Date("2026-08-03T12:01:00.000Z"),
			organizationId,
			replaceAbsentEvents: true,
			sessionDate: new Date("2026-08-03T12:01:00.000Z"),
			sessionId,
			source: "claude_code",
			userId,
		});

		const activeAfterReplacement: Awaited<
			ReturnType<typeof readActiveRecords>
		> = [];
		expect(await readActiveRecords()).toEqual(activeAfterReplacement);

		await writeUsageExtraction(executor, {
			contentSha256: "b".repeat(64),
			extraction: emptyExtraction,
			filterVersion: 1,
			generation: "2",
			ingestedAt: new Date("2026-08-03T12:01:00.000Z"),
			organizationId,
			replaceAbsentEvents: true,
			sessionDate: new Date("2026-08-03T12:01:00.000Z"),
			sessionId,
			source: "claude_code",
			userId,
		});
		expect(await readActiveRecords()).toEqual(activeAfterReplacement);
	});
});

async function readActiveRecords() {
	return executor.query<{
		is_deleted: number;
		receipt_event_count: number;
		record_kind: string;
	}>({
		query: `
			WITH ${buildActiveUsageEventsCte()}
			SELECT
				record_kind,
				is_deleted,
				receipt_event_count
			FROM active_usage_events
			ORDER BY record_kind DESC
		`,
		query_params: {
			organizationId,
			sessionId,
			source: "claude_code",
			userId,
		},
	});
}

function claudeUsageLine(): string {
	return JSON.stringify({
		message: {
			id: "message-1",
			model: "claude-sonnet-4-5",
			role: "assistant",
			usage: {
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 5,
				input_tokens: 10,
				output_tokens: 2,
			},
		},
		requestId: "request-1",
		timestamp: "2026-08-03T12:00:00.000Z",
		type: "assistant",
	});
}
