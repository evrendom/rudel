import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import { SCAN_VERSION } from "@rudel/language-signals";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { deleteOrgSessions } from "../services/org-session.service.js";
import { getSessionAnalytics } from "../services/session-analytics.service.js";
import {
	buildSessionLanguageSignalRow,
	insertSessionLanguageSignalRows,
	persistSessionLanguageSignalsBestEffort,
} from "../services/session-language-signal-persistence.service.js";
import {
	buildStaleSessionLanguageSignalQuery,
	reconcileSessionLanguageSignalsOnce,
	reconcileSessionLanguageSignalsUntilCaughtUp,
	type StaleSessionLanguageSignalRow,
} from "../services/session-language-signal-reconciliation.service.js";

const ch = getClickhouse();
const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const orgId = `language_signals_${runId}`;
const purgeOrgId = `language_signals_purge_${runId}`;
const userId = `language_signals_user_${runId}`;
const sessionTimestamp = new Date().toISOString();
const assistantTimestamp = new Date(
	new Date(sessionTimestamp).getTime() + 1_000,
).toISOString();

setDefaultTimeout(180_000);

interface LatestSignalRow {
	member_apologies: number;
	member_positive: number;
	member_swears: number;
	model_apologies: number;
	model_positive: number;
	model_swears: number;
	raw_ingested_at_ms: number | string;
	scan_version: number;
	session_id: string;
}

interface CountRow {
	count: number | string;
}

function transcript(memberText: string, modelText = "plain response"): string {
	return [
		JSON.stringify({
			message: { content: memberText, role: "user" },
			sessionId: "language-signals-integration",
			timestamp: sessionTimestamp,
			type: "user",
			uuid: crypto.randomUUID(),
		}),
		JSON.stringify({
			message: {
				content: [{ text: modelText, type: "text" }],
				id: crypto.randomUUID(),
				model: "claude-sonnet-4-5",
				role: "assistant",
				usage: {
					cache_creation_input_tokens: 0,
					cache_read_input_tokens: 0,
					input_tokens: 10,
					output_tokens: 5,
				},
			},
			sessionId: "language-signals-integration",
			timestamp: assistantTimestamp,
			type: "assistant",
			uuid: crypto.randomUUID(),
		}),
	].join("\n");
}

async function ingestRawSession(input: {
	content: string;
	ingestedAt: Date;
	organizationId?: string;
	sessionId: string;
	userId?: string;
}) {
	const organizationId = input.organizationId ?? orgId;
	const ingestUserId = input.userId ?? userId;
	const sessionInput: IngestSessionInput = {
		content: input.content,
		projectPath: "/test/session-language-signals",
		sessionId: input.sessionId,
		source: "claude_code",
	};
	const adapter = getAdapter(sessionInput.source);
	const timestamps = adapter.extractTimestamps(sessionInput.content);
	if (!timestamps) throw new Error("integration transcript has no timestamps");

	await adapter.ingest(ch, sessionInput, {
		ingestedAt: input.ingestedAt,
		organizationId,
		timestamps,
		userId: ingestUserId,
	});

	return {
		organizationId,
		sessionDate: timestamps.sessionDate,
	};
}

async function latestSignal(
	sessionId: string,
	organizationId = orgId,
): Promise<LatestSignalRow | undefined> {
	const rows = await ch.query<LatestSignalRow>({
		query: `
			SELECT
				session_id,
				argMax(scan_version, scanned_at) AS scan_version,
				argMax(member_swears, scanned_at) AS member_swears,
				argMax(member_apologies, scanned_at) AS member_apologies,
				argMax(member_positive, scanned_at) AS member_positive,
				argMax(model_swears, scanned_at) AS model_swears,
				argMax(model_apologies, scanned_at) AS model_apologies,
				argMax(model_positive, scanned_at) AS model_positive,
				toUnixTimestamp64Milli(argMax(raw_ingested_at, scanned_at)) AS raw_ingested_at_ms
			FROM ${getSafeClickHouseTable("rudel.session_language_signals")}
			WHERE organization_id = {organizationId:String}
				AND session_id = {sessionId:String}
			GROUP BY session_id
		`,
		query_params: { organizationId, sessionId },
	});
	return rows[0];
}

