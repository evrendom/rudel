import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const PACKAGE_MAP: Record<string, string> = {
	chkit: "cli",
	"@chkit/core": "core",
	"@chkit/clickhouse": "clickhouse",
	"@chkit/codegen": "codegen",
	"@chkit/plugin-backfill": "plugin-backfill",
	"@chkit/plugin-codegen": "plugin-codegen",
	"@chkit/plugin-obsessiondb": "plugin-obsessiondb",
	"@chkit/plugin-pull": "plugin-pull",
};

const ROOT = join(import.meta.dirname, "..");
const ROOT_PKG_PATH = join(ROOT, "package.json");
const CH_SCHEMA_PKG_PATH = join(ROOT, "packages/ch-schema/package.json");

const mode = process.argv[2];
if (mode !== "link" && mode !== "unlink") {
	console.error("Usage: bun scripts/chkit-link.ts <link|unlink>");
	process.exit(1);
}

const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, "utf-8"));

if (mode === "link") {
	const chkitPath = process.env.CHKIT_PATH?.trim();
	if (!chkitPath) {
		console.error(
			"CHKIT_PATH is required. Set it to the root of your local chkit checkout.",
		);
		process.exit(1);
	}

	for (const [pkg, dir] of Object.entries(PACKAGE_MAP)) {
		const absPath = join(chkitPath, "packages", dir);
		const relPath = relative(ROOT, absPath);
		rootPkg.overrides[pkg] = `file:${relPath}`;
	}

	writeFileSync(ROOT_PKG_PATH, `${JSON.stringify(rootPkg, null, "\t")}\n`);
	console.log("Linked chkit overrides to local paths:");
	for (const [pkg, val] of Object.entries(rootPkg.overrides)) {
		console.log(`  ${pkg}: ${val}`);
	}

	// Install pre-commit hook if not present
	const hookPath = join(ROOT, ".git/hooks/pre-commit");
	if (!existsSync(hookPath)) {
		writeFileSync(
			hookPath,
			'#!/bin/sh\nbun scripts/check-overrides.ts\n',
		);
		execSync(`chmod +x ${hookPath}`);
		console.log("Installed pre-commit hook");
	}

	execSync("bun install", { cwd: ROOT, stdio: "inherit" });
} else {
	const chSchemaPkg = JSON.parse(readFileSync(CH_SCHEMA_PKG_PATH, "utf-8"));
	const version = chSchemaPkg.dependencies.chkit;

	for (const pkg of Object.keys(PACKAGE_MAP)) {
		rootPkg.overrides[pkg] = version;
	}

	writeFileSync(ROOT_PKG_PATH, `${JSON.stringify(rootPkg, null, "\t")}\n`);
	console.log(`Restored chkit overrides to ${version}`);

	execSync("bun install", { cwd: ROOT, stdio: "inherit" });
}
