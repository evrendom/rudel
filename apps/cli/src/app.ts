import { buildApplication, buildRouteMap } from "@stricli/core";
import pkg from "../package.json" with { type: "json" };
import { devRouteMap } from "./commands/dev/index";
import { disableCommand } from "./commands/disable";
import { enableCommand } from "./commands/enable";
import { hooksRouteMap } from "./commands/hooks/index";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { setOrgCommand } from "./commands/set-org";
import { uploadCommand } from "./commands/upload";
import { whoamiCommand } from "./commands/whoami";

const routes = buildRouteMap({
	routes: {
		login: loginCommand,
		logout: logoutCommand,
		whoami: whoamiCommand,
		upload: uploadCommand,
		enable: enableCommand,
		disable: disableCommand,
		"set-org": setOrgCommand,
		hooks: hooksRouteMap,
		dev: devRouteMap,
	},
	docs: {
		brief: "CLI tools for managing Claude Code / Codex sessions",
		hideRoute: { hooks: true, dev: true },
	},
});

export const app = buildApplication(routes, {
	name: "rudel",
	versionInfo: {
		currentVersion: pkg.version,
	},
	scanner: {
		caseStyle: "allow-kebab-for-camel",
	},
});
