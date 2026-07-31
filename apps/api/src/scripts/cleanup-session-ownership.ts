import { parseArgs } from "node:util";
import { sqlClient } from "../db.js";
import {
	cleanupNonCanonicalSessionRows,
	previewNonCanonicalSessionCleanup,
} from "../services/session-ownership-cleanup.service.js";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		cutoff: { type: "string" },
		execute: { type: "boolean", default: false },
		"expected-row-count": { type: "string" },
	},
	strict: true,
});

if (values.execute && (!values.cutoff || !values["expected-row-count"])) {
	throw new Error(
		"Execution requires --cutoff and --expected-row-count from a prior preview.",
	);
}

const cutoff = values.cutoff ? new Date(values.cutoff) : new Date();
if (Number.isNaN(cutoff.getTime())) {
	throw new Error("--cutoff must be a valid ISO-8601 timestamp.");
}
if (cutoff.getTime() > Date.now()) {
	throw new Error("--cutoff cannot be in the future.");
}

const expectedRowCount = Number(values["expected-row-count"]);

try {
	const result = values.execute
		? await cleanupNonCanonicalSessionRows(cutoff, expectedRowCount)
		: await previewNonCanonicalSessionCleanup(cutoff);
	console.log(JSON.stringify(result, null, 2));
} finally {
	await sqlClient.end({ timeout: 5 });
}
