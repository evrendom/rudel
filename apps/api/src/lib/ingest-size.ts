import { ORPCError } from "@orpc/server";
import {
	INGEST_LIMIT_REASONS,
	type IngestSessionInput,
} from "@rudel/api-routes";

export function enforceIngestAggregateSize(
	input: IngestSessionInput,
	maxBytes: number,
): number {
	const actualBytes =
		Buffer.byteLength(input.content, "utf8") +
		(input.subagents ?? []).reduce(
			(total, subagent) => total + Buffer.byteLength(subagent.content, "utf8"),
			0,
		);

	if (actualBytes > maxBytes) {
		throw new ORPCError("PAYLOAD_TOO_LARGE", {
			data: {
				reason: INGEST_LIMIT_REASONS.transcriptTooLarge,
				maxBytes,
				actualBytes,
			},
		});
	}

	return actualBytes;
}
