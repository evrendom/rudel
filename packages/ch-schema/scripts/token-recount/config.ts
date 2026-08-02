import { resolve } from "node:path";
import type { ReadonlyClickHouseConnection } from "./http-client.js";

export type RecountTarget = "local" | "prod";

export interface RecountCliOptions {
	target: RecountTarget;
	organizationId: string;
	lookbackDays: number;
	sampleSizePerSource: number;
	findingCandidateCount: number;
	seed: number;
	anchorFile: string;
	outputDirectory: string;
	requireAnchors: boolean;
	requireZeroDiff: boolean;
	requireFeatureAnchors: boolean;
	expectedFindings: readonly string[];
}

export type ParseCliResult =
	| { kind: "help" }
	| { kind: "run"; options: RecountCliOptions };

interface Environment {
	[name: string]: string | undefined;
}

interface MutableOptions {
	target: RecountTarget;
	organizationId: string | undefined;
	lookbackDays: number;
	sampleSizePerSource: number;
	findingCandidateCount: number;
	seed: number;
	anchorFile: string;
	outputDirectory: string;
	requireAnchors: boolean;
	requireZeroDiff: boolean;
	requireFeatureAnchors: boolean;
	expectedFindings: string[];
}

export function parseCliArguments(
	args: readonly string[],
	repositoryRoot: string,
	env: Environment,
): ParseCliResult {
	const mutable: MutableOptions = {
		target: "local",
		organizationId: readNonEmpty(env.TOKEN_RECOUNT_ORGANIZATION_ID),
		lookbackDays: 30,
		sampleSizePerSource: 100,
		findingCandidateCount: 10,
		seed: 2_026_080_002,
		anchorFile: resolve(repositoryRoot, ".context/token-recount-anchors.json"),
		outputDirectory: resolve(repositoryRoot, ".context/reports/token-recount"),
		requireAnchors: false,
		requireZeroDiff: false,
		requireFeatureAnchors: false,
		expectedFindings: [],
	};

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--help" || argument === "-h") return { kind: "help" };
		if (argument === "--require-anchors") {
			mutable.requireAnchors = true;
			continue;
		}
		if (argument === "--require-zero-diff") {
			mutable.requireZeroDiff = true;
			continue;
		}
		if (argument === "--require-feature-anchors") {
			mutable.requireFeatureAnchors = true;
			continue;
		}
		const value = args[index + 1];
		if (!argument || !value) {
			throw new Error(`Missing value for ${argument ?? "argument"}.`);
		}
		index += 1;
		switch (argument) {
			case "--target":
				mutable.target = parseTarget(value);
				break;
			case "--organization-id":
				mutable.organizationId = requireNonEmpty(value, argument);
				break;
			case "--lookback-days":
				mutable.lookbackDays = parseInteger(value, argument, 1, 365);
				break;
			case "--sample-size":
				mutable.sampleSizePerSource = parseInteger(value, argument, 1, 500);
				break;
			case "--finding-candidates":
				mutable.findingCandidateCount = parseInteger(value, argument, 0, 50);
				break;
			case "--seed":
				mutable.seed = parseInteger(value, argument, 0, 4_294_967_295);
				break;
			case "--anchor-file":
				mutable.anchorFile = resolve(repositoryRoot, value);
				break;
			case "--output-dir":
				mutable.outputDirectory = resolve(repositoryRoot, value);
				break;
			case "--expect-findings":
				mutable.expectedFindings.push(...parseExpectedFindings(value));
				break;
			default:
				throw new Error(`Unknown argument: ${argument}`);
		}
	}

	if (!mutable.organizationId) {
		throw new Error(
			"--organization-id (the storage owner ID) or TOKEN_RECOUNT_ORGANIZATION_ID is required.",
		);
	}

	return {
		kind: "run",
		options: {
			target: mutable.target,
			organizationId: mutable.organizationId,
			lookbackDays: mutable.lookbackDays,
			sampleSizePerSource: mutable.sampleSizePerSource,
			findingCandidateCount: mutable.findingCandidateCount,
			seed: mutable.seed,
			anchorFile: mutable.anchorFile,
			outputDirectory: mutable.outputDirectory,
			requireAnchors: mutable.requireAnchors,
			requireZeroDiff: mutable.requireZeroDiff,
			requireFeatureAnchors: mutable.requireFeatureAnchors,
			expectedFindings: [...new Set(mutable.expectedFindings)],
		},
	};
}

export function resolveReadonlyConnection(
	target: RecountTarget,
	env: Environment,
): ReadonlyClickHouseConnection {
	return target === "prod"
		? resolveProductionConnection(env)
		: resolveLocalConnection(env);
}

