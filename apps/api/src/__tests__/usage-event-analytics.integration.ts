import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import {
	ingestRudelSessionAnalytics,
	ingestRudelUsageEvents,
	type RudelSessionAnalyticsRow,
	type RudelUsageEventsRow,
} from "@rudel/ch-schema/generated";
import { createClickHouseExecutor } from "../clickhouse.js";
import {
	buildUsageCostSubtotalSql,
	buildUsageEventAnalyticsCte,
} from "../services/usage-event-analytics.service.js";

setDefaultTimeout(30_000);

const runId = crypto.randomUUID();
const organizationId = `usage_analytics_org_${runId}`;
const userId = `usage_analytics_user_${runId}`;
const isolatedOrganizationId = `usage_analytics_other_org_${runId}`;
const isolatedUserId = `usage_analytics_other_user_${runId}`;
const resolvedSessionId = `usage_analytics_resolved_${runId}`;
const unresolvedSessionId = `usage_analytics_unresolved_${runId}`;
const unsupportedTierSessionId = `usage_analytics_unsupported_tier_${runId}`;
const openAiFastSessionId = `usage_analytics_openai_fast_${runId}`;
const claudeFastUsSessionId = `usage_analytics_claude_fast_us_${runId}`;
const longContextSessionId = `usage_analytics_long_${runId}`;
const mismatchedSessionId = `usage_analytics_mismatch_${runId}`;
const partialSessionId = `usage_analytics_partial_${runId}`;
const incompleteSessionId = `usage_analytics_incomplete_${runId}`;
const invalidTimestampSessionId = `usage_analytics_invalid_timestamp_${runId}`;
const deletedReceiptSessionId = `usage_analytics_deleted_receipt_${runId}`;
const tombstonedSessionId = `usage_analytics_tombstone_${runId}`;
const missingMetadataSessionId = `usage_analytics_missing_metadata_${runId}`;
const eventId = "a".repeat(64);
const receiptId = "b".repeat(64);
const executor = createClickHouseExecutor({
	database: "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
});

