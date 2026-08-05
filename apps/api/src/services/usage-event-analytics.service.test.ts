import { describe, expect, test } from "bun:test";
import {
	buildLegacyUsageAnalyticsCte,
	buildUsageCostSubtotalSql,
	buildUsageEventAnalyticsCte,
	getUsageAnalyticsQueryContext,
	UsageEventAnalyticsReadinessGate,
} from "./usage-event-analytics.service.js";

describe("usage-event analytics query contract", () => {
	test("resolves explicit latest state and admits only consistent complete receipts", () => {
		const sql = buildUsageEventAnalyticsCte();

		expect(sql).toContain(
			"LIMIT 1 BY organization_id, user_id, source, session_id, event_id",
		);
		expect(sql).not.toContain("usage_events FINAL");
		expect(sql).toContain(
			"LIMIT 1 BY organization_id, user_id, source, session_id",
		);
		expect(sql).toContain("FROM latest_usage_receipts");
		expect(sql).toContain("is_deleted = 0 AND receipt_is_complete = 1");
		expect(sql).toContain("= r.receipt_event_count");
		expect(sql).toContain("e.event_version = c.generation");
		expect(sql).toContain("ANY INNER JOIN consistent_usage_sessions AS c");
		expect(sql).toContain("sa.organization_id AS organization_id");
		expect(sql).toContain("sa.user_id AS user_id");
	});

	test("keeps the tenant prefix and adds available key filters", () => {
		const sql = buildUsageEventAnalyticsCte({
			sessionIdParam: "sessionId",
			sourceParam: "source",
			userIdParam: "userId",
		});

		expect(sql).toContain("organization_id = {orgId:String}");
		expect(sql).toContain("user_id = {userId:String}");
		expect(sql).toContain("source = {source:String}");
		expect(sql).toContain("session_id = {sessionId:String}");
		expect(sql.indexOf("WHERE organization_id = {orgId:String}")).toBeLessThan(
			sql.indexOf("ANY INNER JOIN consistent_usage_sessions"),
		);
	});

	test("preserves cache-inclusive display totals but prices every class once", () => {
		const sql = buildUsageEventAnalyticsCte();

		expect(sql).toContain(
			"sum(p.uncached_input_tokens + p.cache_read_input_tokens + p.cache_write_5m_input_tokens + p.cache_write_1h_input_tokens) AS input_tokens",
		);
		expect(sql).toContain("e.uncached_input_tokens");
		expect(sql).toContain("e.cache_read_input_tokens");
		expect(sql).toContain("e.cache_write_5m_input_tokens");
		expect(sql).toContain("e.cache_write_1h_input_tokens");
		expect(sql).toContain("e.output_tokens");
	});

	test("never prices from the session display model", () => {
		const sql = buildUsageEventAnalyticsCte();

		expect(sql).toContain("e.resolved_model");
		expect(sql).toContain("e.model_status = 'resolved'");
		expect(sql).not.toMatch(/match\(lowerUTF8\(sa\.model_used\)/u);
	});

	test("repairs an unknown display label only for one unanimous event model", () => {
		const sql = buildUsageEventAnalyticsCte();

		expect(sql).toContain("uniqExactIf(");
		expect(sql).toContain("AS resolved_model_count");
		expect(sql).toContain("AS single_resolved_model");
		expect(sql).toContain("ifNull(r.resolved_model_count, 0) = 1");
		expect(sql).toContain("ifNull(s.resolved_model_count, 0) = 1");
	});

	test("prices exact provenance and fails closed for unsupported dimensions", () => {
		const sql = buildUsageEventAnalyticsCte();

		expect(sql).toContain("lowerUTF8(trimBoth(e.service_tier))");
		expect(sql).toContain("lowerUTF8(trimBoth(e.model_provider))");
		expect(sql).toContain("lowerUTF8(trimBoth(e.inference_speed))");
		expect(sql).toContain("lowerUTF8(trimBoth(e.inference_geo))");
		expect(sql).toContain("IN ('fast', 'priority')");
		expect(sql).toContain("service_tier_conflict");
		expect(sql).toContain("unrecognized_service_tier");
		expect(sql).toContain("provider_model_mismatch");
		expect(sql).toContain("e.has_valid_timestamp = 1");
	});

	test("keeps the known cost subtotal while completeness remains internal", () => {
		const sql = buildUsageEventAnalyticsCte();

		expect(sql).toContain(
			"toNullable(sum(ifNull(p.estimated_cost, 0))) AS estimated_cost",
		);
		expect(sql).toContain(
			"OR has(p.quality_flags, 'inference_geo_not_available')",
		);
		expect(buildUsageCostSubtotalSql("sa.estimated_cost", 4)).toBe(
			"toNullable(round(sum(ifNull(sa.estimated_cost, 0)), 4))",
		);
	});

	test("keeps the legacy branch source-compatible", () => {
		const sql = buildLegacyUsageAnalyticsCte();

		expect(sql).toContain("FROM rudel.session_analytics AS sa FINAL");
		expect(sql).toContain("AS estimated_cost");
		expect(sql).toContain("toUInt8(1) AS cost_is_complete");
		expect(sql).toContain("AS usage_date");
	});

	test("keeps explicit off mode as a source rollback without probing events", async () => {
		const previousMode = process.env.USAGE_EVENT_ANALYTICS_CUTOVER_MODE;
		process.env.USAGE_EVENT_ANALYTICS_CUTOVER_MODE = "off";

		try {
			const context = await getUsageAnalyticsQueryContext("org-rollback");
			expect(context.mode).toBe("legacy");
			expect(context.cteDefinitions).toContain("rudel.session_analytics");
			expect(context.cteDefinitions).not.toContain("rudel.usage_events");
		} finally {
			if (previousMode === undefined) {
				delete process.env.USAGE_EVENT_ANALYTICS_CUTOVER_MODE;
			} else {
				process.env.USAGE_EVENT_ANALYTICS_CUTOVER_MODE = previousMode;
			}
		}
	});
});

describe("usage-event analytics readiness gate", () => {
	test("keeps degraded analytics isolated and re-probes after the short TTL", async () => {
		let now = 1_000;
		let probeAttempts = 0;
		let schemaReady = false;
		const gate = new UsageEventAnalyticsReadinessGate({
			degradedTtlMs: 50,
			now: () => now,
			probe: () => {
				probeAttempts += 1;
				return schemaReady
					? Promise.resolve()
					: Promise.reject(new Error("schema unavailable"));
			},
			readyTtlMs: 1_000,
			timeoutMs: 20,
		});

		await expect(gate.assertReady()).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			message: "Request-level usage analytics is temporarily unavailable",
		});
		expect(probeAttempts).toBe(1);

		now += 49;
		await expect(gate.assertReady()).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		expect(probeAttempts).toBe(1);

		now += 1;
		schemaReady = true;
		await expect(gate.assertReady()).resolves.toBeUndefined();
		expect(probeAttempts).toBe(2);
	});

	test("enforces its own short timeout", async () => {
		const gate = new UsageEventAnalyticsReadinessGate({
			degradedTtlMs: 5,
			probe: () => new Promise(() => {}),
			readyTtlMs: 50,
			timeoutMs: 5,
		});

		await expect(gate.assertReady()).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
	});
});
