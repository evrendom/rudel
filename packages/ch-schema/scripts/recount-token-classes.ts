#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	buildSessionKey,
	recountClaudeSession,
	recountCodexSession,
} from "../src/token-recount/recount.js";
import {
	buildRecountReport,
	renderRecountReportMarkdown,
	type SessionMeasurementInput,
} from "../src/token-recount/report.js";
import { readProviderAnchors } from "./token-recount/anchors.js";
import {
	parseCliArguments,
	type RecountCliOptions,
	resolveReadonlyConnection,
	usageText,
} from "./token-recount/config.js";
import {
	fetchRawSessions,
	fetchStoredTokenRows,
	runClickHousePreflight,
	sampleSessionIdentities,
} from "./token-recount/data.js";

const REPOSITORY_ROOT = resolve(import.meta.dir, "..", "..", "..");

export async function runTokenRecount(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
	const parsed = parseCliArguments(args, REPOSITORY_ROOT, env);
	if (parsed.kind === "help") {
		process.stdout.write(`${usageText()}\n`);
		return 0;
	}

	const { options } = parsed;
	const anchors = await readProviderAnchors(
		options.anchorFile,
		options.requireAnchors || options.requireFeatureAnchors,
	);
	const connection = resolveReadonlyConnection(options.target, env);
	process.stderr.write(
		"Discovering ClickHouse schema and query estimates...\n",
	);
	const preflight = await runClickHousePreflight(options, connection);
	validatePreflight(preflight);

	process.stderr.write(
		"Selecting deterministic and finding-targeted sessions...\n",
	);
	const identities = await sampleSessionIdentities(
		options,
		anchors,
		connection,
	);
	process.stderr.write(
		`Fetching ${identities.length} latest raw transcript rows...\n`,
	);
	const rawSessions = await fetchRawSessions(
		identities,
		(completed, total) => {
			if (completed === total || completed % 10 === 0) {
				process.stderr.write(`Fetched ${completed}/${total} raw rows.\n`);
			}
		},
		connection,
	);
	const storedRows = await fetchStoredTokenRows(identities, connection);
	const measurements = buildMeasurements(rawSessions, storedRows);
	const report = buildRecountReport({
		generatedAt: new Date().toISOString(),
		target: options.target,
		organizationId: options.organizationId,
		lookbackDays: options.lookbackDays,
		sampleSizePerSource: options.sampleSizePerSource,
		measurements,
		anchors,
		preflight,
	});
	const paths = await writeReportArtifacts(report, options);
	printReportSummary(report, paths);

	const failures = evaluateGates(report, options);
	for (const failure of failures)
		process.stderr.write(`Gate failed: ${failure}\n`);
	return failures.length === 0 ? 0 : 1;
}

function buildMeasurements(
	rawSessions: Awaited<ReturnType<typeof fetchRawSessions>>,
	storedRows: Awaited<ReturnType<typeof fetchStoredTokenRows>>,
): SessionMeasurementInput[] {
	return rawSessions.map((raw) => {
		const recount =
			raw.source === "claude_code"
				? recountClaudeSession({
						content: raw.content,
						subagents: raw.subagents,
					})
				: recountCodexSession(raw.content);
		return {
			source: raw.source,
			organizationId: raw.organizationId,
			userId: raw.userId,
			sessionId: raw.sessionId,
			latestSessionDate: new Date(raw.latestSessionDateMs).toISOString(),
			sampleReasons: raw.sampleReasons,
			recount,
			stored: storedRows.get(buildSessionKey(raw)),
		};
	});
}

