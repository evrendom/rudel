import type { IngestSessionInput } from "@rudel/api-routes";

export const INGEST_SHRINK_MAX_RELATIVE_BYTE_LOSS = 0.05;
export const INGEST_SHRINK_MIN_BYTE_TOLERANCE = 4 * 1024;

export interface IngestContentShape {
	assistantLineCount: number;
	contentBytes: number;
}

export function getIngestContentShape(
	input: IngestSessionInput,
): IngestContentShape {
	const persistedContents = [
		input.content,
		...(input.source === "claude_code"
			? (input.subagents ?? []).map((subagent) => subagent.content)
			: []),
	];

	return {
		assistantLineCount: persistedContents.reduce(
			(total, content) => total + countAssistantLines(content, input.source),
			0,
		),
		contentBytes: persistedContents.reduce(
			(total, content) => total + Buffer.byteLength(content, "utf8"),
			0,
		),
	};
}

export function isUnexpectedIngestShrink(
	previous: IngestContentShape,
	current: IngestContentShape,
): boolean {
	if (current.assistantLineCount < previous.assistantLineCount) {
		return true;
	}

	const allowedByteLoss = Math.max(
		INGEST_SHRINK_MIN_BYTE_TOLERANCE,
		Math.floor(previous.contentBytes * INGEST_SHRINK_MAX_RELATIVE_BYTE_LOSS),
	);
	return current.contentBytes < previous.contentBytes - allowedByteLoss;
}

function countAssistantLines(
	content: string,
	source: IngestSessionInput["source"],
): number {
	let count = 0;
	for (const line of content.split("\n")) {
		if (!line) continue;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			continue;
		}
		if (!isRecord(value)) continue;

		if (source === "claude_code") {
			if (value.type === "assistant") count++;
			continue;
		}

		if (
			value.type === "response_item" &&
			isRecord(value.payload) &&
			value.payload.type === "message" &&
			value.payload.role === "assistant"
		) {
			count++;
		}
	}
	return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
