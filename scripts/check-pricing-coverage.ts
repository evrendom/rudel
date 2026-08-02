#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSessionEstimatedCostSql } from "../packages/api-routes/src/model-pricing.js";
import { resolveReadonlyConnection } from "../packages/ch-schema/scripts/token-recount/config.js";
import { queryClickHouse } from "../packages/ch-schema/scripts/token-recount/http-client.js";

export interface PricingCoverageRow {
	date: string;
	model: string;
	organizationId: string;
	totalTokens: number;
	unpricedTokens: number;
}

interface PricingCoverageOptions {
	allowedUnresolvedModels: ReadonlySet<string>;
	lookbackDays: number;
	outputPath: string;
	target: "local" | "prod";
}

export interface PricingCoverageReport {
	generatedAt: string;
	lookbackDays: number;
	newUnresolvedModels: readonly string[];
	organizations: readonly {
		organizationFingerprint: string;
		pricedTokenPercent: number | null;
		totalTokens: number;
		unpricedTokens: number;
	}[];
	unresolvedByDay: readonly {
		date: string;
		model: string;
		organizationFingerprint: string;
		unpricedTokens: number;
	}[];
}

const REPOSITORY_ROOT = resolve(import.meta.dir, "..");

export async function runPricingCoverageCheck(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
) {
	const options = parseOptions(args, env);
	const connection = resolveReadonlyConnection(options.target, env);
	const rows = await queryClickHouse(
		buildCoverageQuery(),
		{ lookbackDays: options.lookbackDays },
		decodeCoverageRow,
		{
			maxExecutionSeconds: 30,
			maxResultBytes: 8 * 1024 * 1024,
			maxResultRows: 20_000,
		},
		connection,
	);
	const report = buildPricingCoverageReport({
		allowedUnresolvedModels: options.allowedUnresolvedModels,
		generatedAt: new Date().toISOString(),
		lookbackDays: options.lookbackDays,
		rows,
	});
	await mkdir(dirname(options.outputPath), { recursive: true });
	await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
	printReport(report, options.outputPath);
	return report.newUnresolvedModels.length === 0 ? 0 : 1;
}

export function buildPricingCoverageReport(input: {
	allowedUnresolvedModels: ReadonlySet<string>;
	generatedAt: string;
	lookbackDays: number;
	rows: readonly PricingCoverageRow[];
}): PricingCoverageReport {
	const totalsByOrg = new Map<
		string,
		{ totalTokens: number; unpricedTokens: number }
	>();
	const unresolvedModels = new Set<string>();
	const unresolvedByDay: PricingCoverageReport["unresolvedByDay"] = [];

	for (const row of input.rows) {
		const totals = totalsByOrg.get(row.organizationId) ?? {
			totalTokens: 0,
			unpricedTokens: 0,
		};
		totals.totalTokens += row.totalTokens;
		totals.unpricedTokens += row.unpricedTokens;
		totalsByOrg.set(row.organizationId, totals);

		if (row.unpricedTokens > 0) {
			unresolvedModels.add(row.model);
			unresolvedByDay.push({
				date: row.date,
				model: row.model,
				organizationFingerprint: fingerprintOrganization(row.organizationId),
				unpricedTokens: row.unpricedTokens,
			});
		}
	}

	return {
		generatedAt: input.generatedAt,
		lookbackDays: input.lookbackDays,
		newUnresolvedModels: [...unresolvedModels]
			.filter((model) => !input.allowedUnresolvedModels.has(model))
			.sort(),
		organizations: [...totalsByOrg.entries()]
			.map(([organizationId, totals]) => ({
				organizationFingerprint: fingerprintOrganization(organizationId),
				pricedTokenPercent:
					totals.totalTokens > 0
						? roundPercent(
								((totals.totalTokens - totals.unpricedTokens) /
									totals.totalTokens) *
									100,
							)
						: null,
				totalTokens: totals.totalTokens,
				unpricedTokens: totals.unpricedTokens,
			}))
			.sort((left, right) =>
				left.organizationFingerprint.localeCompare(
					right.organizationFingerprint,
				),
			),
		unresolvedByDay: [...unresolvedByDay].sort(
			(left, right) =>
				right.unpricedTokens - left.unpricedTokens ||
				left.date.localeCompare(right.date) ||
				left.model.localeCompare(right.model),
		),
	};
}

