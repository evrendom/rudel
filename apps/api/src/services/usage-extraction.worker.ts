import { extractUsageEvents } from "@rudel/usage-events";
import { extractSessionSkills } from "./skill-extraction.js";
import type {
	UsageExtractionWorkerRequest,
	UsageExtractionWorkerResponse,
} from "./usage-extraction.types.js";

declare const self: {
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<UsageExtractionWorkerRequest>) => void,
	): void;
	postMessage(message: UsageExtractionWorkerResponse): void;
};

self.addEventListener(
	"message",
	(event: MessageEvent<UsageExtractionWorkerRequest>) => {
		const startedAt = performance.now();
		try {
			const result = extractUsageEvents(event.data.input);
			const skills = event.data.extractSkills
				? extractSessionSkills({
						content: event.data.input.content,
						sessionDate:
							event.data.skillSessionDate ?? "1970-01-01T00:00:00.000Z",
						source: event.data.input.source,
					})
				: null;
			self.postMessage({
				requestId: event.data.requestId,
				result,
				skills,
				status: "success",
				telemetry: {
					contentBytes: getContentBytes(event.data.input),
					durationMs: Math.max(0, performance.now() - startedAt),
					lineCount: getLineCount(event.data.input),
				},
			});
		} catch (error) {
			self.postMessage({
				message:
					error instanceof Error
						? error.message
						: "Usage extraction worker failed",
				requestId: event.data.requestId,
				status: "error",
			});
		}
	},
);

function getContentBytes(input: UsageExtractionWorkerRequest["input"]): number {
	let bytes = Buffer.byteLength(input.content, "utf8");
	for (const content of Object.values(input.subagents)) {
		bytes += Buffer.byteLength(content, "utf8");
	}
	return bytes;
}

function getLineCount(input: UsageExtractionWorkerRequest["input"]): number {
	let lines = countLines(input.content);
	for (const content of Object.values(input.subagents)) {
		lines += countLines(content);
	}
	return lines;
}

function countLines(content: string): number {
	if (content.length === 0) return 0;
	let lines = 1;
	for (let index = 0; index < content.length; index += 1) {
		if (content.charCodeAt(index) === 10) lines += 1;
	}
	return lines;
}
