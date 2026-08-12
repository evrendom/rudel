import { describe, expect, test } from "bun:test";
import type { TraceEvent } from "./conversation-trace";
import {
	type AgentTraceRequestUsage,
	formatTraceRequestTokens,
	getTraceRequestCachedShare,
	getTraceRequestInputTotal,
	getTraceRequestSkills,
	groupTraceEventsIntoRequests,
	takeTraceRequestUsageBefore,
} from "./conversation-trace-requests";

function createEvent(id: string, timestamp: string): TraceEvent {
	return { id, kind: "reasoning", text: `event ${id}`, timestamp };
}

function createUsage(
	at: string,
	overrides: Partial<AgentTraceRequestUsage> = {},
): AgentTraceRequestUsage {
	return {
		at,
		cacheCreationInputTokens: 2_000,
		cacheReadInputTokens: 90_000,
		inputTokens: 8_000,
		model: "claude-fable-5",
		outputTokens: 1_200,
		...overrides,
	};
}

describe("groupTraceEventsIntoRequests", () => {
	test("with end placement, events after a usage timestamp open the next request (Codex)", () => {
		const events = [
			createEvent("a", "2026-08-02T10:00:01.000Z"),
			createEvent("b", "2026-08-02T10:00:05.000Z"),
			createEvent("c", "2026-08-02T10:00:06.000Z"),
			createEvent("d", "2026-08-02T10:00:21.000Z"),
		];
		const usage = [
			createUsage("2026-08-02T10:00:05.000Z"),
			createUsage("2026-08-02T10:00:25.000Z"),
		];

		const groups = groupTraceEventsIntoRequests(events, usage, "end");
		expect(groups).toHaveLength(2);
		expect(groups[0]?.events.map((event) => event.id)).toEqual(["a", "b"]);
		// c sits just after the first usage — closer to it than to the second —
		// but with end placement it still belongs to the second request.
		expect(groups[1]?.events.map((event) => event.id)).toEqual(["c", "d"]);
		expect(groups[0]?.usage?.at).toBe("2026-08-02T10:00:05.000Z");
	});

	test("with start placement, usage stamped on the request's first line claims following events (Claude Code)", () => {
		const events = [
			createEvent("a", "2026-08-02T10:00:00.000Z"),
			createEvent("b", "2026-08-02T10:00:28.000Z"),
			createEvent("c", "2026-08-02T10:00:30.000Z"),
			createEvent("d", "2026-08-02T10:00:31.000Z"),
		];
		const usage = [
			createUsage("2026-08-02T10:00:00.000Z"),
			createUsage("2026-08-02T10:00:30.000Z"),
		];

		const groups = groupTraceEventsIntoRequests(events, usage, "start");
		// b is closer to the second usage timestamp, but with start placement
		// it still belongs to the request that started at the first.
		expect(groups[0]?.events.map((event) => event.id)).toEqual(["a", "b"]);
		expect(groups[1]?.events.map((event) => event.id)).toEqual(["c", "d"]);
	});

	test("events far after the last usage record stay attached to it", () => {
		const events = [
			createEvent("a", "2026-08-02T10:00:01.000Z"),
			createEvent("b", "2026-08-02T10:05:00.000Z"),
		];
		const usage = [createUsage("2026-08-02T10:00:02.000Z")];

		const groups = groupTraceEventsIntoRequests(events, usage);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.events.map((event) => event.id)).toEqual(["a", "b"]);
	});

	test("no usage records yields a single usage-less group", () => {
		const events = [createEvent("a", "2026-08-02T10:00:01.000Z")];
		const groups = groupTraceEventsIntoRequests(events, []);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.usage).toBeUndefined();
		expect(groups[0]?.events).toHaveLength(1);
	});

	test("a usage record with no events still gets its own group", () => {
		const events = [createEvent("a", "2026-08-02T10:00:10.000Z")];
		const usage = [
			createUsage("2026-08-02T10:00:02.000Z"),
			createUsage("2026-08-02T10:00:15.000Z"),
		];

		// The same mid-gap event belongs to the first request under start
		// placement (request began at 02) and to the second under end
		// placement (request completed at 15) — the other group stays empty.
		const startGroups = groupTraceEventsIntoRequests(events, usage, "start");
		expect(startGroups).toHaveLength(2);
		expect(startGroups[0]?.events.map((event) => event.id)).toEqual(["a"]);
		expect(startGroups[1]?.events).toHaveLength(0);

		const endGroups = groupTraceEventsIntoRequests(events, usage, "end");
		expect(endGroups[0]?.events).toHaveLength(0);
		expect(endGroups[1]?.events.map((event) => event.id)).toEqual(["a"]);
	});

	test("events with unparseable timestamps stay in the current group", () => {
		const events = [
			createEvent("a", "2026-08-02T10:00:01.000Z"),
			createEvent("b", ""),
			createEvent("c", "2026-08-02T10:00:30.000Z"),
		];
		const usage = [
			createUsage("2026-08-02T10:00:00.000Z"),
			createUsage("2026-08-02T10:00:25.000Z"),
		];

		const groups = groupTraceEventsIntoRequests(events, usage, "start");
		expect(groups[0]?.events.map((event) => event.id)).toEqual(["a", "b"]);
		expect(groups[1]?.events.map((event) => event.id)).toEqual(["c"]);
	});
});

