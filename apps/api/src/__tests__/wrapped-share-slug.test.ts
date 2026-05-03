import { describe, expect, test } from "bun:test";
import {
	buildWrappedShareIdBase,
	getNextWrappedShareIdCandidate,
	isWrappedShareIdAlignedWithBase,
} from "../services/wrapped-share-slug.js";

describe("wrapped share slugs", () => {
	test("uses the public card display name as the share id base", () => {
		expect(
			buildWrappedShareIdBase({
				displayName: "Evren Dombak",
			}),
		).toBe("evren-dombak");
	});

	test("falls back when the public card display name cannot become a slug", () => {
		expect(
			buildWrappedShareIdBase({
				displayName: "!!!",
			}),
		).toBe("wrapped");
	});

	test("uses the bare card name when it is available", () => {
		expect(
			getNextWrappedShareIdCandidate({
				baseId: "evren-dombak",
				existingIds: [],
			}),
		).toBe("evren-dombak");
	});

	test("adds a cool adjective before the name when the card name is taken", () => {
		expect(
			getNextWrappedShareIdCandidate({
				baseId: "evren-dombak",
				existingIds: ["evren-dombak"],
				randomValue: 0,
			}),
		).toBe("atomic-evren-dombak");
	});

	test("chooses an available adjective when another duplicate already used one", () => {
		expect(
			getNextWrappedShareIdCandidate({
				baseId: "evren-dombak",
				existingIds: ["evren-dombak", "atomic-evren-dombak"],
				randomValue: 0,
			}),
		).toBe("brilliant-evren-dombak");
	});

	test("detects legacy uuid ids as not aligned with the card name", () => {
		expect(
			isWrappedShareIdAlignedWithBase({
				baseId: "evren-dombak",
				shareId: "atomic-evren-dombak",
			}),
		).toBe(true);
		expect(
			isWrappedShareIdAlignedWithBase({
				baseId: "evren-dombak",
				shareId: "c5f69df0-324a-4d15-a45a-3d32b87ac0c1",
			}),
		).toBe(false);
	});
});