export function usageText(): string {
	return [
		"Usage: bun run tokens:recount -- --organization-id <storage-owner-id> [options]",
		"",
		"Options:",
		"  --target <local|prod>        Connection profile (default: local)",
		"  --lookback-days <1..365>     Raw sampling window (default: 30)",
		"  --sample-size <1..500>       Random sessions per source (default: 100)",
		"  --finding-candidates <0..50> Extra capped/subagent candidates (default: 10)",
		"  --seed <integer>             Deterministic sample seed",
		"  --anchor-file <path>         Provider-dashboard anchor JSON",
		"  --require-anchors            Fail unless Claude + Codex anchors match",
		"  --require-zero-diff          Fail on any stored/recount token difference",
		"  --require-feature-anchors    Fail unless every billing feature has a passing anchor",
		"  --expect-findings <csv>      Fail unless findings are observed (H1,H2,M8,M9)",
		"  --output-dir <path>          Report destination under .context by default",
		"",
		"Production uses CLICKHOUSE_READONLY_URL, CLICKHOUSE_READONLY_USERNAME,",
		"and CLICKHOUSE_READONLY_PASSWORD. Remote URLs must be HTTPS and the",
		"default ClickHouse identity is forbidden.",
	].join("\n");
}

function resolveProductionConnection(
	env: Environment,
): ReadonlyClickHouseConnection {
	const url = requireEnvironmentVariable(env, "CLICKHOUSE_READONLY_URL");
	const username = requireEnvironmentVariable(
		env,
		"CLICKHOUSE_READONLY_USERNAME",
	);
	const password = requireEnvironmentVariable(
		env,
		"CLICKHOUSE_READONLY_PASSWORD",
	);
	const parsed = validateCredentialFreeUrl(url);
	if (parsed.protocol !== "https:") {
		throw new Error("Production ClickHouse recounts require an HTTPS URL.");
	}
	if (username === "default") {
		throw new Error(
			"The default ClickHouse identity is forbidden for production recounts.",
		);
	}
	return { url, username, password };
}

function resolveLocalConnection(
	env: Environment,
): ReadonlyClickHouseConnection {
	const url = readNonEmpty(env.CLICKHOUSE_URL) ?? "http://localhost:8123";
	const parsed = validateCredentialFreeUrl(url);
	if (!isLoopbackHostname(parsed.hostname)) {
		throw new Error(
			"The local recount target only accepts loopback ClickHouse endpoints.",
		);
	}
	const canonical = readNonEmpty(env.CLICKHOUSE_USERNAME);
	const legacy = readNonEmpty(env.CLICKHOUSE_USER);
	if (canonical && legacy && canonical !== legacy) {
		throw new Error(
			"CLICKHOUSE_USERNAME and CLICKHOUSE_USER disagree; keep one identity.",
		);
	}
	return {
		url,
		username: canonical ?? legacy ?? "default",
		password: readNonEmpty(env.CLICKHOUSE_PASSWORD) ?? "clickhouse",
	};
}

function parseTarget(value: string): RecountTarget {
	if (value === "local" || value === "prod") return value;
	throw new Error(`Unsupported target: ${value}`);
}

function parseExpectedFindings(value: string): string[] {
	const allowed = new Set([
		"H1",
		"H2",
		"M8",
		"M9",
		"M9_INTERLEAVED",
		"M9_FORK",
	]);
	const findings = value
		.split(",")
		.map((finding) => finding.trim().toUpperCase())
		.filter(Boolean);
	if (findings.length === 0) {
		throw new Error("--expect-findings requires at least one finding ID.");
	}
	for (const finding of findings) {
		if (!allowed.has(finding)) {
			throw new Error(`Unsupported finding ID: ${finding}`);
		}
	}
	return findings;
}

function parseInteger(
	value: string,
	name: string,
	minimum: number,
	maximum: number,
): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(
			`${name} must be an integer from ${minimum} to ${maximum}.`,
		);
	}
	return parsed;
}

function requireEnvironmentVariable(env: Environment, name: string): string {
	const value = readNonEmpty(env[name]);
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

function requireNonEmpty(value: string, name: string): string {
	const normalized = readNonEmpty(value);
	if (!normalized) throw new Error(`${name} cannot be empty.`);
	return normalized;
}

function readNonEmpty(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function validateCredentialFreeUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("ClickHouse URL is invalid.");
	}
	if (url.username || url.password) {
		throw new Error("ClickHouse URLs must not embed credentials.");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("ClickHouse URL must use HTTP or HTTPS.");
	}
	return url;
}

function isLoopbackHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "localhost" ||
		normalized === "127.0.0.1" ||
		normalized === "0.0.0.0" ||
		normalized === "::1" ||
		normalized === "[::1]" ||
		normalized === "host.docker.internal" ||
		normalized.endsWith(".localhost")
	);
}
