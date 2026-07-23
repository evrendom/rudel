#!/usr/bin/env bun
/**
 * Publish the Release Please-managed `rudel` CLI version to npm.
 *
 * Release Please owns version changes, changelog updates, Git tags, and
 * GitHub releases. This script only validates the release tag and publishes
 * the matching package version.
 *
 * Usage: bun run ./scripts/release-cli.ts [--dry-run]
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process, { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

interface ReleaseArgs {
	dryRun: boolean;
}

interface CommandResult {
	stdout: string;
	stderr: string;
}

interface PackageJson {
	name: string;
	version: string;
}

const CLI_DIR = resolve("apps/cli");
const CLI_PKG_PATH = resolve(CLI_DIR, "package.json");

export async function main(): Promise<void> {
	const args = parseReleaseArgs(process.argv.slice(2));

	logLine("Checking publish prerequisites...");
	ensureRequiredTools();
	ensureCleanWorkingTree();

	const pkg = readCliPackageJson();
	const releaseTag = validateReleaseTagAtHead(
		pkg.version,
		getReleaseTagsAtHead(),
	);
	ensureVersionIsUnpublished(pkg);

	logLine(`Release tag: ${releaseTag}`);
	logLine(`Package: ${pkg.name}@${pkg.version}`);

	if (args.dryRun) {
		logLine("Dry-run: release is ready to publish. No changes were made.");
		return;
	}

	ensureNpmAuth();
	runQualityGates();

	const otp = await promptForOtp();
	publishCli(pkg, otp);

	logLine(`Published ${pkg.name}@${pkg.version}`);
}

export function parseReleaseArgs(argv: readonly string[]): ReleaseArgs {
	let dryRun = false;

	for (const arg of argv) {
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		throw new Error(
			`Unknown argument: ${arg}. Usage: release-cli.ts [--dry-run]`,
		);
	}

	return { dryRun };
}

export function validateReleaseTagAtHead(
	version: string,
	tagsAtHead: readonly string[],
): string {
	const expectedTag = `rudel@${version}`;
	if (tagsAtHead.includes(expectedTag)) {
		return expectedTag;
	}

	const foundTags = tagsAtHead.length > 0 ? tagsAtHead.join(", ") : "none";
	throw new Error(
		`Release tag mismatch. Expected ${expectedTag} at HEAD; found: ${foundTags}.`,
	);
}

function ensureRequiredTools(): void {
	runCommand("bun", ["--version"]);
	runCommand("git", ["--version"]);
	runCommand("npm", ["--version"]);
}

function ensureCleanWorkingTree(): void {
	const result = runCommand("git", ["status", "--porcelain"]);
	if (result.stdout.trim().length > 0) {
		throw new Error("Working tree is not clean. Commit or stash changes first.");
	}
}

function readCliPackageJson(): PackageJson {
	const value: unknown = JSON.parse(readFileSync(CLI_PKG_PATH, "utf8"));
	if (!isPackageJson(value)) {
		throw new Error(`${CLI_PKG_PATH} must contain string name and version fields.`);
	}
	return value;
}

function isPackageJson(value: unknown): value is PackageJson {
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		typeof value.name === "string" &&
		"version" in value &&
		typeof value.version === "string"
	);
}

function getReleaseTagsAtHead(): string[] {
	const result = runCommand("git", [
		"tag",
		"--points-at",
		"HEAD",
		"--list",
		"rudel@*",
	]);
	return result.stdout
		.split(/\r?\n/)
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
}

function ensureVersionIsUnpublished(pkg: PackageJson): void {
	const result = spawnSync(
		"npm",
		["view", `${pkg.name}@${pkg.version}`, "version"],
		{
			encoding: "utf8",
			env: process.env,
		},
	);

	if (result.error) {
		throw result.error;
	}

	const publishedVersion = result.stdout?.trim() ?? "";
	if (result.status === 0) {
		if (publishedVersion !== pkg.version) {
			throw new Error(
				`Unexpected npm response for ${pkg.name}@${pkg.version}: ${publishedVersion}`,
			);
		}
		throw new Error(`${pkg.name}@${pkg.version} is already published on npm.`);
	}

	const stderrText = result.stderr ?? "";
	if (!stderrText.includes("E404")) {
		throw new Error(
			`Could not check npm for ${pkg.name}@${pkg.version}: ${stderrText.trim()}`,
		);
	}
}

function ensureNpmAuth(): void {
	runCommand("npm", ["whoami"]);
}

function runQualityGates(): void {
	logLine("Running quality gates (lint, typecheck, test, build)...");
	runCommand("bun", ["run", "verify"]);
}

function publishCli(pkg: PackageJson, otp: string): void {
	logLine(`Publishing ${pkg.name}@${pkg.version}...`);
	runCommand("bun", ["publish", "--access", "public", "--otp", otp], CLI_DIR);
}

async function promptForOtp(): Promise<string> {
	const rl = createInterface({ input: stdin, output: stdout });
	try {
		const otp = await rl.question("Enter npm OTP to publish: ");
		const trimmed = otp.trim();
		if (trimmed.length === 0) {
			throw new Error("No OTP provided. Publish cancelled.");
		}
		return trimmed;
	} finally {
		rl.close();
	}
}

function runCommand(
	command: string,
	args: readonly string[],
	cwd = process.cwd(),
): CommandResult {
	const rendered = `${command} ${args.map(shellQuote).join(" ")}`;
	logLine(`$ ${rendered}`);

	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: process.env,
	});

	if (result.error) {
		throw result.error;
	}

	const stdoutText = result.stdout ?? "";
	const stderrText = result.stderr ?? "";

	if (stdoutText.length > 0) {
		process.stdout.write(stdoutText);
	}
	if (stderrText.length > 0) {
		process.stderr.write(stderrText);
	}

	if (result.status !== 0) {
		throw new Error(`Command failed (${result.status}): ${rendered}`);
	}

	return { stdout: stdoutText, stderr: stderrText };
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_./:@*-]+$/.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function logLine(message: string): void {
	process.stdout.write(`${message}\n`);
}

function reportError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	logLine(`ERROR: ${message}`);
}

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		reportError(error);
		process.exitCode = 1;
	}
}
