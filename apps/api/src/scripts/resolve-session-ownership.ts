import { parseArgs } from "node:util";
import { sqlClient } from "../db.js";
import { resolveSessionOwnershipConflict } from "../services/session-ownership-backfill.service.js";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		"organization-id": { type: "string" },
		"session-id": { type: "string" },
		"user-id": { type: "string" },
	},
	strict: true,
});

const organizationId = values["organization-id"];
const sessionId = values["session-id"];
const userId = values["user-id"];
if (!organizationId || !sessionId || !userId) {
	throw new Error(
		"Required options: --organization-id, --session-id, and --user-id",
	);
}

try {
	await resolveSessionOwnershipConflict({
		organizationId,
		sessionId,
		userId,
	});
	console.log("The session owner was registered.");
} finally {
	await sqlClient.end({ timeout: 5 });
}
