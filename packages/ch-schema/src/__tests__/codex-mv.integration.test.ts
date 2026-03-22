import { afterAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClickHouseExecutor } from "@chkit/clickhouse";
import { ingestRudelCodexSessions } from "../generated/chkit-ingest.js";
import type { RudelCodexSessionsRow } from "../generated/chkit-types.js";

const testId = `codex_mv_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const baseExecutor = createClickHouseExecutor({
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	database: "default",
});

const executor: typeof baseExecutor = {
	...baseExecutor,
	async insert(params) {
		const rows = params.values
			.map((r: Record<string, unknown>) => JSON.stringify(r))
			.join("\n");
		const sql = `INSERT INTO ${params.table} SETTINGS async_insert=0 FORMAT JSONEachRow ${rows}`;
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				await baseExecutor.execute(sql);
				return;
			} catch (error) {
				const isRaceCondition =
					error instanceof Error &&
					error.message.includes("INSERT race condition");
				if (!isRaceCondition || attempt === 4) throw error;
				await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
			}
		}
	},
};

async function waitForQuery<T>(
	query: string,
	timeoutMs = 30000,
	intervalMs = 2000,
): Promise<T[]> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const results = await executor.query<T>(query);
			if (results.length > 0) return results;
		} catch {
			// Transient ClickHouse errors - retry
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return [];
}

afterAll(() => {
	executor
		.execute(`DELETE FROM rudel.codex_sessions WHERE session_id = '${testId}'`)
		.catch(() => {});
});

// The MV SELECT query extracted from codex-sessions.ts schema definition.
// We run this directly against the inserted row so the test validates the
// new SQL logic without requiring a ClickHouse migration first.
const MV_QUERY = `
  WITH
    arrayFilter(
      x -> x != '',
      splitByChar('\\n', cs.content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    arrayMin(_timestamps) AS _session_date,
    arrayMax(_timestamps) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context

  SELECT
    cs.session_id,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    toUInt32(
      length(extractAll(cs.content, '"status":"failed"'))
      + length(extractAll(cs.content, '"error"'))
    ) as error_count,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,
    toUInt8(round(
      50
      + (if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0))
      + (if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0))
      - (if((_input_tokens + _output_tokens) > 1500000 AND (cs.git_sha IS NULL OR cs.git_sha = ''), 20, 0))
      - (if(_duration_min < 2 AND _output_tokens < 200, 30, 0))
      - (least(toUInt32(
          length(extractAll(cs.content, '"status":"failed"'))
          + length(extractAll(cs.content, '"error"'))
        ), 10) * 2)
    )) as success_score,
    cs.git_remote,
    cs.package_name,
    cs.package_type

  FROM rudel.codex_sessions AS cs
  WHERE cs.session_id = '${testId}'
    AND length(_timestamps) > 0
  QUALIFY ROW_NUMBER() OVER (PARTITION BY cs.session_id ORDER BY cs.ingested_at DESC) = 1
`;

interface AnalyticsRow {
	session_id: string;
	source: string;
	input_tokens: string;
	output_tokens: string;
	cache_read_input_tokens: string;
	cache_creation_input_tokens: string;
	total_tokens: string;
	model_used: string;
	total_interactions: number;
	actual_duration_min: number;
	has_commit: number;
	used_plan_mode: number;
	human_duration_sec: number;
	session_archetype: string;
	success_score: number;
	error_count: number;
	git_remote: string;
	package_name: string;
	package_type: string;
	avg_period_sec: number;
	quick_responses: number;
	normal_responses: number;
	long_pauses: number;
	inference_duration_sec: number;
}

describe("codex_session_analytics_mv", () => {
	test("derives correct token counts from Codex token_count events", async () => {
		const fixtureContent = await readFile(
			resolve(import.meta.dir, "fixtures", "codex-session.jsonl"),
			"utf-8",
		);

		const now = new Date().toISOString().replace("Z", "");

		const row: RudelCodexSessionsRow = {
			session_date: now,
			last_interaction_date: now,
			session_id: testId,
			organization_id: "org_test",
			project_path: "/Users/testuser/projects/myapp",
			git_remote: "github.com/testorg/testproject",
			package_name: "myapp",
			package_type: "package.json",
			content: fixtureContent,
			ingested_at: now,
			user_id: "user_test",
			git_branch: "main",
			git_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tag: "codex-mv-test",
		};

		await ingestRudelCodexSessions(executor, [row]);

		// Run the MV query directly against the inserted row
		const results = await waitForQuery<AnalyticsRow>(MV_QUERY);

		expect(results).toHaveLength(1);
		const a = results[0] as AnalyticsRow;

		// Source
		expect(a.source).toBe("codex");

		// Token extraction from last token_count event's total_token_usage:
		// input_tokens=55031, output_tokens=428, cached_input_tokens=34304
		expect(Number(a.input_tokens)).toBe(55031);
		expect(Number(a.output_tokens)).toBe(428);
		expect(Number(a.total_tokens)).toBe(55031 + 428);
		expect(Number(a.cache_read_input_tokens)).toBe(34304);
		expect(Number(a.cache_creation_input_tokens)).toBe(0);

		// Model attribution: turn_context.payload.model = "gpt-5.3-codex"
		// takes precedence over session_meta.payload.model_provider = "openai"
		expect(a.model_used).toBe("gpt-5.3-codex");

		// Repo metadata passes through from the row columns
		expect(a.git_remote).toBe("github.com/testorg/testproject");
		expect(a.package_name).toBe("myapp");
		expect(a.package_type).toBe("package.json");

		// Codex-specific hardcoded values
		expect(a.used_plan_mode).toBe(0);
		expect(a.human_duration_sec).toBe(0);

		// Git sha is set, so has_commit should be 1
		expect(a.has_commit).toBe(1);

		// Fixture has response_item + event_msg lines
		expect(a.total_interactions).toBeGreaterThan(0);

		// Session duration is ~127 minutes (04:29 to 06:36)
		expect(a.actual_duration_min).toBeGreaterThan(100);

		// Session archetype: 55k tokens, >30 min, has commit -> standard (not enough output for deep_work)
		expect(a.session_archetype).toBeTruthy();

		// Success score should be reasonable (50 base + 20 for commit)
		expect(a.success_score).toBeGreaterThanOrEqual(50);
	}, 120_000);
});
