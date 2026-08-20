import { describe, expect, test } from "bun:test";
import { buildHistoricalSkillDetail } from "./historical-skills-aggregation.js";

const SKILL_NAME = "testing-bun";
const SKILL_PATH = `/Users/test/.codex/skills/${SKILL_NAME}/SKILL.md`;
const FIRST_BODY = [
	"---",
	"name: testing-bun",
	"description: First version.",
	"---",
	"",
	"# First",
	"",
].join("\n");
const SECOND_BODY = FIRST_BODY.replace("First version.", "Second version.");

describe("buildHistoricalSkillDetail", () => {
	test("groups byte-identical versions across distinct sessions", () => {
		const detail = buildHistoricalSkillDetail(SKILL_NAME, [
			buildSession("session-1", "2026-01-01T00:00:00Z", FIRST_BODY),
			buildSession("session-2", "2026-02-01T00:00:00Z", FIRST_BODY),
			buildSession("session-2", "2026-02-01T00:00:00Z", FIRST_BODY),
		]);

		expect(detail.sessionCount).toBe(2);
		expect(detail.unavailableSessionCount).toBe(0);
		expect(detail.versions).toHaveLength(1);
		expect(detail.versions[0]).toMatchObject({
			content: FIRST_BODY,
			sessionCount: 2,
			firstUsedAt: "2026-01-01T00:00:00Z",
			lastUsedAt: "2026-02-01T00:00:00Z",
		});
		expect(detail.versions[0]?.contentSha256).toHaveLength(64);
	});

	test("sorts changed bodies newest first and counts unavailable sessions", () => {
		const detail = buildHistoricalSkillDetail(SKILL_NAME, [
			buildSession("session-old", "2026-01-01T00:00:00Z", FIRST_BODY),
			buildSession("session-new", "2026-03-01T00:00:00Z", SECOND_BODY),
			{
				session_id: "session-unavailable",
				used_at: "2026-04-01T00:00:00Z",
				content: buildTranscript("missing-output", FIRST_BODY, false),
			},
		]);

		expect(detail).toMatchObject({
			name: SKILL_NAME,
			sessionCount: 3,
			unavailableSessionCount: 1,
		});
		expect(detail.versions.map((version) => version.content)).toEqual([
			SECOND_BODY,
			FIRST_BODY,
		]);
	});

	test("never includes tool wrappers or local paths in recovered content", () => {
		const detail = buildHistoricalSkillDetail(SKILL_NAME, [
			buildSession("session-1", "2026-01-01T00:00:00Z", FIRST_BODY),
		]);
		const serialized = JSON.stringify(detail);

		expect(serialized).not.toContain("Chunk ID:");
		expect(serialized).not.toContain("/Users/test/");
		expect(serialized).not.toContain("session-1");
	});
});

function buildSession(sessionId: string, usedAt: string, body: string) {
	return {
		session_id: sessionId,
		used_at: usedAt,
		content: buildTranscript(sessionId, body, true),
	};
}

function buildTranscript(callId: string, body: string, includeOutput: boolean) {
	const call = JSON.stringify({
		type: "response_item",
		payload: {
			type: "function_call",
			name: "exec_command",
			arguments: JSON.stringify({ cmd: `cat ${SKILL_PATH}` }),
			call_id: callId,
		},
	});
	const output = JSON.stringify({
		type: "response_item",
		payload: {
			type: "function_call_output",
			call_id: callId,
			output: [
				"Chunk ID: fixture",
				"Wall time: 0.01 seconds",
				"Process exited with code 0",
				"Output:",
				body,
			].join("\n"),
		},
	});

	return includeOutput ? [call, output].join("\n") : call;
}
