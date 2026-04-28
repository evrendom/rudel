import { describe, expect, test } from "bun:test";
import {
	buildWrappedShareIdBase,
	getNextWrappedShareIdCandidate,
} from "../services/wrapped-share-slug.js";

describe("wrapped share slugs", () => {
	test("uses the provided username as the public id base", () => {
		expect(
			buildWrappedShareIdBase({
				fallbackLabel: "Evren Dombak",
				username: "Evren_Dev",
			}),
		).toBe("Evren_Dev");
	});

	test("falls back to a route-safe label slug when username is missing", () => {
		expect(
			buildWrappedShareIdBase({
				fallbackLabel: "Evren Dombak",
			}),
		).toBe("evren-dombak");
	});

	test("appends the lowest available dash suffix when the base is taken", () => {
		expect(
			getNextWrappedShareIdCandidate({
				baseId: "evren",
				existingIds: ["evren", "evren-1", "evren-3"],
			}),
		).toBe("evren-2");
	});
});
