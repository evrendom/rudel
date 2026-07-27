import type { SessionAnalytics } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import { orderSessionsForDisplay } from "./session-ordering";

function session(
	sessionId: string,
	sessionDate: string,
): Pick<SessionAnalytics, "session_id" | "session_date"> {
	return { session_id: sessionId, session_date: sessionDate };
}

const now = new Date("2026-07-27T12:00:00.000Z");

describe("orderSessionsForDisplay", () => {
	it("sorts newest first regardless of input order", () => {
		const ordered = orderSessionsForDisplay({
			sessions: [
				session("middle", "2026-07-20T10:00:00"),
				session("oldest", "2026-07-01T10:00:00"),
				session("newest", "2026-07-26T10:00:00"),
			] as SessionAnalytics[],
			now,
		});

		expect(ordered.map((item) => item.session_id)).toEqual([
			"newest",
			"middle",
			"oldest",
		]);
	});

	it("treats a missing zone marker as UTC", () => {
		// Sorting on the raw strings, or parsing them as local time, reorders
		// these two around a UTC day boundary.
		const ordered = orderSessionsForDisplay({
			sessions: [
				session("earlier", "2026-07-26T23:00:00"),
				session("later", "2026-07-27T01:00:00Z"),
			] as SessionAnalytics[],
			now,
		});

		expect(ordered.map((item) => item.session_id)).toEqual([
			"later",
			"earlier",
		]);
	});

	it("drops sessions outside the window for the rolling 24-hour view", () => {
		// The rolling view over-fetches two days, so anything older than the
		// rolling window has to be filtered out rather than rendered.
		const ordered = orderSessionsForDisplay({
			sessions: [
				session("inside", "2026-07-27T02:00:00"),
				session("just-outside", "2026-07-26T11:00:00"),
			] as SessionAnalytics[],
			useRolling24Hours: true,
			now,
		});

		expect(ordered.map((item) => item.session_id)).toEqual(["inside"]);
	});

	it("keeps every session when the range is not the rolling window", () => {
		const ordered = orderSessionsForDisplay({
			sessions: [
				session("inside", "2026-07-27T02:00:00"),
				session("older", "2026-07-26T11:00:00"),
			] as SessionAnalytics[],
			now,
		});

		expect(ordered).toHaveLength(2);
	});

	it("does not mutate the input array", () => {
		const sessions = [
			session("older", "2026-07-01T10:00:00"),
			session("newer", "2026-07-26T10:00:00"),
		] as SessionAnalytics[];

		orderSessionsForDisplay({ sessions, now });

		expect(sessions.map((item) => item.session_id)).toEqual(["older", "newer"]);
	});
});
