import { describe, expect, it } from "bun:test";
import {
	buildEstimatedCostSql,
	buildSessionEstimatedCostSql,
	calculateEstimatedCost,
	renderModelPricingTable,
	resolveModelPricing,
} from "../model-pricing.js";
import { MODEL_RATE_CARD } from "../model-rate-card.js";

describe("model rate card", () => {
	it("has valid patterns, periods, provenance, and positive rates", () => {
		for (const entry of MODEL_RATE_CARD) {
			expect(entry.match.length).toBeGreaterThan(0);
			for (const pattern of entry.match) {
				const expression = new RegExp(pattern, "u");
				expect(expression.test(entry.model)).toBe(true);
			}

			expect(entry.inputPerMTok).toBeGreaterThan(0);
			expect(entry.outputPerMTok).toBeGreaterThan(0);
			for (const rate of [
				entry.cacheReadPerMTok,
				entry.cacheWrite5mPerMTok,
				entry.cacheWrite1hPerMTok,
			]) {
				if (rate !== null) {
					expect(rate).toBeGreaterThan(0);
				}
			}

			if (entry.cacheReadPerMTok !== null) {
				expect(entry.cacheReadPerMTok).toBeLessThan(entry.inputPerMTok);
			}

			expect(new URL(entry.source).protocol).toBe("https:");
			expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(entry.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			if (entry.effectiveTo !== undefined) {
				expect(entry.effectiveTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
				expect(entry.effectiveFrom < entry.effectiveTo).toBe(true);
			}
		}
	});

	it("has no overlapping effective periods per model and context band", () => {
		const periodsByModel = new Map<
			string,
			Array<{ effectiveFrom: string; effectiveTo?: string }>
		>();

		for (const entry of MODEL_RATE_CARD) {
			const key = `${entry.model}:${entry.contextBand}`;
			const periods = periodsByModel.get(key) ?? [];
			periods.push({
				effectiveFrom: entry.effectiveFrom,
				effectiveTo: entry.effectiveTo,
			});
			periodsByModel.set(key, periods);
		}

		for (const periods of periodsByModel.values()) {
			const chronological = [...periods].sort((left, right) =>
				left.effectiveFrom.localeCompare(right.effectiveFrom),
			);

			for (let index = 1; index < chronological.length; index += 1) {
				const previous = chronological[index - 1];
				const current = chronological[index];
				const previousEnd = previous?.effectiveTo ?? "";
				expect(previousEnd).not.toBe("");
				expect(previousEnd < (current?.effectiveFrom ?? "")).toBe(true);
			}
		}
	});

	it("resolves the same model to its date-specific price", () => {
		const introductory = resolveModelPricing("claude-sonnet-5", {
			at: "2026-08-31",
		});
		const standard = resolveModelPricing("claude-sonnet-5", {
			at: "2026-09-01",
		});

		expect(introductory?.inputPerMTok).toBe(2);
		expect(introductory?.outputPerMTok).toBe(10);
		expect(standard?.inputPerMTok).toBe(3);
		expect(standard?.outputPerMTok).toBe(15);
	});

	it("selects published context bands explicitly", () => {
		const base = resolveModelPricing("gpt-5.6-sol", {
			at: "2026-08-01",
		});
		const long = resolveModelPricing("gpt-5.6-sol", {
			at: "2026-08-01",
			contextBand: "long",
		});

		expect(base?.inputPerMTok).toBe(5);
		expect(long?.inputPerMTok).toBe(10);
	});

	it("leaves unknown and pre-release models unresolved", () => {
		expect(
			resolveModelPricing("codex-auto-review", { at: "2026-08-02" }),
		).toBeNull();
		expect(
			resolveModelPricing("gpt-5.3-codex-spark", { at: "2026-08-02" }),
		).toBeNull();
		expect(resolveModelPricing("gpt-5.6-sol", { at: "2026-06-11" })).toBeNull();
		expect(
			calculateEstimatedCost({
				at: "2026-08-02",
				model: "unknown-model",
				inputTokens: 1_000_000,
				outputTokens: 1_000_000,
			}),
		).toBeNull();
	});

	it("prices the hand-traced normal Codex session", () => {
		expect(
			calculateEstimatedCost({
				model: "gpt-5.6-sol",
				at: "2026-08-01",
				inputTokens: 118_111,
				cacheReadInputTokens: 2_735_360,
				outputTokens: 18_130,
				precision: 6,
			}),
		).toBe(2.502135);
	});

	it("prices the hand-traced large Codex session", () => {
		expect(
			calculateEstimatedCost({
				model: "gpt-5.6-sol",
				at: "2026-08-02",
				inputTokens: 11_351_520,
				cacheReadInputTokens: 445_070_848,
				outputTokens: 1_017_600,
				precision: 6,
			}),
		).toBe(309.821024);
	});

	it("prices 5-minute and 1-hour cache writes at their own tiers", () => {
		expect(
			calculateEstimatedCost({
				model: "claude-opus-5",
				at: "2026-08-01",
				inputTokens: 0,
				cacheCreationInputTokens: 1_000_000,
				cacheCreation1hInputTokens: 1_000_000,
				outputTokens: 0,
			}),
		).toBe(16.25);
	});

	it("builds date-aware SQL with a null unresolved branch", () => {
		const sql = buildEstimatedCostSql({
			modelExpr: "model_used",
			dateExpr: "session_date",
			inputExpr: "input_tokens",
			outputExpr: "output_tokens",
		});

		expect(sql).toContain("toDate(session_date)");
		expect(sql).toContain("Nullable(Float64)");
		expect(sql).not.toContain("fallback");
	});

	it("builds the canonical cache-aware session cost SQL", () => {
		const sql = buildSessionEstimatedCostSql("sa");

		expect(sql).toContain("toDate(sa.session_date)");
		expect(sql).toContain("sa.model_used");
		expect(sql).toContain(
			"greatest(ifNull(sa.input_tokens, 0) - ifNull(sa.cache_read_input_tokens, 0) - ifNull(sa.cache_creation_input_tokens, 0), 0)",
		);
		expect(sql).toContain("ifNull(sa.cache_read_input_tokens, 0)");
		expect(sql).toContain("ifNull(sa.cache_creation_5m_input_tokens, 0)");
		expect(sql).toContain("ifNull(sa.cache_creation_1h_input_tokens, 0)");
		expect(() => buildSessionEstimatedCostSql("sa; DROP TABLE x")).toThrow(
			"Invalid session analytics table alias",
		);
	});

	it("keeps the generated pricing sheet in sync", async () => {
		const pricingSheet = Bun.file(
			new URL("../../../../MODEL_PRICING.md", import.meta.url),
		);

		expect(await pricingSheet.text()).toBe(renderModelPricingTable());
	});
});
