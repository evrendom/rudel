import { parseArgs } from "node:util";
import { sqlClient } from "../db.js";
import {
	backfillSessionOwnership,
	previewSessionOwnershipCutover,
} from "../services/session-ownership-backfill.service.js";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		cutoff: { type: "string" },
		execute: { type: "boolean", default: false },
	},
	strict: true,
});

if (values.execute && !values.cutoff) {
	throw new Error(
		"Execution requires the exact --cutoff value printed by a prior preview.",
	);
}

const cutoff = values.cutoff ? new Date(values.cutoff) : new Date();
if (Number.isNaN(cutoff.getTime())) {
	throw new Error("--cutoff must be a valid ISO-8601 timestamp.");
}
if (cutoff.getTime() > Date.now()) {
	throw new Error("--cutoff cannot be in the future.");
}

try {
	const result = values.execute
		? await backfillSessionOwnership(cutoff)
		: await previewSessionOwnershipCutover(cutoff);
	console.log(JSON.stringify(result, null, 2));
} finally {
	await sqlClient.end({ timeout: 5 });
}