async function writeReportArtifacts(
	report: ReturnType<typeof buildRecountReport>,
	options: RecountCliOptions,
): Promise<{
	json: string;
	markdown: string;
	latestJson: string;
	latestMarkdown: string;
}> {
	await mkdir(options.outputDirectory, { recursive: true });
	const stamp = report.generatedAt.replaceAll(/[:.]/gu, "-");
	const base = `token-recount-${options.target}-${stamp}`;
	const paths = {
		json: resolve(options.outputDirectory, `${base}.json`),
		markdown: resolve(options.outputDirectory, `${base}.md`),
		latestJson: resolve(
			options.outputDirectory,
			`latest-${options.target}.json`,
		),
		latestMarkdown: resolve(
			options.outputDirectory,
			`latest-${options.target}.md`,
		),
	};
	const json = `${JSON.stringify(report, null, 2)}\n`;
	const markdown = `${renderRecountReportMarkdown(report)}\n`;
	await Promise.all([
		writeFile(paths.json, json, "utf8"),
		writeFile(paths.markdown, markdown, "utf8"),
		writeFile(paths.latestJson, json, "utf8"),
		writeFile(paths.latestMarkdown, markdown, "utf8"),
	]);
	return paths;
}

function printReportSummary(
	report: ReturnType<typeof buildRecountReport>,
	paths: { json: string; markdown: string },
): void {
	process.stdout.write(
		`${[
			`Measured ${report.aggregate.sessionsMeasured} sessions.`,
			`Overall absolute error: ${formatPercent(report.aggregate.overallAbsoluteErrorPercent)}.`,
			`Provider anchors passed: ${report.anchorSummary.passed}/${report.anchorSummary.configured}.`,
			`JSON: ${relative(REPOSITORY_ROOT, paths.json)}`,
			`Markdown: ${relative(REPOSITORY_ROOT, paths.markdown)}`,
		].join("\n")}\n`,
	);
}

export function evaluateGates(
	report: ReturnType<typeof buildRecountReport>,
	options: RecountCliOptions,
): string[] {
	const failures: string[] = [];
	if (report.aggregate.sessionsMeasured === 0) {
		failures.push("no raw sessions were measured");
	}
	if (options.requireAnchors && !report.anchorSummary.acceptanceReady) {
		failures.push(
			"provider anchors are not acceptance-ready (need exact Claude + Codex matches)",
		);
	}
	if (
		options.requireZeroDiff &&
		(report.aggregate.missingAnalyticsRows > 0 ||
			report.aggregate.invariantViolations > 0 ||
			report.sessions.some((session) => session.absoluteErrorTokens > 0))
	) {
		failures.push(
			"stored analytics differ from the independent recount or violate token invariants",
		);
	}
	if (
		options.requireFeatureAnchors &&
		report.anchorSummary.missingRequiredFeatures.length > 0
	) {
		failures.push(
			`provider anchors are missing billing features: ${report.anchorSummary.missingRequiredFeatures.join(", ")}`,
		);
	}
	for (const expected of options.expectedFindings) {
		if (!isFindingObserved(expected, report.findings)) {
			failures.push(`${expected} was not observed in this sample`);
		}
	}
	return failures;
}

function isFindingObserved(
	expected: string,
	findings: ReturnType<typeof buildRecountReport>["findings"],
): boolean {
	if (expected === "M9") {
		return findings.some(
			(finding) =>
				(finding.id === "M9_INTERLEAVED" || finding.id === "M9_FORK") &&
				finding.state === "gap_observed",
		);
	}
	return findings.some(
		(finding) => finding.id === expected && finding.state === "gap_observed",
	);
}

function validatePreflight(
	preflight: Awaited<ReturnType<typeof runClickHousePreflight>>,
): void {
	if (!preflight.databasePresent) {
		throw new Error("The rudel ClickHouse database is missing.");
	}
	if (preflight.tables.length !== 3) {
		throw new Error("One or more required ClickHouse tables are missing.");
	}
	if (!preflight.requiredColumnsPresent) {
		throw new Error(
			`Required ClickHouse columns are missing: ${preflight.missingColumns.join(", ")}`,
		);
	}
}

function formatPercent(value: number | undefined): string {
	return value === undefined ? "—" : `${value.toFixed(4)}%`;
}

async function main(): Promise<void> {
	try {
		process.exitCode = await runTokenRecount(
			process.argv.slice(2),
			process.env,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Token recount failed: ${message}\n`);
		process.exitCode = 1;
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await main();
}
