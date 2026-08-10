import { describe, expect, test } from "bun:test";
import {
	DaysInputSchema,
	DeveloperDetailsInputSchema,
	DeveloperSessionsInputSchema,
	DimensionAnalysisInputSchema,
	HistoricalSkillDetailInputSchema,
	RecurringErrorsInputSchema,
	SessionAnalyticsSchema,
	SessionDetailInputSchema,
	SessionListInputSchema,
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
		expect(() =>
			HistoricalSkillDetailInputSchema.parse({
				name: "a".repeat(513),
			}),
		).toThrow();
	});

	test("historical skill names are exact and case-sensitive", () => {
		expect(HistoricalSkillDetailInputSchema.parse({ name: "Design" })).toEqual({
			name: "Design",
		});
		expect(HistoricalSkillDetailInputSchema.parse({ name: "design" })).toEqual({
			name: "design",
		});
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

describe("analytics output schemas", () => {
	const sessionCountMetricsSchema = SessionAnalyticsSchema.pick({
		error_count: true,
		subagent_count: true,
	});

	test("accepts nonnegative integer session count metrics", () => {
		expect(
			sessionCountMetricsSchema.parse({
				error_count: 3,
				subagent_count: 2,
			}),
		).toEqual({
			error_count: 3,
			subagent_count: 2,
		});
		expect(
			sessionCountMetricsSchema.safeParse({
				error_count: -1,
				subagent_count: 2,
			}).success,
		).toBe(false);
		expect(
			sessionCountMetricsSchema.safeParse({
				error_count: 1.5,
				subagent_count: 2,
			}).success,
		).toBe(false);
		expect(
			sessionCountMetricsSchema.safeParse({
				error_count: 0,
				subagent_count: -1,
			}).success,
		).toBe(false);
	});

	test("accepts nullable worktree metadata", () => {
		expect(SessionAnalyticsSchema.shape.worktree.parse("podgorica")).toBe(
			"podgorica",
		);
		expect(SessionAnalyticsSchema.shape.worktree.parse(null)).toBeNull();
	});
});
