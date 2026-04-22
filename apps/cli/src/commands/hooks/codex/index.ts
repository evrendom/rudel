import { buildRouteMap } from "@stricli/core";
import { turnCompleteCommand } from "./turn-complete";

export const codexRouteMap = buildRouteMap({
	routes: {
		"turn-complete": turnCompleteCommand,
	},
	docs: {
		brief: "Codex hook handlers",
	},
});
