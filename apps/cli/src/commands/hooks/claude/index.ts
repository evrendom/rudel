import { buildRouteMap } from "@stricli/core";
import { sessionEndCommand } from "./session-end";

export const claudeRouteMap = buildRouteMap({
	routes: {
		"session-end": sessionEndCommand,
	},
	docs: {
		brief: "Claude Code hook handlers",
	},
});
