import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getFileSink } from "@logtape/file";
import {
	configure,
	getConsoleSink,
	jsonLinesFormatter,
} from "@logtape/logtape";

const isProduction = !!process.env.FLY_APP_NAME;
const PROJECT_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../..",
);

function getLogFilePath(): string | null {
	const logDir = process.env.RUDEL_LOG_DIR;
	if (!logDir) {
		return null;
	}
	const day = new Date().toISOString().slice(0, 10);
	return resolve(PROJECT_ROOT, logDir, `api-logs-${day}.txt`);
}

export async function setupLogging(): Promise<void> {
	const logFile = getLogFilePath();

	const sinks: Record<string, ReturnType<typeof getConsoleSink>> = {
		console: getConsoleSink({
			formatter: isProduction ? jsonLinesFormatter : undefined,
		}),
	};

	const allSinks = ["console"];

	if (logFile) {
		await mkdir(dirname(logFile), { recursive: true }).catch(() => {});
		sinks.file = getFileSink(logFile);
		allSinks.push("file");
	}

	await configure({
		contextLocalStorage: new AsyncLocalStorage(),
		sinks,
		loggers: [
			{
				category: ["rudel", "api"],
				lowestLevel: isProduction ? "info" : "debug",
				sinks: allSinks,
			},
			{
				category: ["logtape", "meta"],
				lowestLevel: "warning",
				sinks: allSinks,
			},
		],
	});
}
