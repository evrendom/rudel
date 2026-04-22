import { buildRouteMap } from "@stricli/core";
import { listSessionsCommand } from "./list-sessions";

export const devRouteMap = buildRouteMap({
	routes: {
		"list-sessions": listSessionsCommand,
	},
	docs: {
		brief: "Development utilities (not available in published builds)",
	},
});
