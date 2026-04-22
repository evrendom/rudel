import { buildRouteMap } from "@stricli/core";
import { claudeRouteMap } from "./claude/index";
import { codexRouteMap } from "./codex/index";

export const hooksRouteMap = buildRouteMap({
	routes: {
		claude: claudeRouteMap,
		codex: codexRouteMap,
	},
	docs: {
		brief: "Hook handlers",
	},
});
