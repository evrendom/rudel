import { describe, expect, test } from "bun:test";
import { assertSessionDetailAccessEnabled } from "../handlers/analytics/session-detail-access.js";

describe("analytics session detail YC access", () => {
	test("blocks session detail access for YC review sessions", () => {
		expect(() => assertSessionDetailAccessEnabled({ ycReview: true })).toThrow(
			"Session detail disabled for demo.",
		);
	});

	test("allows session detail access for normal sessions", () => {
		expect(() =>
			assertSessionDetailAccessEnabled({ ycReview: false }),
		).not.toThrow();
	});
});
