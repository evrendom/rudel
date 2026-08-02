import { describe, expect, test } from "bun:test";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	getIngestContentShape,
	INGEST_SHRINK_MIN_BYTE_TOLERANCE,
	isUnexpectedIngestShrink,
} from "./ingest-content-shape.js";

describe("getIngestContentShape", () => {
	test("counts Claude assistant lines in the main transcript and subagents", () => {
		const input = makeInput({
			content: [
				'{"type":"user"}',
				'{"type":"assistant"}',
				"not json",
				'{"type":"assistant"}',
			].join("\n"),
			subagents: [
				{
					agentId: "agent-1",
					content: '{"type":"assistant","message":{"role":"assistant"}}',
				},
			],
		});

		expect(getIngestContentShape(input)).toEqual({
			assistantLineCount: 3,
			contentBytes:
				Buffer.byteLength(input.content, "utf8") +
				Buffer.byteLength(input.subagents?.[0]?.content ?? "", "utf8"),
		});
	});

	test("counts Codex assistant response items and ignores unpersisted subagents", () => {
		const input = makeInput({
			source: "codex",
			content: [
				'{"type":"response_item","payload":{"type":"message","role":"assistant"}}',
				'{"type":"response_item","payload":{"type":"message","role":"user"}}',
			].join("\n"),
			subagents: [{ agentId: "ignored", content: '{"type":"assistant"}' }],
		});

		expect(getIngestContentShape(input)).toEqual({
			assistantLineCount: 1,
			contentBytes: Buffer.byteLength(input.content, "utf8"),
		});
	});
});

describe("isUnexpectedIngestShrink", () => {
	test("rejects a truncated re-upload when assistant lines disappear", () => {
		expect(
			isUnexpectedIngestShrink(
				{ assistantLineCount: 3, contentBytes: 3_000 },
				{ assistantLineCount: 2, contentBytes: 2_900 },
			),
		).toBe(true);
	});

	test("allows small byte drift when assistant coverage is intact", () => {
		expect(
			isUnexpectedIngestShrink(
				{ assistantLineCount: 3, contentBytes: 100_000 },
				{ assistantLineCount: 3, contentBytes: 96_000 },
			),
		).toBe(false);
	});

	test("rejects byte loss beyond the larger absolute/relative tolerance", () => {
		expect(
			isUnexpectedIngestShrink(
				{ assistantLineCount: 3, contentBytes: 100_000 },
				{ assistantLineCount: 3, contentBytes: 94_999 },
			),
		).toBe(true);
		expect(
			isUnexpectedIngestShrink(
				{ assistantLineCount: 0, contentBytes: 10_000 },
				{
					assistantLineCount: 0,
					contentBytes: 10_000 - INGEST_SHRINK_MIN_BYTE_TOLERANCE,
				},
			),
		).toBe(false);
	});
});

function makeInput(overrides: Partial<IngestSessionInput>): IngestSessionInput {
	return {
		content: '{"type":"assistant"}',
		projectPath: "/project",
		sessionId: "session-1",
		source: "claude_code",
		...overrides,
	};
}
