import { describe, expect, test } from "bun:test";
import {
	DaysInputSchema,
	DeveloperDetailsInputSchema,
	DeveloperSessionsInputSchema,
	DeveloperSummarySchema,
	DeveloperTeamCardSchema,
	DimensionAnalysisInputSchema,
	ProjectDetailDataSchema,
	ProjectInvestmentSchema,
	RecurringErrorsInputSchema,
	ROIDashboardSchema,
	ROIMetricsSchema,
	SessionDetailInputSchema,
	SessionListInputSchema,
	UserTokenUsageDataSchema,
	WrappedV1MetricsSchema,
} from "../schemas/analytics.js";

describe("analytics input schemas", () => {
	test("reject oversized free-form analytics filters", () => {
		expect(() =>
			DeveloperDetailsInputSchema.parse({
				days: 7,
				userId: "a".repeat(513),
			}),
		).toThrow();
		expect(() =>
			SessionListInputSchema.parse({
				days: 7,
				projectPath: "a".repeat(4097),
			}),
		).toThrow();
		expect(() =>
			SessionDetailInputSchema.parse({
				sessionId: "a".repeat(513),
			}),
		).toThrow();
	});

	test("days capped at 365", () => {
		expect(DaysInputSchema.safeParse({ days: 365 }).success).toBe(true);
		expect(DaysInputSchema.safeParse({ days: 366 }).success).toBe(false);
	});

	test("limit capped at 1000 on session list", () => {
		expect(SessionListInputSchema.safeParse({ limit: 1000 }).success).toBe(
			true,
		);
		expect(SessionListInputSchema.safeParse({ limit: 1001 }).success).toBe(
			false,
		);
	});

	test("limit capped at 1000 on dimension analysis", () => {
		expect(
			DimensionAnalysisInputSchema.safeParse({
				dimension: "user_id",
				metric: "session_count",
				limit: 1000,
			}).success,
		).toBe(true);
		expect(
			DimensionAnalysisInputSchema.safeParse({
				dimension: "user_id",
				metric: "session_count",
				limit: 1001,
			}).success,
		).toBe(false);
	});

	test("rejects deprecated interaction-count metrics", () => {
		for (const metric of ["avg_interactions", "total_interactions"]) {
			expect(
				DimensionAnalysisInputSchema.safeParse({
					dimension: "user_id",
					metric,
				}).success,
			).toBe(false);
		}
	});

	test("limit capped at 1000 on developer sessions", () => {
		expect(
			DeveloperSessionsInputSchema.safeParse({
				userId: "u1",
				limit: 1000,
			}).success,
		).toBe(true);
		expect(
			DeveloperSessionsInputSchema.safeParse({
				userId: "u1",
				limit: 1001,
			}).success,
		).toBe(false);
	});

	test("limit capped at 1000 on recurring errors", () => {
		expect(RecurringErrorsInputSchema.safeParse({ limit: 1000 }).success).toBe(
			true,
		);
		expect(RecurringErrorsInputSchema.safeParse({ limit: 1001 }).success).toBe(
			false,
		);
	});
});

describe("usage-event cutover output contract", () => {
	test("keeps pricing diagnostics and coverage internal", () => {
		const publicKeys = [
			DeveloperSummarySchema,
			DeveloperTeamCardSchema,
			ProjectDetailDataSchema,
			ProjectInvestmentSchema,
			ROIDashboardSchema,
			ROIMetricsSchema,
			UserTokenUsageDataSchema,
			WrappedV1MetricsSchema,
		].flatMap((schema) => Object.keys(schema.shape));

		for (const internalField of [
			"integrity_count",
			"priced_token_percent",
			"pricing_coverage",
			"pricing_coverage_percent",
			"token_classes",
			"unpriced_session_count",
			"unresolved_models",
		]) {
			expect(publicKeys).not.toContain(internalField);
		}
	});

	test("reuses nullable cost fields for fail-closed pricing", () => {
		expect(DeveloperSummarySchema.shape.cost.safeParse(null).success).toBe(
			true,
		);
		expect(DeveloperTeamCardSchema.shape.cost.safeParse(null).success).toBe(
			true,
		);
		expect(ProjectDetailDataSchema.shape.cost.safeParse(null).success).toBe(
			true,
		);
		expect(ProjectInvestmentSchema.shape.cost.safeParse(null).success).toBe(
			true,
		);
		expect(UserTokenUsageDataSchema.shape.cost.safeParse(null).success).toBe(
			true,
		);
		expect(
			WrappedV1MetricsSchema.shape.estimated_spend_usd.safeParse(null).success,
		).toBe(true);
	});
});
