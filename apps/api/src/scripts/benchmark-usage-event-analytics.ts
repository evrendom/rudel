import { parseArgs } from "node:util";
import { getClickhouse } from "../clickhouse.js";
import {
	buildLegacyUsageAnalyticsCte,
	buildUsageEventAnalyticsCte,
} from "../services/usage-event-analytics.service.js";

const DAY_WINDOWS = [7, 30, 365] as const;
const DEFAULT_ITERATIONS = 10;
const DEFAULT_WARMUPS = 1;
const MAX_PEAK_MEMORY_BYTES = 512 * 1024 * 1024;
const MAX_ROWS_TO_READ = 10_000_000;
const MAX_EXECUTION_TIME_SECONDS = 30;
const QUERY_LOG_WAIT_ATTEMPTS = 10;
const QUERY_LOG_WAIT_MS = 1_000;

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		iterations: { type: "string" },
		"organization-id": { type: "string" },
		warmups: { type: "string" },
	},
	strict: true,
});

const organizationId = values["organization-id"]?.trim();
if (!organizationId) {
	throw new Error("--organization-id is required");
}

const iterations = parsePositiveInteger(
	values.iterations,
	DEFAULT_ITERATIONS,
	"--iterations",
);
const warmups = parseNonNegativeInteger(
	values.warmups,
	DEFAULT_WARMUPS,
	"--warmups",
);
const runPrefix = `usage-analytics-${crypto.randomUUID()}`;
const executor = getClickhouse();

type AnalyticsMode = "events" | "legacy";

interface BenchmarkMeasurement {
	days: number;
	latencyMs: number;
	mode: AnalyticsMode;
}

interface QueryLogRow {
	log_comment: string;
	memory_usage: number | string;
}

try {
	const measurements: BenchmarkMeasurement[] = [];

	for (const days of DAY_WINDOWS) {
		for (const mode of ["legacy", "events"] as const) {
			for (let warmup = 0; warmup < warmups; warmup += 1) {
				await runRollup(mode, days);
			}

			for (let iteration = 0; iteration < iterations; iteration += 1) {
				const startedAt = performance.now();
				await runRollup(
					mode,
					days,
					`${runPrefix}:${mode}:${days}:${iteration}`,
				);
				measurements.push({
					days,
					latencyMs: performance.now() - startedAt,
					mode,
				});
			}
		}
	}

	const queryLogRows = await waitForQueryLogRows(
		DAY_WINDOWS.length * 2 * iterations,
	);
	const peakMemoryByGroup = new Map<string, number>();
	for (const row of queryLogRows) {
		const group = row.log_comment.split(":").slice(1, 3).join(":");
		peakMemoryByGroup.set(
			group,
			Math.max(peakMemoryByGroup.get(group) ?? 0, Number(row.memory_usage)),
		);
	}

	let passed = true;
	const results = DAY_WINDOWS.map((days) => {
		const legacyP95Ms = percentile95(
			measurements
				.filter((entry) => entry.days === days && entry.mode === "legacy")
				.map((entry) => entry.latencyMs),
		);
		const eventP95Ms = percentile95(
			measurements
				.filter((entry) => entry.days === days && entry.mode === "events")
				.map((entry) => entry.latencyMs),
		);
		const eventPeakMemoryBytes = peakMemoryByGroup.get(`events:${days}`);
		const latencyLimitMs = Math.max(2_000, legacyP95Ms * 2);
		const latencyPassed = eventP95Ms <= latencyLimitMs;
		const memoryPassed =
			eventPeakMemoryBytes !== undefined &&
			eventPeakMemoryBytes < MAX_PEAK_MEMORY_BYTES;
		passed &&= latencyPassed && memoryPassed;

		return {
			days,
			eventP95Ms: roundMilliseconds(eventP95Ms),
			eventPeakMemoryBytes,
			latencyLimitMs: roundMilliseconds(latencyLimitMs),
			latencyPassed,
			legacyP95Ms: roundMilliseconds(legacyP95Ms),
			memoryLimitBytes: MAX_PEAK_MEMORY_BYTES,
			memoryPassed,
		};
	});

	console.log(
		JSON.stringify(
			{
				authority: "bounded_cutover_performance_gate",
				iterations,
				organizationId,
				passed,
				results,
				runId: runPrefix,
				warmups,
			},
			null,
			2,
		),
	);

	if (!passed) process.exitCode = 2;
} finally {
	await executor.close();
}

async function runRollup(
	mode: AnalyticsMode,
	days: number,
	logComment?: string,
): Promise<void> {
	const cte =
		mode === "events"
			? buildUsageEventAnalyticsCte()
			: buildLegacyUsageAnalyticsCte();

	await executor.query({
		clickhouse_settings: {
			...(logComment === undefined
				? { log_queries: 0 }
				: { log_comment: logComment, log_queries: 1 }),
			max_execution_time: MAX_EXECUTION_TIME_SECONDS,
			max_rows_to_read: String(MAX_ROWS_TO_READ),
			timeout_before_checking_execution_speed: 0,
		},
		query: `
			WITH ${cte}
			SELECT
				count() AS sessions,
				sum(total_tokens) AS total_tokens,
				sum(ifNull(estimated_cost, 0)) AS known_cost
			FROM usage_analytics_sessions
			WHERE organization_id = {orgId:String}
				AND session_date >= now64(3) - toIntervalDay({days:UInt32})
		`,
		query_params: { days, orgId: organizationId },
	});
}

async function waitForQueryLogRows(
	expectedRows: number,
): Promise<QueryLogRow[]> {
	for (let attempt = 0; attempt < QUERY_LOG_WAIT_ATTEMPTS; attempt += 1) {
		const rows = await executor.query<QueryLogRow>({
			clickhouse_settings: {
				max_execution_time: 10,
				max_rows_to_read: "100000",
			},
			query: `
				SELECT log_comment, memory_usage
				FROM system.query_log
				WHERE type = 'QueryFinish'
					AND startsWith(log_comment, {runPrefix:String})
				LIMIT {expectedRows:UInt32}
			`,
			query_params: { expectedRows, runPrefix },
		});
		if (rows.length >= expectedRows) return rows;
		await Bun.sleep(QUERY_LOG_WAIT_MS);
	}

	throw new Error(
		`ClickHouse query_log did not expose all ${expectedRows} benchmark measurements. The readonly benchmark identity needs SELECT on system.query_log.`,
	);
}

function percentile95(values: readonly number[]): number {
	if (values.length === 0) throw new Error("Cannot calculate p95 without data");
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.ceil(sorted.length * 0.95) - 1] as number;
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
	flag: string,
): number {
	const parsed = parseNonNegativeInteger(value, fallback, flag);
	if (parsed === 0) throw new Error(`${flag} must be a positive integer`);
	return parsed;
}

function parseNonNegativeInteger(
	value: string | undefined,
	fallback: number,
	flag: string,
): number {
	if (value === undefined) return fallback;
	if (value.trim() === "") {
		throw new Error(`${flag} must be a non-negative integer`);
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`${flag} must be a non-negative integer`);
	}
	return parsed;
}

function roundMilliseconds(value: number): number {
	return Number(value.toFixed(2));
}
