import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocalEngine } from "./ports/local-engine.js";
import { RudelDesktopApp } from "./RudelDesktopApp.js";

test("RudelDesktopApp renders the desktop shell navigation", () => {
	const markup = renderToStaticMarkup(
		<RudelDesktopApp localEngine={localEngine} />,
	);

	expect(markup).toContain("Repositories");
	expect(markup).toContain("Inventory");
	expect(markup).toContain("TypeScript Standards");
	expect(markup).toContain("Drift");
	expect(markup).toContain("Write Planner");
	expect(markup).toContain(
		"TypeScript owns drift classification. Rust owns local mechanics.",
	);
});

const localEngine: LocalEngine = {
	async scanMachine() {
		return {
			roots: [],
			repos: [],
			artifacts: [],
			warnings: [],
			skippedDirectoryCount: 0,
			scannedAt: "unix:1",
		};
	},
	async scanWorkspace(input) {
		return {
			rootPath: input.rootPath,
			roots: [],
			repos: [],
			artifacts: [],
			warnings: [],
			skippedDirectoryCount: 0,
			scannedAt: "unix:1",
		};
	},
	async readLockfiles() {
		return { repos: [] };
	},
	async hashFiles() {
		return { files: [] };
	},
	async normalizeGitRemotes() {
		return { repos: [] };
	},
	async createWritePlan(input) {
		return {
			id: "plan",
			repoId: input.repoId,
			blueprintId: "typescript-standards",
			files: [],
			undoAvailable: false,
			warnings: [],
		};
	},
	async applyWritePlan() {
		return { operationId: "operation", applied: true };
	},
	async getGitDiff(input) {
		return { repoPath: input.repoPath, diff: "" };
	},
};
