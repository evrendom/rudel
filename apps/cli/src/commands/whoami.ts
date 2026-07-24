import * as p from "@clack/prompts";
import { buildCommand } from "@stricli/core";
import { verifyAuth } from "../lib/auth.js";

async function runWhoami(): Promise<undefined | Error> {
	const result = await verifyAuth();
	if (!result.authenticated) {
		if (result.reason === "no_credentials") {
			p.log.info("Not logged in. Run `rudel login` to authenticate.");
			return;
		}
		return new Error(result.message);
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
