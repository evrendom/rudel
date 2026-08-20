import { describe, expect, it } from "vitest";
import { buildSessionsListQueryInput } from "./sessions-list-query";

describe("buildSessionsListQueryInput", () => {
	it("contains date and sort state but no viewport or selection state", () => {
		const input = buildSessionsListQueryInput({
			dayCount: 30,
			endDate: "2026-08-19",
			startDate: "2026-07-21",
			today: new Date("2026-08-19T12:00:00Z"),
		});

		expect(input).toEqual({
			days: 30,
			endDate: "2026-08-19",
			limit: 1000,
			sortBy: "session_date",
			sortOrder: "desc",
			startDate: "2026-07-21",
		});
		expect(Object.keys(input)).not.toContain("signalSessionIds");
	});
});