beforeAll(async () => {
	await ingestRudelSessionAnalytics(
		executor,
		[
			...[
				resolvedSessionId,
				unresolvedSessionId,
				unsupportedTierSessionId,
				openAiFastSessionId,
				claudeFastUsSessionId,
				longContextSessionId,
				mismatchedSessionId,
				partialSessionId,
				incompleteSessionId,
				invalidTimestampSessionId,
				deletedReceiptSessionId,
				tombstonedSessionId,
			].map(buildSessionAnalyticsRow),
			{
				...buildSessionAnalyticsRow(resolvedSessionId),
				organization_id: isolatedOrganizationId,
				user_id: isolatedUserId,
			},
		],
		{ validate: true },
	);

	await ingestRudelUsageEvents(
		executor,
		[
			buildEventRow(resolvedSessionId, "1"),
			buildReceiptRow(resolvedSessionId, "1", 1, true),
			buildEventRow(resolvedSessionId, "2", {
				cache_read_input_tokens: "2000000",
				cache_write_1h_input_tokens: "2000000",
				cache_write_5m_input_tokens: "2000000",
				context_input_tokens: "8000000",
				model_provider: "",
				output_tokens: "2000000",
				uncached_input_tokens: "2000000",
			}),
			buildReceiptRow(resolvedSessionId, "2", 1, true),
			buildEventRow(unresolvedSessionId, "1", {
				model_status: "unresolved",
				raw_model: "mystery-model",
				resolved_model: "",
			}),
			buildReceiptRow(unresolvedSessionId, "1", 1, true),
			buildEventRow(unsupportedTierSessionId, "1", {
				service_tier: "batch",
			}),
			buildReceiptRow(unsupportedTierSessionId, "1", 1, true),
			buildEventRow(openAiFastSessionId, "1", {
				cache_read_input_tokens: "100000",
				cache_write_1h_input_tokens: "0",
				cache_write_5m_input_tokens: "0",
				context_input_tokens: "200000",
				model_provider: "openai",
				output_tokens: "100000",
				raw_model: "gpt-5.4",
				resolved_model: "gpt-5.4",
				service_tier: "fast",
				source: "codex",
				uncached_input_tokens: "100000",
			}),
			buildReceiptRow(openAiFastSessionId, "1", 1, true, "codex"),
			buildEventRow(claudeFastUsSessionId, "1", {
				inference_geo: "us",
				inference_speed: "fast",
				model_provider: "anthropic",
				raw_model: "claude-opus-4-8",
				resolved_model: "claude-opus-4-8",
				service_tier: "priority",
			}),
			buildReceiptRow(claudeFastUsSessionId, "1", 1, true),
			buildEventRow(longContextSessionId, "1", {
				cache_read_input_tokens: "0",
				cache_write_1h_input_tokens: "0",
				cache_write_5m_input_tokens: "0",
				context_input_tokens: "272001",
				model_provider: "openai",
				output_tokens: "1000000",
				raw_model: "gpt-5.6-sol",
				resolved_model: "gpt-5.6-sol",
				service_tier: "auto",
				source: "codex",
				uncached_input_tokens: "1000000",
			}),
			buildReceiptRow(longContextSessionId, "1", 1, true, "codex"),
			buildEventRow(mismatchedSessionId, "1"),
			buildReceiptRow(mismatchedSessionId, "1", 2, true),
			buildEventRow(partialSessionId, "1"),
			buildEventRow(partialSessionId, "1", {
				event_id: "f".repeat(64),
				model_status: "unresolved",
				raw_model: "mystery-model",
				resolved_model: "",
			}),
			buildReceiptRow(partialSessionId, "1", 2, true),
			buildEventRow(incompleteSessionId, "1"),
			buildReceiptRow(incompleteSessionId, "1", 1, true),
			{
				...buildReceiptRow(incompleteSessionId, "2", 0, false),
				event_id: "e".repeat(64),
			},
			buildEventRow(invalidTimestampSessionId, "1", {
				has_valid_timestamp: 0,
				occurred_at: "1970-01-01 00:00:00.000",
				usage_date: "1970-01-01",
			}),
			buildReceiptRow(invalidTimestampSessionId, "1", 1, true),
			buildEventRow(deletedReceiptSessionId, "1"),
			buildReceiptRow(deletedReceiptSessionId, "1", 1, true),
			{
				...buildReceiptRow(deletedReceiptSessionId, "2", 0, false),
				event_id: "9".repeat(64),
				is_deleted: 1,
			},
			buildEventRow(tombstonedSessionId, "1"),
			buildReceiptRow(tombstonedSessionId, "1", 1, true),
			buildEventRow(tombstonedSessionId, "2", { is_deleted: 1 }),
			buildReceiptRow(tombstonedSessionId, "2", 0, true),
			buildEventRow(missingMetadataSessionId, "1"),
			buildReceiptRow(missingMetadataSessionId, "1", 1, true),
			{
				...buildEventRow(resolvedSessionId, "1"),
				organization_id: isolatedOrganizationId,
				user_id: isolatedUserId,
			},
			{
				...buildReceiptRow(resolvedSessionId, "1", 1, true),
				organization_id: isolatedOrganizationId,
				user_id: isolatedUserId,
			},
		],
		{ validate: true },
	);
});

afterAll(async () => {
	await executor
		.execute({
			query: `DELETE FROM rudel.usage_events WHERE organization_id IN ({organizationId:String}, {isolatedOrganizationId:String}) SETTINGS lightweight_deletes_sync = 3`,
			query_params: { isolatedOrganizationId, organizationId },
		})
		.catch(() => {});
	await executor
		.execute({
			query: `DELETE FROM rudel.session_analytics WHERE organization_id IN ({organizationId:String}, {isolatedOrganizationId:String}) SETTINGS lightweight_deletes_sync = 3`,
			query_params: { isolatedOrganizationId, organizationId },
		})
		.catch(() => {});
	await executor.close();
});

