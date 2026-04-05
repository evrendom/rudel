import { buildApplication, buildRouteMap } from "@stricli/core";
import pkg from "../package.json" with { type: "json" };
import { devRouteMap } from "./commands/dev/index.js";
import { disableCommand } from "./commands/disable.js";
import { enableCommand } from "./commands/enable.js";
import { hooksRouteMap } from "./commands/hooks/index.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { setOrgCommand } from "./commands/set-org.js";
import { uploadCommand } from "./commands/upload.js";
import { whoamiCommand } from "./commands/whoami.js";

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
		brief: "CLI tools for managing Claude Code sessions",
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
