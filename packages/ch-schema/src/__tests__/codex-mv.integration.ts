import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestRudelCodexSessions } from "../generated/chkit-ingest.js";
import type {
	RudelCodexSessionsRow,
	RudelSessionAnalyticsRow,
} from "../generated/chkit-types.js";
import { CODEX_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/codex-session-analytics.js";
import { createTestExecutor, waitForQuery } from "./helpers/executor.js";
import { withSessionFilter } from "./mv-session-filter.js";

setDefaultTimeout(120_000);

const testPrefix = `codex_mv_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const testId = `${testPrefix}_clean`;
const errorTestId = `${testPrefix}_errors`;
const skillTestId = `${testPrefix}_skills`;
// Unique per run. All fixtures share it, so afterAll can clean by organization.
const orgId = `org_${testPrefix}`;

const executor = createTestExecutor();

afterAll(async () => {
	// The incremental MV writes a separate target row on insert; deleting its source
	// row does not propagate. Clean both tables so `test:integration` does not
	// accumulate fixtures in persistent environments.
	// The executor reuses one ClickHouse session, so commands must be sequential;
	// concurrent deletes fail with SESSION_IS_LOCKED.
	// Best-effort like ingest-clickhouse's cleanup: rows are scoped to this run's
	// unique org id, so a delete that times out under shared-cluster mutation
	// pressure leaks only inert fixtures — it must not fail the gate.
	for (const table of ["rudel.codex_sessions", "rudel.session_analytics"]) {
		await executor
			.execute(
				`DELETE FROM ${table} WHERE organization_id = '${orgId}' SETTINGS lightweight_deletes_sync = 0`,
			)
			.catch(() => {});
	}
});

// Runs the deployed MV SELECT directly against the inserted row.
//
// The SQL is imported from the same constant `codex-sessions.ts` passes to
// `materializedView({ as })`, so this test cannot drift from what is deployed. It
// previously held a hand-copied duplicate that had silently diverged five ways
// (LIKE vs ILIKE, no _skills CTE, no exploration archetype branch, no skills term in
// success_score, no `info IS NOT NULL` guard) — it was asserting against SQL that was
// not running anywhere.
//
// Scope: this exercises the MV's *query*, not its wiring. The insert trigger, the
// `TO rudel.session_analytics` target, and ReplacingMergeTree collapse are covered by
// apps/api/src/__tests__/session-analytics-values.integration.ts (real adapter → MV →
// FINAL) and apps/cli/src/__tests__/api-upload.integration.ts (CLI → API → ClickHouse
// with auth).
const MV_QUERY = withSessionFilter(CODEX_SESSION_ANALYTICS_MV_SQL, {
	organizationId: orgId,
	sessionId: testId,
});

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
			organization_id: orgId,
			project_path: "/Users/testuser/projects/myapp",
			git_remote: "github.com/testorg/testproject",
			package_name: "myapp",
			package_type: "package.json",
			upload_mode: "hook",
			content: fixtureContent,
			filter_version: 0,
			ingested_at: now,
			user_id: "user_test",
			git_branch: "main",
			git_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tag: "codex-mv-test",
		};

		await ingestRudelCodexSessions(executor, [row]);

		// Run the MV query directly against the inserted row
		const results = await waitForQuery<RudelSessionAnalyticsRow>(
			executor,
			MV_QUERY,
		);

		expect(results).toHaveLength(1);
		const a = results[0];
		if (!a) throw new Error("no clean analytics row produced");

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
		expect(a.upload_mode).toBe("hook");

		// Codex-specific hardcoded values
		expect(a.used_plan_mode).toBe(0);
		expect(a.human_duration_sec).toBe(0);

		// Git sha is set, so has_commit should be 1
		expect(a.has_commit).toBe(1);

		// Fixture has response_item + event_msg lines
		expect(a.total_interactions).toBeGreaterThan(0);

		// Session duration is ~127 minutes (04:29 to 06:36)
		expect(a.actual_duration_min).toBeGreaterThan(100);

		// The codex skills regex looks for "name":"exec_command" ... skills/<x>/SKILL.
		// This fixture invokes no skill, so the array is empty — which is also why
		// success_score gets no skills bonus and the exploration branch cannot fire.
		expect(a.skills).toEqual([]);

		// Clean session has no tool errors
		expect(a.error_count).toBe(0);

		// 127 min with only 428 output tokens matches no special branch:
		//   quick_win   needs duration <= 10
		//   deep_work   needs output > 50000
		//   struggle    needs input + output > 1000000  (here 55459)
		//   exploration needs >= 3 skills
		//   abandoned   needs duration < 3
		expect(a.session_archetype).toBe("standard");

		// 50 base
		//   + 20  git_sha is set
		//   +  0  output/input = 428/55031 = 0.008, not > 0.5
		//   +  0  no skills
		//   -  0  55459 tokens is under the 1500000 penalty threshold
		//   -  0  127 min is not < 2
		//   -  0  no errors
		expect(a.success_score).toBe(70);
	}, 120_000);

	test("counts errors from non-zero exit codes and error text in tool output", async () => {
		const fixtureContent = await readFile(
			resolve(import.meta.dir, "fixtures", "codex-session-with-errors.jsonl"),
			"utf-8",
		);

		const now = new Date().toISOString().replace("Z", "");

		const row: RudelCodexSessionsRow = {
			session_date: now,
			last_interaction_date: now,
			session_id: errorTestId,
			organization_id: orgId,
			project_path: "/Users/testuser/projects/myapp",
			git_remote: "github.com/testorg/testproject",
			package_name: "myapp",
			package_type: "package.json",
			upload_mode: "hook",
			content: fixtureContent,
			filter_version: 0,
			ingested_at: now,
			user_id: "user_test",
			git_branch: "main",
			git_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			tag: "codex-mv-error-test",
		};

		await ingestRudelCodexSessions(executor, [row]);

		const results = await waitForQuery<RudelSessionAnalyticsRow>(
			executor,
			withSessionFilter(CODEX_SESSION_ANALYTICS_MV_SQL, {
				organizationId: orgId,
				sessionId: errorTestId,
			}),
		);

		expect(results).toHaveLength(1);
		const a = results[0];
		if (!a) throw new Error("no error analytics row produced");

		// Fixture has 3 function_call_output items:
		// 1. exit_code:1 with "error TS2345" text -> counts as 1 (non-zero exit code)
		//    "error TS2345:" doesn't match ILIKE '%Error:%' (no contiguous "Error:" substring)
		// 2. exit_code:0 with "TypeError: ..." text -> counts as 1 (ILIKE '%Error:%' matches "TypeError:")
		// 3. exit_code:0 with clean "Success" text -> counts as 0
		// Total: 2 errors
		expect(a.error_count).toBe(2);

		// 50 base + 20 (git_sha) - least(2, 10) * 2 = 66.
		// The <2min / <200-output penalty does not apply: duration rounds to 0 min,
		// but output is 800, so the second half of that condition fails.
		expect(a.success_score).toBe(66);

		// quick_win needs output > 1000 and this fixture has 800, so it falls through
		// to standard like the clean one.
		expect(a.session_archetype).toBe("standard");
	}, 120_000);

	test("detects real skill invocations without duplicates or decoys", async () => {
		const fixtureContent = await readFile(
			resolve(import.meta.dir, "fixtures", "codex-session-with-skills.jsonl"),
			"utf-8",
		);

		const now = new Date().toISOString().replace("Z", "");
		const row: RudelCodexSessionsRow = {
			session_date: now,
			last_interaction_date: now,
			session_id: skillTestId,
			organization_id: orgId,
			project_path: "/Users/testuser/projects/myapp",
			git_remote: "github.com/testorg/testproject",
			package_name: "myapp",
			package_type: "package.json",
			upload_mode: "hook",
			content: fixtureContent,
			filter_version: 0,
			ingested_at: now,
			user_id: "user_test",
			git_branch: "main",
			git_sha: "cccccccccccccccccccccccccccccccccccccccc",
			tag: "codex-mv-skill-test",
		};

		await ingestRudelCodexSessions(executor, [row]);

		const results = await waitForQuery<RudelSessionAnalyticsRow>(
			executor,
			withSessionFilter(CODEX_SESSION_ANALYTICS_MV_SQL, {
				organizationId: orgId,
				sessionId: skillTestId,
			}),
		);

		expect(results).toHaveLength(1);
		const analytics = results[0];
		if (!analytics) throw new Error("no skill analytics row produced");

		// The fixture invokes testing-bun twice and clickhouse-query once through
		// exec_command. Paths in a read_file call and assistant prose are decoys.
		expect(analytics.skills).toEqual(["testing-bun", "clickhouse-query"]);

		// 50 base + 20 for git_sha + (2 distinct skills * 5). The token ratio is
		// exactly 0.5, so the strict > 0.5 output-ratio bonus does not apply.
		// Duration is 1 minute, but output is 500, so the <200 short-session
		// penalty does not apply either.
		expect(analytics.success_score).toBe(80);
	}, 120_000);
});