describe("usage-event analytics ClickHouse rollups", () => {
	test("resolves replacement generations, receipt consistency, pricing, and metadata joins", async () => {
		const rows = await readAnalyticsRows();

		expect(rows).toEqual([
			{
				cost_is_complete: 1,
				estimated_cost: 102.85,
				input_tokens: "4000000",
				model_used: "claude-opus-4-1",
				output_tokens: "1000000",
				session_id: claudeFastUsSessionId,
				total_tokens: "5000000",
			},
			{
				cost_is_complete: 0,
				estimated_cost: 0,
				input_tokens: "4000000",
				model_used: "claude-opus-4-1",
				output_tokens: "1000000",
				session_id: invalidTimestampSessionId,
				total_tokens: "5000000",
			},
			{
				cost_is_complete: 1,
				estimated_cost: 55,
				input_tokens: "1000000",
				model_used: "claude-opus-4-1",
				output_tokens: "1000000",
				session_id: longContextSessionId,
				total_tokens: "2000000",
			},
			{
				cost_is_complete: 1,
				estimated_cost: 3.55,
				input_tokens: "200000",
				model_used: "claude-opus-4-1",
				output_tokens: "100000",
				session_id: openAiFastSessionId,
				total_tokens: "300000",
			},
			{
				cost_is_complete: 0,
				estimated_cost: 28.05,
				input_tokens: "8000000",
				model_used: "claude-opus-4-1",
				output_tokens: "2000000",
				session_id: partialSessionId,
				total_tokens: "10000000",
			},
			{
				cost_is_complete: 1,
				estimated_cost: 56.1,
				input_tokens: "8000000",
				model_used: "claude-opus-4-1",
				output_tokens: "2000000",
				session_id: resolvedSessionId,
				total_tokens: "10000000",
			},
			{
				cost_is_complete: 1,
				estimated_cost: 0,
				input_tokens: "0",
				model_used: "claude-opus-4-1",
				output_tokens: "0",
				session_id: tombstonedSessionId,
				total_tokens: "0",
			},
			{
				cost_is_complete: 0,
				estimated_cost: 0,
				input_tokens: "4000000",
				model_used: "claude-opus-4-1",
				output_tokens: "1000000",
				session_id: unresolvedSessionId,
				total_tokens: "5000000",
			},
			{
				cost_is_complete: 0,
				estimated_cost: 0,
				input_tokens: "4000000",
				model_used: "claude-opus-4-1",
				output_tokens: "1000000",
				session_id: unsupportedTierSessionId,
				total_tokens: "5000000",
			},
		]);
		expect(
			rows.some((row) => row.session_id === missingMetadataSessionId),
		).toBe(false);
		for (const excludedSessionId of [
			deletedReceiptSessionId,
			incompleteSessionId,
			mismatchedSessionId,
		]) {
			expect(rows.some((row) => row.session_id === excludedSessionId)).toBe(
				false,
			);
		}
	});

	test("returns the known aggregate subtotal without discarding completeness", async () => {
		const rows = await executor.query<{
			cost: number;
			incomplete_sessions: number;
		}>({
			query: `
				WITH ${buildUsageEventAnalyticsCte()}
				SELECT
					${buildUsageCostSubtotalSql("estimated_cost", 4)} AS cost,
					countIf(cost_is_complete = 0) AS incomplete_sessions
				FROM usage_analytics_sessions
			`,
			query_params: { orgId: organizationId },
		});

		expect(rows).toEqual([{ cost: 245.55, incomplete_sessions: 4 }]);
	});

	test("keeps bounded key prefixes visible across the shared query families", async () => {
		const cases = [
			{
				cte: buildUsageEventAnalyticsCte(),
				params: { orgId: organizationId },
				relation: "usage_analytics_sessions",
				where: "session_date >= now64(3) - toIntervalDay(30)",
			},
			{
				cte: buildUsageEventAnalyticsCte({ userIdParam: "userId" }),
				params: { orgId: organizationId, userId },
				relation: "usage_analytics_daily_sessions",
				where: "usage_date >= today() - toIntervalDay(30)",
			},
			{
				cte: buildUsageEventAnalyticsCte({
					sessionIdParam: "sessionId",
					sourceParam: "source",
					userIdParam: "userId",
				}),
				params: {
					orgId: organizationId,
					sessionId: resolvedSessionId,
					source: "claude_code",
					userId,
				},
				relation: "usage_analytics_sessions",
				where: "session_id = {sessionId:String}",
			},
		] as const;

		for (const testCase of cases) {
			const explainRows = await executor.query<{ explain: string }>({
				query: `
					EXPLAIN indexes = 1
					WITH ${testCase.cte}
					SELECT sum(total_tokens)
					FROM ${testCase.relation}
					WHERE organization_id = {orgId:String}
						AND ${testCase.where}
				`,
				query_params: testCase.params,
			});
			const plan = explainRows.map((row) => row.explain).join("\n");

			expect(plan).toContain("PrimaryKey");
			expect(plan).toContain("organization_id");
		}
	});
});

async function readAnalyticsRows() {
	return executor.query<{
		cost_is_complete: number;
		estimated_cost: number | null;
		input_tokens: string;
		model_used: string;
		output_tokens: string;
		session_id: string;
		total_tokens: string;
	}>({
		query: `
			WITH ${buildUsageEventAnalyticsCte()}
			SELECT
				session_id,
				toString(input_tokens) AS input_tokens,
				toString(output_tokens) AS output_tokens,
				toString(total_tokens) AS total_tokens,
				model_used,
				estimated_cost,
				cost_is_complete
			FROM usage_analytics_sessions
			ORDER BY session_id
		`,
		query_params: { orgId: organizationId },
	});
}