function buildCoverageQuery() {
	return `
		SELECT
			organization_id AS organization_id,
			toString(toDate(session_date)) AS date,
			if(model_used = '', 'unknown', model_used) AS model,
			sum(ifNull(total_tokens, 0)) AS total_tokens,
			sumIf(ifNull(total_tokens, 0), isNull(estimated_cost)) AS unpriced_tokens
		FROM (
			SELECT
				sa.*,
				${buildSessionEstimatedCostSql("sa")} AS estimated_cost
			FROM rudel.session_analytics AS sa FINAL
			WHERE sa.session_date >= now64(3) - toIntervalDay({lookbackDays:UInt32})
				AND sa.session_date <= now64(3)
		) AS priced
		GROUP BY organization_id, date, model
		ORDER BY date ASC, unpriced_tokens DESC, model ASC
	`;
}

function decodeCoverageRow(value: unknown): PricingCoverageRow {
	if (!value || typeof value !== "object") {
		throw new Error("Pricing coverage query returned a non-object row.");
	}
	const row = value as Record<string, unknown>;
	return {
		date: requireString(row.date, "date"),
		model: requireString(row.model, "model"),
		organizationId: requireString(row.organization_id, "organization_id"),
		totalTokens: requireNonNegativeNumber(row.total_tokens, "total_tokens"),
		unpricedTokens: requireNonNegativeNumber(
			row.unpriced_tokens,
			"unpriced_tokens",
		),
	};
}

function parseOptions(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
): PricingCoverageOptions {
	let target: PricingCoverageOptions["target"] = "prod";
	let lookbackDays = 1;
	let outputPath = resolve(
		REPOSITORY_ROOT,
		".context/reports/pricing-coverage/latest-prod.json",
	);

	for (let index = 0; index < args.length; index += 2) {
		const name = args[index];
		const value = args[index + 1];
		if (!name || !value) throw new Error(`Missing value for ${name ?? "option"}.`);
		if (name === "--target" && (value === "local" || value === "prod")) {
			target = value;
			continue;
		}
		if (name === "--lookback-days") {
			lookbackDays = parseBoundedInteger(value, name, 1, 31);
			continue;
		}
		if (name === "--output") {
			outputPath = resolve(REPOSITORY_ROOT, value);
			continue;
		}
		throw new Error(`Unknown option: ${name}`);
	}

	return {
		allowedUnresolvedModels: new Set(
			(env.PRICING_ALLOWED_UNRESOLVED_MODELS ?? "")
				.split(",")
				.map((model) => model.trim())
				.filter(Boolean),
		),
		lookbackDays,
		outputPath,
		target,
	};
}

function printReport(report: PricingCoverageReport, outputPath: string) {
	for (const organization of report.organizations) {
		process.stdout.write(
			`${organization.organizationFingerprint}: ${organization.pricedTokenPercent ?? "—"}% of tokens priced\n`,
		);
	}
	for (const model of report.newUnresolvedModels) {
		process.stderr.write(`::error title=Unresolved model pricing::${model}\n`);
	}
	process.stdout.write(`Report: ${outputPath}\n`);
}

function fingerprintOrganization(organizationId: string) {
	return createHash("sha256").update(organizationId).digest("hex").slice(0, 12);
}

function roundPercent(value: number) {
	return Math.round(value * 100) / 100;
}

function requireString(value: unknown, field: string) {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Invalid ${field} in pricing coverage row.`);
	}
	return value;
}

function requireNonNegativeNumber(value: unknown, field: string) {
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0) {
		throw new Error(`Invalid ${field} in pricing coverage row.`);
	}
	return number;
}

function parseBoundedInteger(
	value: string,
	name: string,
	minimum: number,
	maximum: number,
) {
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
		throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
	}
	return number;
}

async function main() {
	try {
		process.exitCode = await runPricingCoverageCheck(
			process.argv.slice(2),
			process.env,
		);
	} catch (error) {
		process.stderr.write(
			`Pricing coverage check failed: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await main();
}
