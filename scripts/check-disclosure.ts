#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

interface DisclosureRule {
	name: string;
	matches: (line: string) => boolean;
}

interface DisclosureFinding {
	source: string;
	line: number;
	rule: string;
}

interface PullRequestMetadata {
	title: string;
	body: string | null;
}

// The checker defines every blocked marker. CONTRIBUTING.md is the policy
// document and may quote a marker while explaining the boundary. Keep these
// explicit exclusions narrow and review additions as policy changes.
const TRACKED_FILE_EXCLUSIONS = new Set([
	// Generated third-party capture data contains serialized `c:\\` tokens that
	// are not filesystem paths. Product source and handwritten fixtures remain
	// subject to the Windows-path rule.
	"apps/marketing/__DO_NOT_MERGE__inspiration/lens-xyz/lens-build.capture.html",
	"scripts/check-disclosure.ts",
	"CONTRIBUTING.md",
]);

const DISCLOSURE_RULES: readonly DisclosureRule[] = [
	{
		name: "core-team-secret-injection",
		matches: (line) => line.includes("doppler run --project"),
	},
	{
		name: "production-config",
		matches: (line) =>
			line.includes("--config prd") || line.includes("--config=prd"),
	},
	{
		name: "local-production-config",
		matches: (line) => line.includes("prd_local"),
	},
	{
		name: "personal-home-path",
		matches: (line) =>
			line.includes("/Users/marc") || line.includes("/Users/evrendombak"),
	},
	{
		name: "windows-absolute-path",
		matches: (line) =>
			/[Cc]:[\\/]/.test(line) ||
			/\/c\/Users\//i.test(line) ||
			/\/mnt\/c\/Users\//i.test(line),
	},
	{
		name: "customer-ticket",
		matches: (line) => /NUM-[0-9]/.test(line),
	},
	{
		name: "unrelated-project-path",
		matches: (line) => line.includes("Trabajo"),
	},
	{
		name: "customer-name",
		matches: (line) => line.includes("Numia"),
	},
	{
		name: "shared-analytics-email",
		matches: (line) => line.includes("analytics-test@rudel.ai"),
	},
	{
		name: "shared-analytics-password",
		matches: (line) => line.includes("analytics-test-password"),
	},
	{
		name: "credential-in-url",
		matches: (line) =>
			/\b[a-z][a-z0-9+.-]*:\/\/\S*password=\$\{/i.test(line),
	},
	{
		name: "insecure-curl",
		matches: hasInsecureCurl,
	},
];

export function scanText(
	source: string,
	text: string,
): readonly DisclosureFinding[] {
	const findings: DisclosureFinding[] = [];
	const lines = text.split(/\r\n|\n|\r/);

	for (const [index, line] of lines.entries()) {
		for (const rule of DISCLOSURE_RULES) {
			if (rule.matches(line)) {
				findings.push({
					source,
					line: index + 1,
					rule: rule.name,
				});
			}
		}
	}

	return findings;
}

export function scanTrackedFiles(
	cwd = process.cwd(),
): readonly DisclosureFinding[] {
	const trackedFiles = runCommand("git", ["ls-files", "-z"], cwd)
		.split("\0")
		.filter((path) => path.length > 0);
	const findings: DisclosureFinding[] = [];

	for (const trackedFile of trackedFiles) {
		if (TRACKED_FILE_EXCLUSIONS.has(trackedFile)) {
			continue;
		}

		const absolutePath = resolve(cwd, trackedFile);
		if (!existsSync(absolutePath)) {
			continue;
		}

		const stat = lstatSync(absolutePath);
		if (stat.isSymbolicLink() || !stat.isFile()) {
			continue;
		}

		const bytes = readFileSync(absolutePath);
		if (bytes.includes(0)) {
			continue;
		}

		findings.push(...scanText(trackedFile, bytes.toString("utf8")));
	}

	return findings;
}

function scanCommitMessages(
	base: string,
	cwd = process.cwd(),
): readonly DisclosureFinding[] {
	const log = runCommand(
		"git",
		["log", "-z", "--format=%H%x00%B", `${base}..HEAD`],
		cwd,
	);
	const fields = log.split("\0");
	const findings: DisclosureFinding[] = [];

	for (let index = 0; index + 1 < fields.length; index += 2) {
		const commit = fields[index].trim();
		const message = fields[index + 1];
		if (commit.length > 0) {
			findings.push(...scanText(`commit:${commit}`, message));
		}
	}

	return findings;
}

function scanPullRequest(
	number: string,
	cwd = process.cwd(),
): readonly DisclosureFinding[] {
	const output = runCommand(
		"gh",
		["pr", "view", number, "--json", "title,body"],
		cwd,
	);
	const value: unknown = JSON.parse(output);
	if (!isPullRequestMetadata(value)) {
		throw new Error("Pull request metadata has an unexpected shape.");
	}

	return [
		...scanText("pull-request:title", value.title),
		...scanText("pull-request:body", value.body ?? ""),
	];
}

function runDisclosureCheck(
	argv: readonly string[],
	cwd = process.cwd(),
): number {
	let findings: readonly DisclosureFinding[];
	if (argv.length === 0) {
		findings = scanTrackedFiles(cwd);
	} else if (argv.length === 2 && argv[0] === "--commits") {
		findings = scanCommitMessages(argv[1], cwd);
	} else if (argv.length === 2 && argv[0] === "--pull-request") {
		findings = scanPullRequest(argv[1], cwd);
	} else {
		throw new Error(
			"Usage: check-disclosure.ts [--commits <base> | --pull-request <number>]",
		);
	}

	for (const finding of findings) {
		process.stderr.write(
			`${finding.source}:${finding.line} ${finding.rule}\n`,
		);
	}

	return findings.length > 0 ? 1 : 0;
}

function hasInsecureCurl(line: string): boolean {
	if (!line.includes("curl")) {
		return false;
	}

	let scanningCurlArguments = false;
	for (const rawToken of line.split(/\s+/)) {
		if (rawToken === "&&" || rawToken === "||" || rawToken === "|") {
			scanningCurlArguments = false;
			continue;
		}

		const token = rawToken
			.replace(/^[\\"'(`]+/, "")
			.replace(/[\\)\]}"'`,;]+$/, "");

		if (!scanningCurlArguments) {
			scanningCurlArguments =
				token === "curl" ||
				token.endsWith("/curl") ||
				token.endsWith('"curl') ||
				token.endsWith("'curl") ||
				token.endsWith("`curl");
			continue;
		}

		if (
			token === "--insecure" ||
			/^-[A-Za-z]*k[A-Za-z]*$/.test(token)
		) {
			return true;
		}

		if (rawToken.includes(";")) {
			scanningCurlArguments = false;
		}
	}

	return false;
}

function isPullRequestMetadata(value: unknown): value is PullRequestMetadata {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	return (
		"title" in value &&
		typeof value.title === "string" &&
		"body" in value &&
		(typeof value.body === "string" || value.body === null)
	);
}

function runCommand(
	command: string,
	args: readonly string[],
	cwd: string,
): string {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});

	if (result.error || result.status !== 0) {
		throw new Error(`Could not run ${command}.`);
	}

	return result.stdout;
}

if (import.meta.main) {
	try {
		process.exitCode = runDisclosureCheck(process.argv.slice(2));
	} catch {
		process.stderr.write("ERROR: disclosure check could not run.\n");
		process.exitCode = 2;
	}
}
