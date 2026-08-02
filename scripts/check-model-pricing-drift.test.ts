import { describe, expect, test } from "bun:test";
import type { ModelRateCardEntry } from "../packages/api-routes/src/model-rate-card.js";
import { checkModelPricingDrift } from "./check-model-pricing-drift.js";

const entry = {
	cacheReadPerMTok: 0.5,
	cacheWrite1hPerMTok: null,
	cacheWrite5mPerMTok: 6.25,
	contextBand: "base",
	displayName: "Example",
	effectiveFrom: "2026-01-01",
	inputPerMTok: 5,
	match: ["^example$"],
	model: "example",
	notes: "Test entry",
	outputPerMTok: 30,
	provider: "openai",
	source: "https://example.test/pricing",
	verifiedAt: "2026-01-01",
} satisfies ModelRateCardEntry;

describe("model pricing drift watch", () => {
	test("accepts published configured rates and warns when verification is stale", async () => {
		const result = await checkModelPricingDrift({
			entries: [entry],
			fetchImpl: () =>
				Promise.resolve(
					new Response("Input $5 · cache $0.50 · write $6.25 · output $30"),
				),
			now: new Date("2026-08-02T00:00:00.000Z"),
		});

		expect(result.issues).toEqual([]);
		expect(result.warnings).toHaveLength(1);
	});

	test("fails when a configured rate disappears from the provider page", async () => {
		const result = await checkModelPricingDrift({
			entries: [entry],
			fetchImpl: () => Promise.resolve(new Response("Input $5 only")),
			now: new Date("2026-01-02T00:00:00.000Z"),
		});

		expect(result.issues).toEqual(
			[
				entry.cacheReadPerMTok,
				entry.cacheWrite5mPerMTok,
				entry.outputPerMTok,
			]
				.map(
					(rate) =>
						`${entry.source} no longer exposes configured rate $${rate}/MTok.`,
				)
				.sort(),
		);
	});
});