function buildSessionAnalyticsRow(sessionId: string): RudelSessionAnalyticsRow {
	return {
		actual_duration_min: 10,
		avg_period_sec: 1,
		cache_creation_input_tokens: "0",
		cache_read_input_tokens: "0",
		error_count: 0,
		error_pattern: "",
		filter_version: 1,
		git_branch: null,
		git_remote: "https://github.com/rudel/test.git",
		git_sha: null,
		has_commit: 0,
		human_duration_sec: 0,
		inference_duration_sec: 0,
		ingested_at: "2026-08-04 08:01:00.000",
		input_tokens: "999999999",
		last_interaction_date: "2026-08-04 08:01:00.000",
		long_pauses: 0,
		median_period_sec: 1,
		model_used: "claude-opus-4-1",
		normal_responses: 1,
		organization_id: organizationId,
		output_tokens: "999999999",
		package_name: "rudel",
		package_type: "bun",
		project_path: "/workspace/rudel",
		quick_responses: 0,
		session_archetype: "standard",
		session_date: "2026-08-04 08:00:00.000",
		session_id: sessionId,
		skills: [],
		slash_commands: [],
		source:
			sessionId === longContextSessionId || sessionId === openAiFastSessionId
				? "codex"
				: "claude_code",
		subagent_types: [],
		success_score: 80,
		tag: null,
		total_interactions: 1,
		total_tokens: "1999999998",
		used_plan_mode: 0,
		user_id: userId,
	};
}

function buildEventRow(
	sessionId: string,
	generation: string,
	overrides: Partial<RudelUsageEventsRow> = {},
): RudelUsageEventsRow {
	return {
		agent_id: "main",
		cache_read_input_tokens: "1000000",
		cache_write_1h_input_tokens: "1000000",
		cache_write_5m_input_tokens: "1000000",
		content_sha256: "c".repeat(64),
		context_input_tokens: "4000000",
		duplicate_observation_count: 0,
		event_id: eventId,
		event_identity_version: 1,
		event_version: generation,
		extraction_version: 1,
		filter_version: 1,
		first_observed_line: 1,
		has_valid_timestamp: 1,
		identity_kind: "message_id",
		inference_geo: "",
		inference_speed: "",
		ingested_at: `2026-08-04 08:0${generation}:00.000`,
		is_deleted: 0,
		lineage_id: "main",
		model_rate_card_version: "2026-08-05",
		model_status: "resolved",
		model_provider: "anthropic",
		occurred_at: "2026-08-04 08:00:00.000",
		organization_id: organizationId,
		output_tokens: "1000000",
		parent_lineage_id: "",
		quality_flags: [],
		raw_model: "claude-sonnet-4-5",
		reasoning_output_tokens: "250000",
		receipt_checksum: "0".repeat(64),
		receipt_event_count: 0,
		receipt_is_complete: 0,
		record_kind: "event",
		resolved_model: "claude-sonnet-4-5",
		service_tier: "standard",
		session_id: sessionId,
		source: "claude_code",
		token_source: "provider_increment",
		uncached_input_tokens: "1000000",
		usage_date: "2026-08-04",
		user_id: userId,
		...overrides,
	};
}

function buildReceiptRow(
	sessionId: string,
	generation: string,
	eventCount: number,
	complete: boolean,
	source = "claude_code",
): RudelUsageEventsRow {
	return {
		...buildEventRow(sessionId, generation, {
			cache_read_input_tokens: "0",
			cache_write_1h_input_tokens: "0",
			cache_write_5m_input_tokens: "0",
			context_input_tokens: "0",
			event_id: receiptId,
			first_observed_line: 0,
			has_valid_timestamp: 0,
			identity_kind: "receipt",
			model_status: "missing",
			occurred_at: "1970-01-01 00:00:00.000",
			output_tokens: "0",
			raw_model: "",
			reasoning_output_tokens: "0",
			receipt_checksum: "d".repeat(64),
			receipt_event_count: eventCount,
			receipt_is_complete: complete ? 1 : 0,
			record_kind: "receipt",
			resolved_model: "",
			service_tier: "",
			source,
			uncached_input_tokens: "0",
		}),
	};
}
