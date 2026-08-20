import { describe, expect, test } from "bun:test";
import { extractHistoricalCodexSkillBodies } from "./historical-codex-skill-parser.js";

const SKILL_NAME = "testing-bun";
const SKILL_PATH = `/Users/test/.codex/skills/${SKILL_NAME}/SKILL.md`;
const SKILL_BODY = [
	"---",
	"name: testing-bun",
	"description: Test with Bun.",
	"---",
	"",
	"# Testing Bun",
	"",
].join("\n");

describe("extractHistoricalCodexSkillBodies", () => {
	test("recovers a complete cat read and preserves the exact body", () => {
		const transcript = buildTranscript([
			buildCall("call-1", `cat '${SKILL_PATH}'`),
			buildOutput("call-1", buildToolEnvelope(SKILL_BODY)),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual([
			SKILL_BODY,
		]);
	});

	test("accepts line-one sed and head reads only when output ends before the limit", () => {
		const transcript = buildTranscript([
			buildCall("call-sed", `sed -n '1,20p' ${SKILL_PATH}`),
			buildOutput("call-sed", buildToolEnvelope(SKILL_BODY)),
			buildCall("call-head", `head -n 20 ${SKILL_PATH}`),
			buildOutput("call-head", buildToolEnvelope(SKILL_BODY)),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual([
			SKILL_BODY,
		]);
	});

	test("rejects sed and head output that reaches the requested line limit", () => {
		const fiveLineBody = [
			"---",
			"name: testing-bun",
			"---",
			"# Heading",
			"Last line",
		].join("\n");
		const transcript = buildTranscript([
			buildCall("call-sed", `sed -n '1,5p' ${SKILL_PATH}`),
			buildOutput("call-sed", buildToolEnvelope(fiveLineBody)),
			buildCall("call-head", `head -5 ${SKILL_PATH}`),
			buildOutput("call-head", buildToolEnvelope(fiveLineBody)),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual(
			[],
		);
	});

	test("rejects tool output explicitly marked as truncated", () => {
		const transcript = buildTranscript([
			buildCall("call-1", `cat ${SKILL_PATH}`),
			buildOutput(
				"call-1",
				buildToolEnvelope(SKILL_BODY, "Warning: truncated output"),
			),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual(
			[],
		);
	});

	test("rejects chained, piped, and multi-file commands", () => {
		const transcript = buildTranscript([
			buildCall("call-chain", `cat ${SKILL_PATH} && echo done`),
			buildOutput("call-chain", buildToolEnvelope(SKILL_BODY)),
			buildCall("call-pipe", `cat ${SKILL_PATH} | head -20`),
			buildOutput("call-pipe", buildToolEnvelope(SKILL_BODY)),
			buildCall("call-multi", `cat ${SKILL_PATH} /tmp/skills/other/SKILL.md`),
			buildOutput("call-multi", buildToolEnvelope(SKILL_BODY)),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual(
			[],
		);
	});

	test("ignores malformed JSONL, missing outputs, failed calls, and other skills", () => {
		const transcript = [
			"not-json",
			buildCall("missing-output", `cat ${SKILL_PATH}`),
			buildCall("failed-call", `cat ${SKILL_PATH}`),
			buildOutput(
				"failed-call",
				buildToolEnvelope(SKILL_BODY, "", "Process exited with code 1"),
			),
			buildCall("other-skill", "cat /Users/test/.codex/skills/design/SKILL.md"),
			buildOutput("other-skill", buildToolEnvelope(SKILL_BODY)),
		].join("\n");

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual(
			[],
		);
	});

	test("deduplicates repeated bodies and keeps changed bodies distinct", () => {
		const changedBody = SKILL_BODY.replace(
			"# Testing Bun",
			"# Testing Bun Updated",
		);
		const transcript = buildTranscript([
			buildCall("call-1", `cat ${SKILL_PATH}`),
			buildOutput("call-1", buildToolEnvelope(SKILL_BODY)),
			buildCall("call-2", `cat ${SKILL_PATH}`),
			buildOutput("call-2", buildToolEnvelope(SKILL_BODY)),
			buildCall("call-3", `cat ${SKILL_PATH}`),
			buildOutput("call-3", buildToolEnvelope(changedBody)),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual([
			SKILL_BODY,
			changedBody,
		]);
	});

	test("rejects ambiguous duplicate call IDs", () => {
		const transcript = buildTranscript([
			buildCall("duplicate", `cat ${SKILL_PATH}`),
			buildCall("duplicate", `cat ${SKILL_PATH}`),
			buildOutput("duplicate", buildToolEnvelope(SKILL_BODY)),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual(
			[],
		);
	});

	test("rejects unknown and truncated tool envelopes", () => {
		const transcript = buildTranscript([
			buildCall("unknown-envelope", `cat ${SKILL_PATH}`),
			buildOutput("unknown-envelope", SKILL_BODY),
			buildCall("truncated-envelope", `cat ${SKILL_PATH}`),
			buildOutput(
				"truncated-envelope",
				JSON.stringify({
					metadata: { exit_code: 0, output_truncated: true },
					output: SKILL_BODY,
				}),
			),
		]);

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual(
			[],
		);
	});

	test("ignores invocation JSON pasted inside transcript content", () => {
		const pastedCall = buildCall("spoofed", `cat ${SKILL_PATH}`);
		const transcript = JSON.stringify({
			type: "response_item",
			payload: {
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: pastedCall }],
			},
		});

		expect(extractHistoricalCodexSkillBodies(transcript, SKILL_NAME)).toEqual(
			[],
		);
	});
});

function buildTranscript(lines: readonly string[]): string {
	return lines.join("\n");
}

function buildCall(callId: string, command: string): string {
	return JSON.stringify({
		type: "response_item",
		payload: {
			type: "function_call",
			name: "exec_command",
			arguments: JSON.stringify({ cmd: command }),
			call_id: callId,
		},
	});
}

function buildOutput(callId: string, output: string): string {
	return JSON.stringify({
		type: "response_item",
		payload: {
			type: "function_call_output",
			call_id: callId,
			output,
		},
	});
}

function buildToolEnvelope(
	body: string,
	extraHeader = "",
	processLine = "Process exited with code 0",
): string {
	return [
		"Chunk ID: fixture",
		"Wall time: 0.01 seconds",
		processLine,
		extraHeader,
		"Final output:",
		body,
	]
		.filter((line) => line !== "")
		.join("\n");
}
