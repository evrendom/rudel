#!/usr/bin/env bun
import { extractUsageEventsOffThread } from "../apps/api/src/services/usage-extraction.service.js";

const targetMiB = readTargetMiB();
const targetBytes = targetMiB * 1024 * 1024;
const representativeLines = Array.from({ length: 256 }, (_, index) =>
	JSON.stringify({
		message: {
			id: `benchmark-message-${index}`,
			model: "claude-sonnet-4-5",
			role: "assistant",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 2,
					ephemeral_5m_input_tokens: 3,
				},
				cache_creation_input_tokens: 5,
				cache_read_input_tokens: 7,
				input_tokens: 11,
				output_tokens: 13,
				service_tier: "standard",
			},
		},
		requestId: `benchmark-request-${index}`,
		timestamp: "2026-08-03T00:00:00.000Z",
		type: "assistant",
	}),
);
const block = `${representativeLines.join("\n")}\n`;
const blockBytes = Buffer.byteLength(block, "utf8");
const repeats = Math.max(1, Math.floor(targetBytes / blockBytes));
const content = block.repeat(repeats);
const bytes = Buffer.byteLength(content, "utf8");
const startedAt = performance.now();
const result = await extractUsageEventsOffThread({
	bytes,
	input: {
		organizationId: "benchmark-org",
		userId: "benchmark-user",
		sessionId: `usage-extraction-${targetMiB}mib`,
		source: "claude_code",
		content,
		subagents: {},
	},
	signal: new AbortController().signal,
	userId: "benchmark-user",
});
const elapsedMs = performance.now() - startedAt;

if (result.status !== "complete" || result.events.length !== 256) {
	throw new Error(
		"Expected 256 resolved usage events from benchmark extraction",
	);
}

process.stdout.write(
	`${JSON.stringify({
		bytes,
		elapsedMs: Math.round(elapsedMs),
		events: result.events.length,
		lines: repeats * representativeLines.length,
		mibPerSecond: Number((bytes / 1024 / 1024 / (elapsedMs / 1000)).toFixed(1)),
		targetMiB,
	})}\n`,
);

function readTargetMiB(): number {
	const raw = process.env.USAGE_EXTRACTION_BENCHMARK_MIB ?? "128";
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 128) {
		throw new Error(
			"USAGE_EXTRACTION_BENCHMARK_MIB must be an integer from 1 through 128",
		);
	}
	return parsed;
}
