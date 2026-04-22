#!/usr/bin/env node
import { run } from "@stricli/core";
import { app } from "../app";
import { loadCredentials } from "../lib/credentials";
import {
	CliProductAnalyticsEvents,
	captureCliProductAnalyticsEvent,
	consumeCliFirstRun,
	getBaseCliEventPayload,
	shutdownCliProductAnalytics,
} from "../lib/product-analytics";

function getTopLevelCommandName(args: string[]) {
	const commandName = args.find((arg) => !arg.startsWith("-"));
	switch (commandName) {
		case "login":
		case "logout":
		case "whoami":
		case "upload":
		case "enable":
		case "disable":
		case "set-org":
		case "hooks":
		case "dev":
			return commandName;
		default:
			return "help";
	}
}

const commandName = getTopLevelCommandName(process.argv.slice(2));
const { cliInstallationId, shouldTrack } = consumeCliFirstRun();

if (shouldTrack) {
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

try {
	await run(app, process.argv.slice(2), { process });
} finally {
	await shutdownCliProductAnalytics();
}
