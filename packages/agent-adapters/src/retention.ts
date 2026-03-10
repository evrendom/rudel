import type { IngestRetentionMode, IngestRetentionPolicy } from "./types.js";

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

export function retainContent(
	content: string,
	mode: IngestRetentionMode,
	maxBytes: number,
): string {
	if (mode === "none") {
		return "";
	}

	if (mode === "full" || maxBytes <= 0) {
		return content;
	}

	if (byteLength(content) <= maxBytes) {
		return content;
	}

	const lines = content.split("\n");
	const kept: string[] = [];
	let used = 0;

	for (const line of lines) {
		const candidate = kept.length === 0 ? line : `\n${line}`;
		const candidateBytes = byteLength(candidate);
		if (used + candidateBytes > maxBytes) {
			break;
		}
		kept.push(line);
		used += candidateBytes;
	}

	return kept.join("\n");
}

export function applyRetentionPolicy(
	content: string,
	policy: Pick<IngestRetentionPolicy, "transcriptMode" | "transcriptMaxBytes">,
): string {
	return retainContent(
		content,
		policy.transcriptMode,
		policy.transcriptMaxBytes,
	);
}

export function applySubagentRetentionPolicy(
	content: string,
	policy: Pick<IngestRetentionPolicy, "subagentMode" | "subagentMaxBytes">,
): string {
	return retainContent(content, policy.subagentMode, policy.subagentMaxBytes);
}
