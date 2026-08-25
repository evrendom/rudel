import { run } from "@stricli/core";
import pkg from "../package.json" with { type: "json" };
import { app } from "./app.js";
import { loadCredentials } from "./lib/credentials.js";
import { debugLog } from "./lib/debug.js";
import {
	CliProductAnalyticsEvents,
	captureCliProductAnalyticsEvent,
	consumeCliFirstRun,
	getBaseCliEventPayload,
	shutdownCliProductAnalytics,
} from "./lib/product-analytics.js";

export async function runCli(
	args: readonly string[] = process.argv.slice(2),
): Promise<void> {
	const commandName = getTopLevelCommandName(args);
	debugLog("starting command", { command: commandName, version: pkg.version });
	if (commandName !== "doctor") {
		trackFirstRun(commandName);
	}

	try {
		await run(app, args, { process });
	} finally {
		await shutdownCliProductAnalytics();
		debugLog("command finished", {
			command: commandName,
			exitCode: process.exitCode ?? 0,
		});
	}
}

function getTopLevelCommandName(args: readonly string[]) {
	const commandName = args.find((argument) => !argument.startsWith("-"));
	switch (commandName) {
		case "login":
		case "logout":
		case "whoami":
		case "upload":
		case "enable":
		case "disable":
		case "set-org":
		case "doctor":
		case "hooks":
		case "dev":
			return commandName;
		default:
			return "help";
	}
}

function trackFirstRun(commandName: ReturnType<typeof getTopLevelCommandName>) {
	const { cliInstallationId, shouldTrack } = consumeCliFirstRun();
	if (!shouldTrack) return;

	captureCliProductAnalyticsEvent({
		distinctId: cliInstallationId,
		event: CliProductAnalyticsEvents.CLI_FIRST_RUN,
		surface: "cli",
		disablePersonProfile: true,
		payload: {
			cli_installation_id: cliInstallationId,
			command_name: commandName,
			is_authenticated: loadCredentials() !== null,
			...getBaseCliEventPayload(),
		},
	});
}
