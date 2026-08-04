import { parseArgs } from "node:util";
import { getClickhouse } from "../clickhouse.js";
import {
	compareUsageEventTotals,
	hasUsageEventCoverageGap,
} from "../services/usage-event-comparison.service.js";

const DEFAULT_MAX_SESSIONS = 2_000;
const DEFAULT_TOP_SESSIONS = 20;
const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		"max-sessions": { type: "string" },
		"organization-id": { type: "string" },
		"require-complete": { default: false, type: "boolean" },
		"top-sessions": { type: "string" },
	},
	strict: true,
});
const maxSessions = parsePositiveInteger(
	values["max-sessions"],
	DEFAULT_MAX_SESSIONS,
	"--max-sessions",
);
const topSessions = parsePositiveInteger(
	values["top-sessions"],
	DEFAULT_TOP_SESSIONS,
	"--top-sessions",
);
const executor = getClickhouse();

try {
	const comparison = await compareUsageEventTotals(executor, {
		maxSessions,
		organizationId: values["organization-id"],
		topSessions,
	});
	console.log(
		JSON.stringify(
			{
				authority: "regression_only_not_billing_truth",
				...comparison,
			},
			null,
			2,
		),
	);
	if (
		values["require-complete"] &&
		hasUsageEventCoverageGap(comparison.sources)
	) {
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
