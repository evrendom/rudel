import type { TraceEvent } from "./conversation-trace";

// One API request's usage, as recorded on the assistant message that closed
// it. Mirrors the session feature's TokenUsageEvent shape so per-turn usage
// events can be passed in directly.
export type AgentTraceRequestUsage = {
	at: string;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	inputTokens: number;
	model: string | undefined;
	outputTokens: number;
};

type AgentTraceRequestGroup = {
	events: TraceEvent[];
	usage: AgentTraceRequestUsage | undefined;
};

// Mirrors the compact token formatting used by SessionTurnMetadataTags so
// request tags and turn tags read identically ("640k", "5.1m").
export function formatTraceRequestTokens(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}
	if (value < 1_000_000) {
		return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	}
	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

export function getTraceRequestInputTotal(usage: AgentTraceRequestUsage) {
	return (
		usage.inputTokens +
		usage.cacheReadInputTokens +
		usage.cacheCreationInputTokens
	);
}

export function getTraceRequestCachedShare(usage: AgentTraceRequestUsage) {
	const total = getTraceRequestInputTotal(usage);
	return total <= 0 ? undefined : usage.cacheReadInputTokens / total;
}

// Same skill-file pattern the turn metadata extractor matches, so request
// tags agree with the turn-level skill tags.
const SKILL_LOAD_PATTERN = /skills\/([a-zA-Z0-9_-]+)\/SKILL(?:\.md)?/gu;

// Which skills a request loaded, read from its own tool events: the Skill
// tool's input (Claude Code) or skill-file loads inside shell commands and
// exec scripts (Codex `cmd`/`input`, Claude Bash `command`).
export function getTraceRequestSkills(events: readonly TraceEvent[]): string[] {
	const skills: string[] = [];
	const add = (value: unknown) => {
		if (typeof value !== "string") {
			return;
		}
		const normalized = value.trim();
		if (normalized && !skills.includes(normalized)) {
			skills.push(normalized);
		}
	};

	for (const event of events) {
		if (event.kind !== "tool") {
			continue;
		}
		if (event.toolName === "Skill") {
			add(event.input.skill);
			continue;
		}
		for (const key of ["cmd", "command", "input"]) {
			const candidate = event.input[key];
			if (typeof candidate !== "string") {
				continue;
			}
			for (const match of candidate.matchAll(SKILL_LOAD_PATTERN)) {
				add(match[1]);
			}
		}
	}
	return skills;
}

// Removes and returns the queue's leading usage records that fall before the
// cutoff — the timestamp of a non-agent row (system notice, user message)
// interrupting the turn. Turns can interleave system rows between requests;
// each flush of agent events may only claim the usage recorded before the
// interruption, or every request after the first system row loses its events.
// Without a parseable cutoff (final flush, summary rows) the whole queue
// drains. Records with unparseable timestamps drain with the earliest batch.
export function takeTraceRequestUsageBefore(
	queue: AgentTraceRequestUsage[],
	cutoff: string | undefined,
): AgentTraceRequestUsage[] {
	const cutoffMs = cutoff === undefined ? Number.NaN : Date.parse(cutoff);
	if (Number.isNaN(cutoffMs)) {
		return queue.splice(0);
	}

	let count = 0;
	while (count < queue.length) {
		const atMs = Date.parse(queue[count]?.at ?? "");
		if (!Number.isNaN(atMs) && atMs >= cutoffMs) {
			break;
		}
		count += 1;
	}
	return queue.splice(0, count);
}

// Where a usage record's timestamp sits relative to its request's events.
// Claude Code stamps usage on the request's FIRST assistant line, so the
// timestamp marks the request's start and events belong forward of it.
// Codex emits its token_count record AFTER the request's events, so the
// timestamp marks the request's end and events belong backward of it.
export type AgentTraceRequestUsagePlacement = "start" | "end";

// Buckets a turn's trace events into per-request groups. Events are walked in
// document order with a forward-only pointer; the placement decides when the
// pointer advances: with "start", an event at or past the NEXT usage
// timestamp opens the next request; with "end", an event past the CURRENT
// usage timestamp already belongs to the next request. Without any usage
// records, everything lands in a single usage-less group so callers can fall
// back to the flat rendering.
export function groupTraceEventsIntoRequests(
	events: readonly TraceEvent[],
	usage: readonly AgentTraceRequestUsage[],
	placement: AgentTraceRequestUsagePlacement = "start",
): AgentTraceRequestGroup[] {
	if (usage.length === 0) {
		return [{ events: [...events], usage: undefined }];
	}

	const sortedUsage = [...usage].sort(
		(left, right) => Date.parse(left.at) - Date.parse(right.at),
	);
	const boundaries = sortedUsage.map((entry) => Date.parse(entry.at));
	const groups: AgentTraceRequestGroup[] = sortedUsage.map((entry) => ({
		events: [],
		usage: entry,
	}));
	let groupIndex = 0;

	for (const event of events) {
		const eventMs = Date.parse(event.timestamp);
		if (!Number.isNaN(eventMs)) {
			while (groupIndex + 1 < boundaries.length) {
				const current = boundaries[groupIndex] ?? Number.NaN;
				const next = boundaries[groupIndex + 1] ?? Number.NaN;
				const advance =
					placement === "start"
						? !Number.isNaN(next) && eventMs >= next
						: !Number.isNaN(current) && eventMs > current;
				if (!advance) {
					break;
				}
				groupIndex += 1;
			}
		}
		groups[groupIndex]?.events.push(event);
	}

	return groups;
}
