import * as p from "@clack/prompts";
import { buildCommand } from "@stricli/core";
import { createApiClient } from "../lib/api-client.js";
import { clearCredentials, loadCredentials } from "../lib/credentials.js";

async function runLogout(): Promise<void> {
	const credentials = loadCredentials();
	if (!credentials) {
		p.log.info("Not logged in.");
		return;
	}

	const client = createApiClient(credentials);
	try {
		await client.revokeCurrentCliCredential();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const isStaleCredential =
			message.includes("401") ||
			message.includes("403") ||
			message.includes("400") ||
			message.includes("UNAUTHORIZED") ||
			message.includes("FORBIDDEN") ||
			message.includes("BAD_REQUEST");

		if (!isStaleCredential) {
			p.log.error(
				"Failed to revoke the CLI credential on the server. Keeping local credentials in place.",
			);
			p.log.error(message);
			process.exitCode = 1;
			return;
		}
	}

	clearCredentials();
	p.log.success("Logged out successfully.");
}

export const logoutCommand = buildCommand({
	loader: async () => ({ default: runLogout }),
	parameters: {},
	docs: {
		brief: "Log out and remove stored credentials",
	},
});
