import { expect, test } from "bun:test";
import { filterKnownSecrets } from "../index.js";

test("filters a 10 MB transcript in low single-digit seconds", () => {
	const input = "ordinary transcript content\n".repeat(
		Math.ceil((10 * 1024 * 1024) / 28),
	);
	const start = performance.now();
	const result = filterKnownSecrets(input);
	const durationMs = performance.now() - start;

	expect(result.text).toBe(input);
	expect(result.counts).toEqual({});
	expect(durationMs).toBeLessThan(5_000);
});