function createToolEvent(
	id: string,
	toolName: string,
	input: Record<string, unknown>,
): TraceEvent {
	return {
		id,
		input,
		kind: "tool",
		result: undefined,
		timestamp: "2026-08-02T10:00:00.000Z",
		toolName,
	};
}

describe("getTraceRequestSkills", () => {
	test("reads the Skill tool's input (Claude Code)", () => {
		const events = [createToolEvent("a", "Skill", { skill: "github" })];
		expect(getTraceRequestSkills(events)).toEqual(["github"]);
	});

	test("matches skill-file loads in cmd, command, and input strings (Codex)", () => {
		const events = [
			createToolEvent("a", "exec_command", {
				cmd: "cat skills/github/SKILL.md",
			}),
			createToolEvent("b", "Bash", {
				command: "cat .claude/skills/gh-fix-ci/SKILL.md",
			}),
			createToolEvent("c", "exec", {
				input: "tools.exec_command({cmd: 'cat skills/linear/SKILL.md'})",
			}),
		];
		expect(getTraceRequestSkills(events)).toEqual([
			"github",
			"gh-fix-ci",
			"linear",
		]);
	});

	test("deduplicates and ignores non-tool events and unrelated commands", () => {
		const events = [
			createEvent("r", "2026-08-02T10:00:00.000Z"),
			createToolEvent("a", "exec_command", { cmd: "ls src" }),
			createToolEvent("b", "Skill", { skill: "github" }),
			createToolEvent("c", "exec_command", {
				cmd: "cat skills/github/SKILL.md",
			}),
		];
		expect(getTraceRequestSkills(events)).toEqual(["github"]);
	});
});

describe("takeTraceRequestUsageBefore", () => {
	test("splits the queue at an interrupting row's timestamp", () => {
		const queue = [
			createUsage("2026-08-02T10:00:01.000Z"),
			createUsage("2026-08-02T10:00:05.000Z"),
			createUsage("2026-08-02T10:00:30.000Z"),
		];

		const batch = takeTraceRequestUsageBefore(
			queue,
			"2026-08-02T10:00:10.000Z",
		);
		expect(batch.map((entry) => entry.at)).toEqual([
			"2026-08-02T10:00:01.000Z",
			"2026-08-02T10:00:05.000Z",
		]);
		expect(queue.map((entry) => entry.at)).toEqual([
			"2026-08-02T10:00:30.000Z",
		]);
	});

	test("without a cutoff the whole queue drains (final flush)", () => {
		const queue = [
			createUsage("2026-08-02T10:00:01.000Z"),
			createUsage("2026-08-02T10:00:05.000Z"),
		];

		const batch = takeTraceRequestUsageBefore(queue, undefined);
		expect(batch).toHaveLength(2);
		expect(queue).toHaveLength(0);
	});

	test("an unparseable cutoff also drains the queue", () => {
		const queue = [createUsage("2026-08-02T10:00:01.000Z")];
		expect(takeTraceRequestUsageBefore(queue, "not a date")).toHaveLength(1);
		expect(queue).toHaveLength(0);
	});

	test("a cutoff before every record takes nothing", () => {
		const queue = [createUsage("2026-08-02T10:00:05.000Z")];
		expect(
			takeTraceRequestUsageBefore(queue, "2026-08-02T10:00:01.000Z"),
		).toHaveLength(0);
		expect(queue).toHaveLength(1);
	});

	test("records with unparseable timestamps drain with the earliest batch", () => {
		const queue = [createUsage(""), createUsage("2026-08-02T10:00:30.000Z")];

		const batch = takeTraceRequestUsageBefore(
			queue,
			"2026-08-02T10:00:10.000Z",
		);
		expect(batch.map((entry) => entry.at)).toEqual([""]);
		expect(queue).toHaveLength(1);
	});
});

describe("request usage math and formatting", () => {
	test("input total sums fresh, cache read, and cache creation", () => {
		expect(getTraceRequestInputTotal(createUsage("2026-08-02T10:00:00Z"))).toBe(
			100_000,
		);
	});

	test("cached share divides cache reads by the input total", () => {
		expect(
			getTraceRequestCachedShare(createUsage("2026-08-02T10:00:00Z")),
		).toBeCloseTo(0.9);
		expect(
			getTraceRequestCachedShare(
				createUsage("2026-08-02T10:00:00Z", {
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 0,
					inputTokens: 0,
				}),
			),
		).toBeUndefined();
	});

	test("token formatting matches the turn tag style", () => {
		expect(formatTraceRequestTokens(640_000)).toBe("640k");
		expect(formatTraceRequestTokens(1_200)).toBe("1.2k");
		expect(formatTraceRequestTokens(5_100_000)).toBe("5.1m");
		expect(formatTraceRequestTokens(950)).toBe("950");
	});
});
