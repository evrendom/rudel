import type { LocalEngine } from "./ports/local-engine.js";

export type RudelDesktopAppProps = {
	localEngine: LocalEngine;
};

export function RudelDesktopApp(props: RudelDesktopAppProps) {
	return {
		product: "Rudel Desktop",
		focus: "Skill Blueprints",
		localEngine: props.localEngine,
		primaryScreens: [
			"blueprint-library",
			"blueprint-editor",
			"repo-matrix",
			"drift-inbox",
			"install-planner",
		],
	};
}
