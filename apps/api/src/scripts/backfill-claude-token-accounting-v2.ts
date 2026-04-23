import { ingestRudelSessionAnalytics } from "@rudel/ch-schema/generated";
import { getClickhouse } from "../clickhouse.js";
import {
	buildClaudeSessionAnalyticsRow,
	type ClaudeAnalyticsSource,
} from "../services/claude-session-analytics.service.js";

const DEFAULT_BATCH_SIZE = 100;

type BackfillArgs = {
	batchSize: number;
	offset: number;
	maxSessions: number | null;
};

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const clickhouse = getClickhouse();
	let processedSessions = 0;
	let currentOffset = args.offset;

	for (;;) {
		const sources = await loadLatestClaudeSources(
			args.batchSize,
			currentOffset,
		);
		if (sources.length === 0) {
			console.info(
				`Claude token accounting backfill complete. Processed ${processedSessions} sessions.`,
			);
			return;
		}

		const remainingSessions =
			args.maxSessions === null
				? sources.length
				: Math.max(args.maxSessions - processedSessions, 0);
		const activeBatch = sources.slice(0, remainingSessions);
		if (activeBatch.length === 0) {
			console.info(
				`Claude token accounting backfill reached maxSessions=${args.maxSessions}.`,
			);
			return;
		}

		const rows = activeBatch.map((source) =>
			buildClaudeSessionAnalyticsRow(source),
		);
		await ingestRudelSessionAnalytics(clickhouse, rows, { validate: true });

		processedSessions += rows.length;
		currentOffset += sources.length;
		console.info(
			`Inserted ${rows.length} corrected Claude analytics rows (total ${processedSessions}).`,
		);
	}
}

async function loadLatestClaudeSources(
	limit: number,
	offset: number,
): Promise<ClaudeAnalyticsSource[]> {
	const clickhouse = getClickhouse();
	return clickhouse.query<ClaudeAnalyticsSource>({
		query: `
      -- Rebuild from the latest raw transcript per session so the backfill
      -- matches the same immutable source material as new ingest correction.
      SELECT
        session_id,
        organization_id,
        project_path,
        git_remote,
        package_name,
        package_type,
        content,
        subagents,
        user_id,
        git_branch,
        git_sha,
        tag,
        formatDateTime(session_date, '%Y-%m-%dT%H:%i:%S.%fZ') AS session_date,
        formatDateTime(last_interaction_date, '%Y-%m-%dT%H:%i:%S.%fZ') AS last_interaction_date,
        formatDateTime(ingested_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS ingested_at
      FROM rudel.claude_sessions
      QUALIFY ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ingested_at DESC) = 1
      ORDER BY session_id
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `,
		query_params: {
			limit,
			offset,
		},
	});
}

function parseArgs(argv: string[]): BackfillArgs {
	let batchSize = DEFAULT_BATCH_SIZE;
	let offset = 0;
	let maxSessions: number | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const nextArg = argv[index + 1];
		if (arg === "--batch-size" && nextArg) {
			batchSize = parsePositiveInt(nextArg, "--batch-size");
			index += 1;
			continue;
		}

		if (arg === "--offset" && nextArg) {
			offset = parseNonNegativeInt(nextArg, "--offset");
			index += 1;
			continue;
		}

		if (arg === "--max-sessions" && nextArg) {
			maxSessions = parsePositiveInt(nextArg, "--max-sessions");
			index += 1;
		}
	}

	return { batchSize, offset, maxSessions };
}

function parsePositiveInt(value: string, flag: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive integer. Received: ${value}`);
	}
	return parsed;
}

function parseNonNegativeInt(value: string, flag: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(
			`${flag} must be a non-negative integer. Received: ${value}`,
		);
	}
	return parsed;
}

void main().catch((error: unknown) => {
	console.error("[backfill-claude-token-accounting-v2] failed", error);
	process.exit(1);
});
