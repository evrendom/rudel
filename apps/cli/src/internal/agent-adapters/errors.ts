import type { Source } from "../../contracts/index.js";

const SOURCE_DISPLAY_NAMES: Record<Source, string> = {
	claude_code: "Claude Code",
	codex: "Codex",
};

export function getMissingTranscriptTimestampMessage(source: Source): string {
	return `${SOURCE_DISPLAY_NAMES[source]} transcript contains no valid timestamp`;
}

export function isMissingTranscriptTimestampMessage(
	source: Source,
	message: string,
): boolean {
	return message === getMissingTranscriptTimestampMessage(source);
}

export class MissingTranscriptTimestampError extends Error {
	constructor(source: Source) {
		super(getMissingTranscriptTimestampMessage(source));
		this.name = "MissingTranscriptTimestampError";
	}
}
