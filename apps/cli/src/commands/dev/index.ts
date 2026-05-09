import { buildRouteMap } from "@stricli/core";
import { listSessionsCommand } from "./list-sessions.js";

export const devRouteMap = buildRouteMap({
	routes: {
		"list-sessions": listSessionsCommand,
	},
	docs: {
		brief: "Development utilities for internal CLI work",
	},
});
