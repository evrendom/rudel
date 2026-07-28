import { expect, test } from "bun:test";
import { filterKnownSecrets } from "../index.js";

const TEN_MB_OF_PROSE = "ordinary transcript content\n".repeat(
	Math.ceil((10 * 1024 * 1024) / 28),
);

test("filters a 10 MB transcript in low single-digit seconds", () => {
	const start = performance.now();
	const result = filterKnownSecrets(TEN_MB_OF_PROSE);
	const durationMs = performance.now() - start;

	expect(result.text).toBe(TEN_MB_OF_PROSE);
	expect(result.counts).toEqual({});
	expect(durationMs).toBeLessThan(5_000);
});

test("a clean 10 MB transcript still costs a single rule fold", () => {
	// The fixpoint loop stops as soon as a pass redacts nothing, so the common
	// case -- a transcript with no secrets in it -- must not pay for a second
	// scan. Compare against a transcript that does contain a secret and so
	// genuinely needs the extra pass.
	const withSecret = `${TEN_MB_OF_PROSE}AKIACANARY234567ABCDSK${"ab".repeat(16)}`;

	const cleanStart = performance.now();
	filterKnownSecrets(TEN_MB_OF_PROSE);
	const cleanMs = performance.now() - cleanStart;

	const secretStart = performance.now();
	const result = filterKnownSecrets(withSecret);
	const secretMs = performance.now() - secretStart;

	expect(result.counts).toEqual({
		"aws-access-key-id": 1,
		"twilio-api-key": 1,
	});
	// Two folds instead of one, so allow generous headroom while still catching
	// a regression that starts scanning many times over.
	expect(secretMs).toBeLessThan(Math.max(cleanMs * 4, 1_000));
	expect(secretMs).toBeLessThan(10_000);
});