async function countSignalRows(
	organizationId: string,
	sessionId?: string,
): Promise<number> {
	const rows = await ch.query<CountRow>({
		query: `
			SELECT count() AS count
			FROM ${getSafeClickHouseTable("rudel.session_language_signals")}
			WHERE organization_id = {organizationId:String}
			${sessionId ? "AND session_id = {sessionId:String}" : ""}
		`,
		query_params: { organizationId, sessionId },
	});
	return Number(rows[0]?.count ?? 0);
}

async function waitForAnalyticsRows(
	sessionIds: readonly string[],
): Promise<void> {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const rows = await ch.query<{ session_id: string }>({
			query: `
				SELECT session_id
				FROM ${getSafeClickHouseTable("rudel.session_analytics")} FINAL
				WHERE organization_id = {orgId:String}
					AND session_id IN ({sessionIds:Array(String)})
			`,
			query_params: { orgId, sessionIds },
		});
		if (new Set(rows.map((row) => row.session_id)).size === sessionIds.length) {
			return;
		}
		await Bun.sleep(500);
	}
	throw new Error("session analytics rows did not become visible");
}

afterAll(async () => {
	for (const table of [
		"rudel.claude_sessions",
		"rudel.codex_sessions",
		"rudel.session_analytics",
		"rudel.session_language_signals",
	]) {
		await ch
			.execute({
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id IN ({orgId:String}, {purgeOrgId:String})`,
				query_params: { orgId, purgeOrgId },
			})
			.catch(() => {});
	}
});

describe("persisted session language signals (ClickHouse integration)", () => {
	test("the upload writer stores counts with the current scan version", async () => {
		const sessionId = `upload_${runId}`;
		const content = transcript("shit sorry excellent", "fuck sorry great");
		const ingestedAt = new Date("2099-01-01T00:00:01.000Z");
		const raw = await ingestRawSession({ content, ingestedAt, sessionId });

		await persistSessionLanguageSignalsBestEffort({
			content,
			organizationId: orgId,
			rawIngestedAt: ingestedAt,
			sessionDate: raw.sessionDate,
			sessionId,
			source: "claude_code",
			userId,
		});

		expect(await latestSignal(sessionId)).toMatchObject({
			member_apologies: 1,
			member_positive: 1,
			member_swears: 1,
			model_apologies: 1,
			model_positive: 0,
			model_swears: 1,
			scan_version: SCAN_VERSION,
		});
	});

	test("the janitor fills missing rows newest-first and duplicate passes converge", async () => {
		const olderSessionId = `janitor_older_${runId}`;
		const newerSessionId = `janitor_newer_${runId}`;
		await ingestRawSession({
			content: transcript("shit"),
			ingestedAt: new Date("2099-01-01T00:00:02.000Z"),
			sessionId: olderSessionId,
		});
		await ingestRawSession({
			content: transcript("sorry"),
			ingestedAt: new Date("2099-01-01T00:00:03.000Z"),
			sessionId: newerSessionId,
		});

		expect(await reconcileSessionLanguageSignalsOnce(1)).toMatchObject({
			rescanned: 1,
		});
		expect(await latestSignal(newerSessionId)).toMatchObject({
			member_apologies: 1,
		});
		expect(await latestSignal(olderSessionId)).toBeUndefined();

		await reconcileSessionLanguageSignalsUntilCaughtUp(25);
		expect(await latestSignal(olderSessionId)).toMatchObject({
			member_swears: 1,
		});
		const rowsBeforeDuplicatePass = await countSignalRows(
			orgId,
			olderSessionId,
		);
		expect(await reconcileSessionLanguageSignalsOnce(25)).toMatchObject({
			rescanned: 0,
		});
		expect(await countSignalRows(orgId, olderSessionId)).toBe(
			rowsBeforeDuplicatePass,
		);
	});

	test("one janitor write preserves the raw revision and converges", async () => {
		const sessionId = `timezone_convergence_${runId}`;
		const content = transcript("sorry");
		const ingestedAt = new Date("2099-01-01T00:00:03.500Z");
		await ingestRawSession({ content, ingestedAt, sessionId });

		expect(await reconcileSessionLanguageSignalsOnce(1)).toMatchObject({
			rescanned: 1,
		});
		const persisted = await latestSignal(sessionId);
		expect(Number(persisted?.raw_ingested_at_ms)).toBe(ingestedAt.getTime());
		expect(await reconcileSessionLanguageSignalsOnce(25)).toMatchObject({
			rescanned: 0,
		});
	});

	test("stale discovery finds a genuine older scan version", async () => {
		const sessionId = `version_stale_${runId}`;
		const content = transcript("sorry");
		const ingestedAt = new Date("2099-01-01T00:00:04.000Z");
		const raw = await ingestRawSession({ content, ingestedAt, sessionId });
		await insertSessionLanguageSignalRows(ch, [
			buildSessionLanguageSignalRow(
				{
					organizationId: orgId,
					rawIngestedAt: ingestedAt,
					sessionDate: raw.sessionDate,
					sessionId,
					source: "claude_code",
					userId,
				},
				{
					member_apologies: 1,
					member_positive: 0,
					member_swears: 0,
					model_apologies: 0,
					model_positive: 0,
					model_swears: 0,
				},
				new Date(),
			),
		]);

		const staleRows = await ch.query<StaleSessionLanguageSignalRow>({
			clickhouse_settings: { join_use_nulls: 0 },
			query: buildStaleSessionLanguageSignalQuery(),
			query_params: {
				batchSize: 100,
				offset: 0,
				scanVersion: SCAN_VERSION + 1,
			},
		});

		expect(staleRows.some((row) => row.session_id === sessionId)).toBe(true);
	});

	test("the janitor repairs a raw-stale row", async () => {
		const sessionId = `stale_${runId}`;
		const firstContent = transcript("sorry");
		const firstIngestedAt = new Date("2099-01-01T00:00:05.000Z");
		const raw = await ingestRawSession({
			content: firstContent,
			ingestedAt: firstIngestedAt,
			sessionId,
		});
		await persistSessionLanguageSignalsBestEffort({
			content: firstContent,
			organizationId: orgId,
			rawIngestedAt: firstIngestedAt,
			sessionDate: raw.sessionDate,
			sessionId,
			source: "claude_code",
			userId,
		});

		const secondIngestedAt = new Date("2099-01-01T00:00:09.000Z");
		await ingestRawSession({
			content: transcript("shit shit"),
			ingestedAt: secondIngestedAt,
			sessionId,
		});
		await reconcileSessionLanguageSignalsOnce(1);
		const repaired = await latestSignal(sessionId);
		expect(repaired).toMatchObject({ member_swears: 2 });
		expect(Number(repaired?.raw_ingested_at_ms)).toBe(
			secondIngestedAt.getTime(),
		);
	});

	test("sessions.list returns persisted counts and zeroes for zero/no-row sessions", async () => {
		const countedSessionId = `list_counted_${runId}`;
		const filteredSessionId = `list_filtered_${runId}`;
		const filteredUserId = `language_signals_filtered_user_${runId}`;
		const zeroSessionId = `list_zero_${runId}`;
		const noRowSessionId = `list_no_row_${runId}`;
		const countedContent = transcript("shit sorry excellent");
		const filteredContent = transcript("shit shit sorry");
		const zeroContent = transcript("plain prompt");

		const countedRaw = await ingestRawSession({
			content: countedContent,
			ingestedAt: new Date("2099-01-01T00:00:10.000Z"),
			sessionId: countedSessionId,
		});
		const zeroRaw = await ingestRawSession({
			content: zeroContent,
			ingestedAt: new Date("2099-01-01T00:00:11.000Z"),
			sessionId: zeroSessionId,
		});
		await ingestRawSession({
			content: zeroContent,
			ingestedAt: new Date("2099-01-01T00:00:12.000Z"),
			sessionId: noRowSessionId,
		});
		const filteredRaw = await ingestRawSession({
			content: filteredContent,
			ingestedAt: new Date("2099-01-01T00:00:12.500Z"),
			sessionId: filteredSessionId,
			userId: filteredUserId,
		});
		await persistSessionLanguageSignalsBestEffort({
			content: countedContent,
			organizationId: orgId,
			rawIngestedAt: new Date("2099-01-01T00:00:10.000Z"),
			sessionDate: countedRaw.sessionDate,
			sessionId: countedSessionId,
			source: "claude_code",
			userId,
		});
		await persistSessionLanguageSignalsBestEffort({
			content: zeroContent,
			organizationId: orgId,
			rawIngestedAt: new Date("2099-01-01T00:00:11.000Z"),
			sessionDate: zeroRaw.sessionDate,
			sessionId: zeroSessionId,
			source: "claude_code",
			userId,
		});
		await persistSessionLanguageSignalsBestEffort({
			content: filteredContent,
			organizationId: orgId,
			rawIngestedAt: new Date("2099-01-01T00:00:12.500Z"),
			sessionDate: filteredRaw.sessionDate,
			sessionId: filteredSessionId,
			source: "claude_code",
			userId: filteredUserId,
		});
		await waitForAnalyticsRows([
			countedSessionId,
			filteredSessionId,
			zeroSessionId,
			noRowSessionId,
		]);

		const day = sessionTimestamp.slice(0, 10);
		const sessions = await getSessionAnalytics(orgId, {
			end_date: day,
			limit: 100,
			start_date: day,
		});
		const byId = new Map(
			sessions.map((session) => [session.session_id, session]),
		);
		expect(byId.get(countedSessionId)).toMatchObject({
			member_apologies: 1,
			member_positive: 1,
			member_swears: 1,
		});
		expect(byId.get(zeroSessionId)).toMatchObject({
			member_apologies: 0,
			member_positive: 0,
			member_swears: 0,
		});
		expect(byId.get(noRowSessionId)).toMatchObject({
			member_apologies: 0,
			member_positive: 0,
			member_swears: 0,
			model_apologies: 0,
			model_positive: 0,
			model_swears: 0,
		});

		const filteredSessions = await getSessionAnalytics(orgId, {
			end_date: day,
			limit: 100,
			start_date: day,
			user_id: filteredUserId,
		});
		expect(filteredSessions.map((session) => session.session_id)).toEqual([
			filteredSessionId,
		]);
		expect(filteredSessions[0]).toMatchObject({
			member_apologies: 1,
			member_positive: 0,
			member_swears: 2,
			user_id: filteredUserId,
		});
	});

	test("organization deletion purges persisted signal rows", async () => {
		const sessionId = `purge_${runId}`;
		const content = transcript("shit");
		const ingestedAt = new Date("2099-01-01T00:00:13.000Z");
		const raw = await ingestRawSession({
			content,
			ingestedAt,
			organizationId: purgeOrgId,
			sessionId,
		});
		await persistSessionLanguageSignalsBestEffort({
			content,
			organizationId: purgeOrgId,
			rawIngestedAt: ingestedAt,
			sessionDate: raw.sessionDate,
			sessionId,
			source: "claude_code",
			userId,
		});
		expect(await countSignalRows(purgeOrgId)).toBe(1);

		await deleteOrgSessions(purgeOrgId);
		expect(await countSignalRows(purgeOrgId)).toBe(0);
	});
});
