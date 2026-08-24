import * as p from "@clack/prompts";
import { buildCommand } from "@stricli/core";
import { describeSavedCredentialsApiBaseRisk } from "../lib/api-base.js";
import { verifyAuth } from "../lib/auth.js";
import { loadFailedUploads } from "../lib/failed-uploads.js";

async function runWhoami(): Promise<undefined | Error> {
	const failedUploads = await loadFailedUploads();
	if (failedUploads.length > 0) {
		const retryable = failedUploads.filter(
			(failure) => failure.status === "retryable",
		).length;
		const permanent = failedUploads.length - retryable;
		p.log.warn(
			`Local upload status: ${retryable} retryable failure(s), ${permanent} permanent failure(s). Run \`opaline upload --retry\` for details.`,
		);
	}

	// Before verifyAuth, which sends the stored token to the stored base.
	const storedApiBaseRisk = describeSavedCredentialsApiBaseRisk();
	if (storedApiBaseRisk) {
		p.log.warn(storedApiBaseRisk);
	}

	const result = await verifyAuth();
	if (!result.authenticated) {
		if (result.reason === "no_credentials") {
			p.log.info("Not logged in. Run `opaline login` to authenticate.");
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
