import { join } from "node:path";
import { getFileSink } from "@logtape/file";
import { configure, dispose } from "@logtape/logtape";
import { ensurePrivateFile, getRudelConfigDir } from "./lib/local-state.js";

export async function setupHookLogging(): Promise<void> {
	const configDir = getRudelConfigDir();
	const logFile = join(configDir, "logs", "hook-upload.log");
	await ensurePrivateFile(logFile, configDir);

	await configure({
		sinks: {
			file: getFileSink(logFile),
		},
		loggers: [
			{
				category: ["rudel", "cli"],
				lowestLevel: "debug",
				sinks: ["file"],
			},
		],
	});
}

export { dispose as disposeLogging };
