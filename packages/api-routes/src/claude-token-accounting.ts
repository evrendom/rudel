import { z } from "zod";

const PARENT_SOURCE_ID = "parent";

const ClaudeUsageSchema = z.object({
	input_tokens: z.number().nonnegative().optional(),
	output_tokens: z.number().nonnegative().optional(),
	cache_read_input_tokens: z.number().nonnegative().optional(),
	cache_creation_input_tokens: z.number().nonnegative().optional(),
});

const ClaudeAssistantUsageLineSchema = z.object({
	type: z.literal("assistant"),
	timestamp: z.string(),
	message: z.object({
		id: z.string().optional(),
		usage: ClaudeUsageSchema.optional(),
	}),
});

export const ClaudeTokenBreakdownSchema = z.object({
	input_tokens: z.number(),
	uncached_input_tokens: z.number(),
	cache_read_input_tokens: z.number(),
	cache_creation_input_tokens: z.number(),
	output_tokens: z.number(),
	total_tokens: z.number(),
});

export const ClaudeTokenTimelinePointSchema = z.object({
	timestamp: z.string(),
	source: z.enum(["parent", "subagent"]),
	source_id: z.string(),
	message_id: z.string(),
	input_tokens: z.number(),
	uncached_input_tokens: z.number(),
	cache_read_input_tokens: z.number(),
	cache_creation_input_tokens: z.number(),
	output_tokens: z.number(),
	total_tokens: z.number(),
});

export const ClaudeSessionTokenBreakdownSchema = z.object({
	parent: ClaudeTokenBreakdownSchema,
	subagent: ClaudeTokenBreakdownSchema,
	session: ClaudeTokenBreakdownSchema,
	timeline: z.array(ClaudeTokenTimelinePointSchema),
});

export type ClaudeTokenBreakdown = z.infer<typeof ClaudeTokenBreakdownSchema>;
export type ClaudeTokenTimelinePoint = z.infer<
	typeof ClaudeTokenTimelinePointSchema
>;
export type ClaudeSessionTokenBreakdown = z.infer<
	typeof ClaudeSessionTokenBreakdownSchema
>;

type ClaudeUsageSnapshot = {
	lineIndex: number;
	timestamp: string;
	source: ClaudeTokenTimelinePoint["source"];
	sourceId: string;
	messageId: string;
	uncachedInputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	outputTokens: number;
};

export function buildClaudeSessionTokenBreakdown(
	content: string,
	subagents: Record<string, string>,
): ClaudeSessionTokenBreakdown {
	// Claude V2 treats session tokens as parent work plus subagent work, while
	// still preserving the split so reviewers can reconcile the combined total.
	const parentTimeline = buildClaudeTokenTimelinePoints(
		content,
		"parent",
		PARENT_SOURCE_ID,
	);
	const subagentTimeline = Object.entries(subagents).flatMap(
		([agentId, agentContent]) =>
			buildClaudeTokenTimelinePoints(agentContent, "subagent", agentId),
	);
	const timeline = [...parentTimeline, ...subagentTimeline].sort(
		compareTimelinePoints,
	);

	return {
		parent: summarizeTimeline(parentTimeline),
		subagent: summarizeTimeline(subagentTimeline),
		session: summarizeTimeline(timeline),
		timeline,
	};
}

export function buildClaudeTokenTimeline(
	content: string,
	subagents: Record<string, string>,
): ClaudeTokenTimelinePoint[] {
	return buildClaudeSessionTokenBreakdown(content, subagents).timeline;
}

export function deriveClaudeUncachedInputTokens(
	processedInputTokens: number,
	cacheReadInputTokens: number,
	cacheCreationInputTokens: number,
): number {
	return Math.max(
		processedInputTokens - cacheReadInputTokens - cacheCreationInputTokens,
		0,
	);
}

function buildClaudeTokenTimelinePoints(
	content: string,
	source: ClaudeTokenTimelinePoint["source"],
	sourceId: string,
): ClaudeTokenTimelinePoint[] {
	const snapshots = parseClaudeUsageSnapshots(content, source, sourceId);
	const finalSnapshots = selectFinalUsageSnapshots(snapshots);

	return finalSnapshots
		.sort(compareSnapshots)
		.map((snapshot) => toTimelinePoint(snapshot));
}

function parseClaudeUsageSnapshots(
	content: string,
	source: ClaudeTokenTimelinePoint["source"],
	sourceId: string,
): ClaudeUsageSnapshot[] {
	const snapshots: ClaudeUsageSnapshot[] = [];
	const lines = content.split("\n");

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		if (!line || line.trim() === "") {
			continue;
		}

		const parsedLine = parseClaudeAssistantUsageLine(line);
		if (!parsedLine) {
			continue;
		}

		const usage = parsedLine.message.usage;
		if (!usage) {
			continue;
		}

		const messageId =
			parsedLine.message.id ??
			`${sourceId}:${parsedLine.timestamp}:${lineIndex}`;

		snapshots.push({
			lineIndex,
			timestamp: parsedLine.timestamp,
			source,
			sourceId,
			messageId,
			uncachedInputTokens: usage.input_tokens ?? 0,
			cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
			cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
			outputTokens: usage.output_tokens ?? 0,
		});
	}

	return snapshots;
}

