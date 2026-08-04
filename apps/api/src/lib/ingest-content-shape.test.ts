import { describe, expect, test } from "bun:test";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	getIngestContentShape,
	INGEST_SHRINK_MIN_BYTE_TOLERANCE,
	INGEST_SHRINK_MIN_LINE_TOLERANCE,
	isUnexpectedIngestShrink,
	resolvePreviousIngestContentShape,
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
			main: {
				assistantLineCount: 2,
				contentBytes: Buffer.byteLength(input.content, "utf8"),
			},
			subagents: {
				"agent-1": {
					assistantLineCount: 1,
					contentBytes: Buffer.byteLength(
						input.subagents?.[0]?.content ?? "",
						"utf8",
					),
				},
			},
			version: 1,
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
			main: {
				assistantLineCount: 1,
				contentBytes: Buffer.byteLength(input.content, "utf8"),
			},
			subagents: {},
			version: 1,
		});
	});
});

describe("isUnexpectedIngestShrink", () => {
	test("rejects a truncated re-upload when assistant lines disappear", () => {
		expect(isUnexpectedIngestShrink(shape(4, 3_000), shape(2, 2_900))).toBe(
			true,
		);
	});

	test("allows small byte drift when assistant coverage is intact", () => {
		expect(isUnexpectedIngestShrink(shape(3, 100_000), shape(3, 96_000))).toBe(
			false,
		);
	});

	test("rejects byte loss beyond the larger absolute/relative tolerance", () => {
		expect(isUnexpectedIngestShrink(shape(3, 100_000), shape(3, 94_999))).toBe(
			true,
		);
		expect(
			isUnexpectedIngestShrink(
				shape(0, 10_000),
				shape(0, 10_000 - INGEST_SHRINK_MIN_BYTE_TOLERANCE),
			),
		).toBe(false);
	});

	test("allows line-count drift within the same tolerance policy", () => {
		expect(
			isUnexpectedIngestShrink(
				shape(10, 10_000),
				shape(10 - INGEST_SHRINK_MIN_LINE_TOLERANCE, 10_000),
			),
		).toBe(false);
	});

	test("checks the main transcript and every existing subagent independently", () => {
		const previous = shape(10, 10_000, {
			worker: { assistantLineCount: 5, contentBytes: 5_000 },
		});
		const missingWorker = shape(20, 20_000);

		expect(isUnexpectedIngestShrink(previous, missingWorker)).toBe(true);
	});

	test("compares aggregate totals for a legacy ownership fallback", () => {
		const legacyTotal = shape(6, 12_000);
		const sameTotalWithSubagent = shape(1, 2_000, {
			worker: { assistantLineCount: 5, contentBytes: 10_000 },
		});
		const smallerTotal = shape(1, 2_000);

		expect(
			isUnexpectedIngestShrink(legacyTotal, sameTotalWithSubagent, {
				compareTotalsOnly: true,
			}),
		).toBe(false);
		expect(
			isUnexpectedIngestShrink(legacyTotal, smallerTotal, {
				compareTotalsOnly: true,
			}),
		).toBe(true);
	});
});

describe("resolvePreviousIngestContentShape", () => {
	test("synthesizes a main-only shape for legacy ownership rows", () => {
		expect(
			resolvePreviousIngestContentShape({
				lastAssistantLineCount: 42,
				lastContentBytes: 12_345,
				lastContentShape: null,
			}),
		).toEqual({
			assistantLineCount: 42,
			contentBytes: 12_345,
			main: { assistantLineCount: 42, contentBytes: 12_345 },
			subagents: {},
			version: 1,
		});
	});

	test("keeps the component shape when the ownership row has one", () => {
		const previous = shape(4, 20_000, {
			worker: { assistantLineCount: 2, contentBytes: 10_000 },
		});

		expect(
			resolvePreviousIngestContentShape({
				lastAssistantLineCount: 99,
				lastContentBytes: 99_999,
				lastContentShape: previous,
			}),
		).toBe(previous);
	});
});

function shape(
	assistantLineCount: number,
	contentBytes: number,
	subagents: Record<
		string,
		{ assistantLineCount: number; contentBytes: number }
	> = {},
) {
	const subagentShapes = Object.values(subagents);
	return {
		assistantLineCount: subagentShapes.reduce(
			(total, item) => total + item.assistantLineCount,
			assistantLineCount,
		),
		contentBytes: subagentShapes.reduce(
			(total, item) => total + item.contentBytes,
			contentBytes,
		),
		main: { assistantLineCount, contentBytes },
		subagents,
		version: 1 as const,
	};
}

function makeInput(overrides: Partial<IngestSessionInput>): IngestSessionInput {
	return {
		content: '{"type":"assistant"}',
		projectPath: "/project",
		sessionId: "session-1",
		source: "claude_code",
		...overrides,
	};
}
