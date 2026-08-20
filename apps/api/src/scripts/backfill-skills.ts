import { parseArgs } from "node:util";
import { getClickhouse } from "../clickhouse.js";
import { readPositiveSafeIntegerEnv } from "../lib/env.js";
import {
	backfillSkillExtractions,
	previewSkillExtractionBackfill,
	type SkillExtractionBackfillOptions,
} from "../services/skill-extraction-backfill.service.js";

const DEFAULT_MAX_SESSIONS = readPositiveSafeIntegerEnv(
	"SKILL_BACKFILL_MAX_SESSIONS",
	10_000,
);
const DEFAULT_MAX_SESSION_BYTES = readPositiveSafeIntegerEnv(
	"SKILL_BACKFILL_MAX_SESSION_BYTES",
	512 * 1024 * 1024,
);
const DEFAULT_BATCH_MAX_ROWS = readPositiveSafeIntegerEnv(
	"SKILL_BACKFILL_BATCH_MAX_ROWS",
	64,
);
const DEFAULT_BATCH_MAX_BYTES = readPositiveSafeIntegerEnv(
	"SKILL_BACKFILL_BATCH_MAX_BYTES",
	128 * 1024 * 1024,
);
const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		"batch-max-bytes": { type: "string" },
		"batch-max-rows": { type: "string" },
		cutoff: { type: "string" },
		execute: { default: false, type: "boolean" },
		"max-session-bytes": { type: "string" },
		"max-sessions": { type: "string" },
		"organization-id": { type: "string" },
	},
	strict: true,
});

if (values.execute && !values.cutoff) {
	throw new Error(
		"Execution requires the exact --cutoff value printed by a prior preview.",
	);
}

const options: SkillExtractionBackfillOptions = {
	batchMaxBytes: parsePositiveInteger(
		values["batch-max-bytes"],
		DEFAULT_BATCH_MAX_BYTES,
		"--batch-max-bytes",
	),
	batchMaxRows: parsePositiveInteger(
		values["batch-max-rows"],
		DEFAULT_BATCH_MAX_ROWS,
		"--batch-max-rows",
	),
	cutoff: values.cutoff ? new Date(values.cutoff) : new Date(),
	maxSessionBytes: parsePositiveInteger(
		values["max-session-bytes"],
		DEFAULT_MAX_SESSION_BYTES,
		"--max-session-bytes",
	),
	maxSessions: parsePositiveInteger(
		values["max-sessions"],
		DEFAULT_MAX_SESSIONS,
		"--max-sessions",
	),
	onProgress(progress) {
		console.error(
			`skill backfill progress: ${progress.processedCandidateCount}/${progress.totalCandidateCount} sessions (${progress.completedBatchCount}/${progress.batchCount} batches)`,
		);
	},
	organizationId: values["organization-id"],
};
const executor = getClickhouse();

try {
	const result = values.execute
		? await backfillSkillExtractions(executor, options)
		: await previewSkillExtractionBackfill(executor, options);
	console.log(JSON.stringify(result, null, 2));
	if (result.failedCount > 0 || result.supersededCount > 0) {
		process.exitCode = 2;
	}
} finally {
	await executor.close();
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
	flag: string,
): number {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive integer.`);
	}
	return parsed;
}
