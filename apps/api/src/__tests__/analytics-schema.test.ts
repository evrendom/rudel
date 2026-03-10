import { describe, expect, test } from "bun:test";
import {
	DateRangeInputSchema,
	DaysInputSchema,
	DeveloperSessionsInputSchema,
	DimensionAnalysisInputSchema,
	RecurringErrorsInputSchema,
	SessionListInputSchema,
} from "@rudel/api-routes";

describe("analytics input schemas", () => {
	test("caps day-based lookbacks", () => {
		expect(() => DaysInputSchema.parse({ days: 366 })).toThrow(
			/less than or equal to 365/i,
		);
	});

	test("rejects oversized pagination windows", () => {
		expect(() =>
			SessionListInputSchema.parse({
				days: 7,
				limit: 501,
			}),
		).toThrow(/less than or equal to 500/i);

		expect(() =>
			DeveloperSessionsInputSchema.parse({
				days: 7,
				userId: "user-1",
				offset: 10_001,
			}),
		).toThrow(/less than or equal to 10000/i);
	});

	test("caps expensive aggregation endpoints", () => {
		expect(() =>
			DimensionAnalysisInputSchema.parse({
				days: 7,
				dimension: "user_id",
				metric: "session_count",
				limit: 101,
			}),
		).toThrow(/less than or equal to 100/i);

		expect(() =>
			RecurringErrorsInputSchema.parse({
				days: 7,
				limit: 101,
			}),
		).toThrow(/less than or equal to 100/i);
	});

	test("rejects invalid or oversized date ranges", () => {
		expect(() =>
			DateRangeInputSchema.parse({
				startDate: "2026-03-10",
				endDate: "2026-03-09",
			}),
		).toThrow(/endDate must be on or after startDate/i);

		expect(() =>
			DateRangeInputSchema.parse({
				startDate: "2025-01-01",
				endDate: "2026-01-02",
			}),
		).toThrow(/cannot exceed 366 days/i);
	});
});
