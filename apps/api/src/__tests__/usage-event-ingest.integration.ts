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

	test("replaces replayed Codex v1-shaped events with one request-context v2 event and tombstones", async () => {
		const transitions = codexTransitions();
		const legacyShape = extractUsageEvents({
			content: transitions,
			organizationId,
			sessionId,
			source: "codex",
			subagents: {},
			userId,
		});
		if (legacyShape.status !== "complete") {
			throw new Error(
				`Expected complete legacy-shape extraction: ${JSON.stringify(legacyShape.diagnostics)}`,
			);
		}
		expect(legacyShape.events).toHaveLength(3);

		await writeUsageExtraction(executor, {
			contentSha256: "c".repeat(64),
			extraction: legacyShape,
			filterVersion: 1,
			generation: "3",
			ingestedAt: new Date("2026-08-03T12:02:00.000Z"),
			organizationId,
			sessionDate: new Date("2026-08-03T12:02:00.000Z"),
			sessionId,
			source: "codex",
			userId,
		});

		const replaySafe = extractUsageEvents({
			content: [codexSessionMeta(), transitions].join("\n"),
			organizationId,
			sessionId,
			source: "codex",
			subagents: {},
			userId,
		});
		if (replaySafe.status !== "complete") {
			throw new Error(
				`Expected complete replay-safe extraction: ${JSON.stringify(replaySafe.diagnostics)}`,
			);
		}
		expect(replaySafe.events).toHaveLength(1);

		await writeUsageExtraction(executor, {
			contentSha256: "d".repeat(64),
			extraction: replaySafe,
			filterVersion: 1,
			generation: "4",
			ingestedAt: new Date("2026-08-03T12:03:00.000Z"),
			organizationId,
			replaceAbsentEvents: true,
			sessionDate: new Date("2026-08-03T12:03:00.000Z"),
			sessionId,
			source: "codex",
			userId,
		});

		expect(await readActiveCodexEvents()).toEqual([
			{
				cache_read_input_tokens: "40",
				context_input_tokens: "50",
				output_tokens: "5",
				uncached_input_tokens: "10",
			},
		]);
		expect(await countLatestCodexTombstones()).toBe(2);
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

async function readActiveCodexEvents() {
	return executor.query<{
		cache_read_input_tokens: string;
		context_input_tokens: string;
		output_tokens: string;
		uncached_input_tokens: string;
	}>({
		query: `
			WITH ${buildActiveUsageEventsCte()}
			SELECT
				toString(cache_read_input_tokens) AS cache_read_input_tokens,
				toString(context_input_tokens) AS context_input_tokens,
				toString(output_tokens) AS output_tokens,
				toString(uncached_input_tokens) AS uncached_input_tokens
			FROM active_usage_events
		`,
		query_params: {
			organizationId,
			sessionId,
			source: "codex",
			userId,
		},
	});
}

async function countLatestCodexTombstones(): Promise<number> {
	const [row] = await executor.query<{ tombstone_count: number }>({
		query: `
			SELECT toUInt32(count()) AS tombstone_count
			FROM (
				SELECT argMax(is_deleted, event_version) AS is_deleted
				FROM rudel.usage_events
				WHERE organization_id = {organizationId:String}
					AND user_id = {userId:String}
					AND source = {source:String}
					AND session_id = {sessionId:String}
				GROUP BY event_id
			)
			WHERE is_deleted = 1
		`,
		query_params: {
			organizationId,
			sessionId,
			source: "codex",
			userId,
		},
	});
	return row?.tombstone_count ?? 0;
}

function codexSessionMeta(): string {
	return JSON.stringify({
		payload: {
			forked_from_id: "parent-session",
			id: sessionId,
		},
		timestamp: "2026-08-03T12:02:00.000Z",
		type: "session_meta",
	});
}

function codexTransitions(): string {
	return [
		JSON.stringify({
			payload: { model: "gpt-5.6-sol" },
			timestamp: "2026-08-03T12:02:00.000Z",
			type: "turn_context",
		}),
		codexUsageLine(
			{ cached: 80, input: 100, output: 10, reasoning: 2 },
			{ cached: 80, input: 100, output: 10, reasoning: 2 },
			"2026-08-03T12:02:00.000Z",
		),
		codexUsageLine(
			{ cached: 160, input: 200, output: 20, reasoning: 4 },
			{ cached: 80, input: 100, output: 10, reasoning: 2 },
			"2026-08-03T12:02:00.020Z",
		),
		codexUsageLine(
			{ cached: 200, input: 250, output: 25, reasoning: 5 },
			{ cached: 40, input: 50, output: 5, reasoning: 1 },
			"2026-08-03T12:02:02.000Z",
		),
	].join("\n");
}

function codexUsageLine(
	total: { cached: number; input: number; output: number; reasoning: number },
	last: { cached: number; input: number; output: number; reasoning: number },
	timestamp: string,
): string {
	return JSON.stringify({
		payload: {
			info: {
				last_token_usage: {
					cached_input_tokens: last.cached,
					input_tokens: last.input,
					output_tokens: last.output,
					reasoning_output_tokens: last.reasoning,
					total_tokens: last.input + last.output,
				},
				total_token_usage: {
					cached_input_tokens: total.cached,
					input_tokens: total.input,
					output_tokens: total.output,
					reasoning_output_tokens: total.reasoning,
					total_tokens: total.input + total.output,
				},
			},
			type: "token_count",
		},
		timestamp,
		type: "event_msg",
	});
}
