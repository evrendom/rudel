import { describe, expect, test } from "bun:test";
import { buildPricingCoverageReport } from "./check-pricing-coverage.js";

describe("pricing coverage report", () => {
	test("reports per-org coverage and only alerts on unallowlisted model IDs", () => {
		const report = buildPricingCoverageReport({
			allowedUnresolvedModels: new Set(["known-legacy-model"]),
			generatedAt: "2026-08-02T12:00:00.000Z",
			lookbackDays: 1,
			rows: [
				{
					date: "2026-08-02",
					model: "priced-model",
					organizationId: "org-1",
					totalTokens: 800,
					unpricedTokens: 0,
				},
				{
					date: "2026-08-02",
					model: "new-model",
					organizationId: "org-1",
					totalTokens: 200,
					unpricedTokens: 200,
				},
				{
					date: "2026-08-02",
					model: "known-legacy-model",
					organizationId: "org-2",
					totalTokens: 50,
					unpricedTokens: 50,
				},
			],
		});

		expect(report.newUnresolvedModels).toEqual(["new-model"]);
		expect(report.organizations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					pricedTokenPercent: 80,
					totalTokens: 1000,
					unpricedTokens: 200,
				}),
			]),
		);
		expect(JSON.stringify(report)).not.toContain("org-1");
	});
});
