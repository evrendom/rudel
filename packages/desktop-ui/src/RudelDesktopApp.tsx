import type { LocalEngine } from "./ports/local-engine.js";

export type RudelDesktopAppProps = {
	localEngine: LocalEngine;
};

export function RudelDesktopApp(props: RudelDesktopAppProps) {
	return {
		product: "Rudel Desktop",
		focus: "Machine-Wide Skill Inventory",
		localEngine: props.localEngine,
		managedBlueprintSlug: "typescript-standards",
		primaryScreens: [
			"onboarding",
			"all-skills-inventory",
			"typescript-standards-focus",
			"repo-matrix",
			"drift-inbox",
			"write-planner",
		],
	};
}
