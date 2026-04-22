import * as p from "@clack/prompts";
import { buildCommand } from "@stricli/core";
import { verifyAuth } from "../lib/auth";

async function runWhoami(): Promise<void> {
	const result = await verifyAuth();
	if (!result.authenticated) {
		if (result.reason === "no_credentials") {
			p.log.info("Not logged in. Run `rudel login` to authenticate.");
		} else {
			p.log.error(result.message);
			process.exitCode = 1;
		}
		return;
	}

	p.log.info(`Logged in as ${result.user.name} (${result.user.email})`);
}

export const whoamiCommand = buildCommand({
	loader: async () => ({ default: runWhoami }),
	parameters: {},
	docs: {
		brief: "Show the currently authenticated user",
	},
});