function selectFinalUsageSnapshots(
	snapshots: ClaudeUsageSnapshot[],
): ClaudeUsageSnapshot[] {
	const snapshotsByMessageId = new Map<string, ClaudeUsageSnapshot>();

	for (const snapshot of snapshots) {
		const existingSnapshot = snapshotsByMessageId.get(snapshot.messageId);
		if (
			!existingSnapshot ||
			shouldReplaceSnapshot(existingSnapshot, snapshot)
		) {
			// Anthropic streams emit cumulative usage updates for the same message id,
			// so the last snapshot in transcript order is the authoritative total.
			snapshotsByMessageId.set(snapshot.messageId, snapshot);
		}
	}

	return Array.from(snapshotsByMessageId.values());
}

function shouldReplaceSnapshot(
	existingSnapshot: ClaudeUsageSnapshot,
	candidateSnapshot: ClaudeUsageSnapshot,
): boolean {
	if (candidateSnapshot.lineIndex !== existingSnapshot.lineIndex) {
		return candidateSnapshot.lineIndex > existingSnapshot.lineIndex;
	}

	return (
		getSnapshotTotalTokens(candidateSnapshot) >=
		getSnapshotTotalTokens(existingSnapshot)
	);
}

function toTimelinePoint(
	snapshot: ClaudeUsageSnapshot,
): ClaudeTokenTimelinePoint {
	// Anthropic's `usage.input_tokens` is only the uncached suffix. Rudel's
	// public `input_tokens` field is processed input, so we expand cache reads
	// and cache writes here before the value leaves this module.
	const inputTokens =
		snapshot.uncachedInputTokens +
		snapshot.cacheReadInputTokens +
		snapshot.cacheCreationInputTokens;

	return {
		timestamp: snapshot.timestamp,
		source: snapshot.source,
		source_id: snapshot.sourceId,
		message_id: snapshot.messageId,
		input_tokens: inputTokens,
		uncached_input_tokens: snapshot.uncachedInputTokens,
		cache_read_input_tokens: snapshot.cacheReadInputTokens,
		cache_creation_input_tokens: snapshot.cacheCreationInputTokens,
		output_tokens: snapshot.outputTokens,
		total_tokens: inputTokens + snapshot.outputTokens,
	};
}

function summarizeTimeline(
	timeline: ClaudeTokenTimelinePoint[],
): ClaudeTokenBreakdown {
	let inputTokens = 0;
	let uncachedInputTokens = 0;
	let cacheReadInputTokens = 0;
	let cacheCreationInputTokens = 0;
	let outputTokens = 0;

	for (const point of timeline) {
		inputTokens += point.input_tokens;
		uncachedInputTokens += point.uncached_input_tokens;
		cacheReadInputTokens += point.cache_read_input_tokens;
		cacheCreationInputTokens += point.cache_creation_input_tokens;
		outputTokens += point.output_tokens;
	}

	return {
		input_tokens: inputTokens,
		uncached_input_tokens: uncachedInputTokens,
		cache_read_input_tokens: cacheReadInputTokens,
		cache_creation_input_tokens: cacheCreationInputTokens,
		output_tokens: outputTokens,
		total_tokens: inputTokens + outputTokens,
	};
}

function parseClaudeAssistantUsageLine(line: string) {
	try {
		const parsed = JSON.parse(line) as unknown;
		const result = ClaudeAssistantUsageLineSchema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

function compareSnapshots(
	left: ClaudeUsageSnapshot,
	right: ClaudeUsageSnapshot,
): number {
	const leftTimestampMs = Date.parse(left.timestamp);
	const rightTimestampMs = Date.parse(right.timestamp);
	if (
		Number.isFinite(leftTimestampMs) &&
		Number.isFinite(rightTimestampMs) &&
		leftTimestampMs !== rightTimestampMs
	) {
		return leftTimestampMs - rightTimestampMs;
	}

	if (left.timestamp === right.timestamp) {
		return left.lineIndex - right.lineIndex;
	}

	return left.timestamp.localeCompare(right.timestamp);
}

function compareTimelinePoints(
	left: ClaudeTokenTimelinePoint,
	right: ClaudeTokenTimelinePoint,
): number {
	const leftTimestampMs = Date.parse(left.timestamp);
	const rightTimestampMs = Date.parse(right.timestamp);
	if (
		Number.isFinite(leftTimestampMs) &&
		Number.isFinite(rightTimestampMs) &&
		leftTimestampMs !== rightTimestampMs
	) {
		return leftTimestampMs - rightTimestampMs;
	}

	if (left.timestamp === right.timestamp) {
		if (left.source_id === right.source_id) {
			return left.message_id.localeCompare(right.message_id);
		}

		return left.source_id.localeCompare(right.source_id);
	}

	return left.timestamp.localeCompare(right.timestamp);
}

function getSnapshotTotalTokens(snapshot: ClaudeUsageSnapshot): number {
	return (
		snapshot.uncachedInputTokens +
		snapshot.cacheReadInputTokens +
		snapshot.cacheCreationInputTokens +
		snapshot.outputTokens
	);
}
