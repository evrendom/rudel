import * as p from "@clack/prompts";
import { buildCommand } from "@stricli/core";
import { createApiClient } from "../lib/api-client";
import { clearCredentials, loadCredentials } from "../lib/credentials";

async function runLogout(): Promise<void> {
	const credentials = loadCredentials();
	if (!credentials) {
		p.log.info("Not logged in.");
		return;
	}

	if (credentials.authType === "api-key") {
		try {
			const client = createApiClient(credentials);
			await client.cli.revokeToken();
		} catch {
			p.log.warn(
				"Failed to revoke token on server. Local credentials were cleared.",
			);
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
