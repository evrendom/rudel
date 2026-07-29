import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scanText, scanTrackedFiles } from "./check-disclosure.js";

interface CheckerResult {
	status: number | null;
	output: string;
}

const CHECKER_PATH = resolve(import.meta.dir, "check-disclosure.ts");
const BLOCKED_CASES: readonly (readonly [string, string])[] = [
	["space-separated production config", ["--config", " prd"].join("")],
	["equals-separated production config", ["--config", "=prd"].join("")],
	["single short unsafe flag", ["curl ", "-k"].join("")],
	["prefixed short unsafe flag", ["curl ", "-sk"].join("")],
	["suffixed short unsafe flag", ["curl ", "-ks"].join("")],
	["long unsafe flag", ["curl ", "--insecure"].join("")],
	["POSIX-mounted Windows home", ["/c/", "Users/x"].join("")],
	["unsafe flag in JSON", ['{"command":"curl ', '-k"}'].join("")],
];

test.each(BLOCKED_CASES)("%s is rejected", (_label, content) => {
	const findings = scanText("fixture.txt", content);

	expect(findings).toHaveLength(1);
});

test("ordinary silent curl remains allowed", () => {
	const content = ["curl ", "-s"].join("");

	expect(scanText("fixture.txt", content)).toEqual([]);
});

test("tracked symlinks are skipped", () => {
	const directory = createRepository();
	const blockedContent = ["--config", "=prd"].join("");
	writeFileSync(join(directory, "untracked-target.txt"), blockedContent);
	symlinkSync("untracked-target.txt", join(directory, "tracked-link.txt"));
	track(directory, "tracked-link.txt");

	expect(scanTrackedFiles(directory)).toEqual([]);
	rmSync(directory, { recursive: true, force: true });
});

test("tracked binary files are skipped", () => {
	const directory = createRepository();
	const blockedContent = Buffer.from(["--config", "=prd"].join(""));
	const binaryContent = Buffer.concat([blockedContent, Buffer.from([0])]);
	writeFileSync(join(directory, "fixture.bin"), binaryContent);
	track(directory, "fixture.bin");

	expect(scanTrackedFiles(directory)).toEqual([]);
	rmSync(directory, { recursive: true, force: true });
});

test("CRLF files report the correct line without disclosing content", () => {
	const directory = createRepository();
	const blockedContent = ["--config", "=prd"].join("");
	writeFileSync(
		join(directory, "windows.txt"),
		["safe", blockedContent, "safe"].join("\r\n"),
	);
	track(directory, "windows.txt");

	const result = runChecker(directory);

	expect(result.status).toBe(1);
	expect(result.output).toContain("windows.txt:2 production-config");
	expect(result.output).not.toContain(blockedContent);
	rmSync(directory, { recursive: true, force: true });
});

test("the command fails on a tracked disclosure and prints only its location and rule", () => {
	const directory = createRepository();
	const blockedContent = ["--config", "=prd"].join("");
	writeFileSync(join(directory, "tracked.txt"), blockedContent);
	track(directory, "tracked.txt");

	const result = runChecker(directory);

	expect(result.status).toBe(1);
	expect(result.output).toContain("tracked.txt:1 production-config");
	expect(result.output).not.toContain(blockedContent);
	rmSync(directory, { recursive: true, force: true });
});

test("commit-message scanning uses the same redacted findings", () => {
	const directory = createRepository();
	configureCommitter(directory);
	writeFileSync(join(directory, "tracked.txt"), "safe");
	track(directory, "tracked.txt");
	execFileSync("git", ["commit", "--quiet", "--message", "baseline"], {
		cwd: directory,
	});
	const blockedContent = ["curl ", "-sk"].join("");
	execFileSync(
		"git",
		["commit", "--quiet", "--allow-empty", "--message", blockedContent],
		{ cwd: directory },
	);

	const result = runChecker(directory, ["--commits", "HEAD^"]);

	expect(result.status).toBe(1);
	expect(result.output).toContain("insecure-curl");
	expect(result.output).not.toContain(blockedContent);
	rmSync(directory, { recursive: true, force: true });
});

function createRepository(): string {
	const directory = mkdtempSync(join(tmpdir(), "check-disclosure-"));
	execFileSync("git", ["init", "--quiet"], { cwd: directory });
	return directory;
}

function configureCommitter(directory: string): void {
	execFileSync("git", ["config", "user.name", "Disclosure Test"], {
		cwd: directory,
	});
	execFileSync("git", ["config", "user.email", "disclosure@example.test"], {
		cwd: directory,
	});
}

function track(directory: string, path: string): void {
	execFileSync("git", ["add", "--", path], { cwd: directory });
}

function runChecker(
	directory: string,
	args: readonly string[] = [],
): CheckerResult {
	const result = spawnSync("bun", [CHECKER_PATH, ...args], {
		cwd: directory,
		encoding: "utf8",
	});
	if (result.error) {
		throw result.error;
	}

	return {
		status: result.status,
		output: `${result.stdout}${result.stderr}`,
	};
}
