import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { INGEST_LIMIT_REASONS } from "@rudel/api-routes";
import { enforceIngestAggregateSize } from "../lib/ingest-size.js";

const validBase = {
	source: "claude_code" as const,
	sessionId: "session-1",
	projectPath: "/test/project",
};

describe("enforceIngestAggregateSize", () => {
	test("returns the exact UTF-8 byte count at the limit", () => {
		expect(
			enforceIngestAggregateSize({ ...validBase, content: "abcd" }, 4),
		).toBe(4);
	});

	test("rejects ASCII content over the byte limit with a 413 reason", () => {
		const error = captureError(() =>
			enforceIngestAggregateSize({ ...validBase, content: "abcde" }, 4),
		);
		expectTranscriptTooLargeError(error, 5, 4);
	});

	test("rejects multibyte content over the byte limit", () => {
		const error = captureError(() =>
			enforceIngestAggregateSize({ ...validBase, content: "é" }, 1),
		);
		expectTranscriptTooLargeError(error, 2, 1);
	});

	test("counts aggregate overflow across small subagents", () => {
		const error = captureError(() =>
			enforceIngestAggregateSize(
				{
					...validBase,
					content: "a",
					subagents: [
						{ agentId: "one", content: "bc" },
						{ agentId: "two", content: "de" },
					],
				},
				4,
			),
		);
		expectTranscriptTooLargeError(error, 5, 4);
	});
});

function captureError(operation: () => unknown): unknown {
	try {
		operation();
	} catch (error) {
		return error;
	}
	throw new Error("Expected operation to throw");
}

function expectTranscriptTooLargeError(
	error: unknown,
	actualBytes: number,
	maxBytes: number,
): void {
	expect(error).toBeInstanceOf(ORPCError);
	if (!(error instanceof ORPCError)) {
		throw new Error("Expected ORPCError");
	}
	expect(error.status).toBe(413);
	expect(error.data).toEqual({
		reason: INGEST_LIMIT_REASONS.transcriptTooLarge,
		maxBytes,
		actualBytes,
	});
}
