import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RudelDesktopAppProps } from "./RudelDesktopApp.js";
import { RudelDesktopApp } from "./RudelDesktopApp.js";

test("RudelDesktopApp renders only the repository gallery surface", () => {
	const markup = renderToStaticMarkup(
		<RudelDesktopApp
			localEngine={localEngine}
			pickWorkspaceRoots={async () => []}
		/>,
	);

	expect(markup).toContain("Repository Gallery");
	expect(markup).toContain("Code repos on this machine");
	expect(markup).toContain("Scan repos");
	expect(markup).toContain("Choose folder");
	expect(markup).toContain("Choose roots to scan");
	expect(markup).not.toContain("Inventory");
	expect(markup).not.toContain("TypeScript Standards");
	expect(markup).not.toContain("Drift");
	expect(markup).not.toContain("Write Planner");
	expect(markup).not.toContain("Agent skill folders");
	expect(markup).not.toContain("Selected files");
});

const localEngine: RudelDesktopAppProps["localEngine"] = {
	async suggestScanRoots() {
		return { suggestions: [] };
	},
	async scanMachine() {
		return {
			roots: [],
			repos: [],
			candidates: [],
			artifacts: [],
			warnings: [],
			skippedDirectoryCount: 0,
			scannedAt: "unix:1",
		};
	},
};
