import { describe, expect, test } from "bun:test";
import {
	CLI_SESSION_UPLOAD_STATUS_MAX_IDS,
	CliSessionUploadStatusInputSchema,
} from "../index.js";

describe("CLI session upload status contract", () => {
	test("accepts a bounded unique batch", () => {
		const sessionIds = Array.from(
			{ length: CLI_SESSION_UPLOAD_STATUS_MAX_IDS },
			(_, index) => `session-${index}`,
		);

		expect(
			CliSessionUploadStatusInputSchema.safeParse({ sessionIds }).success,
		).toBe(true);
	});

	test("rejects duplicate and oversized batches", () => {
		expect(
			CliSessionUploadStatusInputSchema.safeParse({
				sessionIds: ["same", "same"],
			}).success,
		).toBe(false);
		expect(
			CliSessionUploadStatusInputSchema.safeParse({
				sessionIds: Array.from(
					{ length: CLI_SESSION_UPLOAD_STATUS_MAX_IDS + 1 },
					(_, index) => `session-${index}`,
				),
			}).success,
		).toBe(false);
	});
});
