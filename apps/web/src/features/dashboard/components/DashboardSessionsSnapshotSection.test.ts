import type { SessionAnalytics } from "@rudel/api-routes";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildSessionTrendData,
	getSessionChartTruncationLabel,
} from "./DashboardSessionsSnapshotSection";

const originalTimeZone = process.env.TZ;

afterEach(() => {
	process.env.TZ = originalTimeZone;
});

describe("session trend truthfulness", () => {
	it("buckets UTC-midnight edge sessions identically in a non-UTC timezone", () => {
		process.env.TZ = "America/Los_Angeles";
		const sessions = [
			{
				duration_min: 12,
				session_date: "2026-08-01T00:30:00.000Z",
				total_tokens: 300,
				user_id: "user-1",
			} as SessionAnalytics,
		];

		const data = buildSessionTrendData({
			dateRangeDays: 7,
			endDate: "2026-08-01",
			sessions,
			startDate: "2026-08-01",
			useRolling24Hours: false,
		});

		expect(data).toHaveLength(1);
		expect(data[0]?.id).toBe("2026-08-01T00:00:00.000Z");
		expect(data[0]?.sessionCount).toBe(1);
	});

	it("discloses when chart bars use only the capped session page", () => {
		expect(
			getSessionChartTruncationLabel({
				loadedSessionCount: 1000,
				totalSessionCount: 1421,
				useRolling24Hours: false,
			}),
		).toBe("Chart reflects the latest 1,000 of 1,421 sessions.");
	});
});
