import { buildCommand } from "@stricli/core";
import { readConfig } from "../lib/config";

async function runConfigShow(): Promise<void> {
	const config = await readConfig();
	process.stdout.write(`${JSON.stringify(config, null, "\t")}\n`);
}

export const configShowCommand = buildCommand({
	loader: async () => ({ default: runConfigShow }),
	parameters: {},
	docs: {
		brief: "Display current configuration",
	},
});
