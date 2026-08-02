#!/usr/bin/env bun
import { pathToFileURL } from "node:url";
import type { ModelRateCardEntry } from "../packages/api-routes/src/model-rate-card.js";
import { getModelPricingCatalog } from "../packages/api-routes/src/model-pricing.js";

export interface PricingDriftResult {
	checkedSources: number;
	issues: readonly string[];
	warnings: readonly string[];
}

interface PricingDriftOptions {
	entries?: readonly ModelRateCardEntry[];
	fetchImpl?: typeof fetch;
	now?: Date;
	staleAfterDays?: number;
}

export async function checkModelPricingDrift(
	options: PricingDriftOptions = {},
): Promise<PricingDriftResult> {
	const entries = options.entries ?? getModelPricingCatalog();
	const fetchImpl = options.fetchImpl ?? fetch;
	const now = options.now ?? new Date();
	const staleAfterDays = options.staleAfterDays ?? 60;
	const warnings = buildStalenessWarnings(entries, now, staleAfterDays);
	const entriesBySource = groupEntriesBySource(entries);
	const sourceResults = await Promise.all(
		[...entriesBySource.entries()].map(async ([source, sourceEntries]) => {
			try {
				const response = await fetchImpl(source, {
					headers: {
						Accept: "text/html,application/xhtml+xml,text/plain",
						"User-Agent": "rudel-model-pricing-drift-watch/1.0",
					},
					redirect: "follow",
				});
				if (!response.ok) {
					return [`${source} returned HTTP ${response.status}.`];
				}
				const pageText = normalizePageText(await response.text());
				return getSourceRates(sourceEntries)
					.filter((rate) => !containsPublishedRate(pageText, rate))
					.map(
						(rate) =>
							`${source} no longer exposes configured rate $${rate}/MTok.`,
					);
			} catch (error) {
				return [
					`${source} could not be checked: ${error instanceof Error ? error.message : String(error)}.`,
				];
			}
		}),
	);

	return {
		checkedSources: entriesBySource.size,
		issues: sourceResults.flat().sort(),
		warnings,
	};
}

function buildStalenessWarnings(
	entries: readonly ModelRateCardEntry[],
	now: Date,
	staleAfterDays: number,
) {
	const warnings = new Set<string>();
	for (const entry of entries) {
		const verifiedAt = new Date(`${entry.verifiedAt}T00:00:00.000Z`);
		const ageDays = Math.floor(
			(now.getTime() - verifiedAt.getTime()) / 86_400_000,
		);
		if (!Number.isFinite(ageDays) || ageDays <= staleAfterDays) {
			continue;
		}
		warnings.add(
			`${entry.model} (${entry.contextBand}) pricing was last verified ${ageDays} days ago on ${entry.verifiedAt}.`,
		);
	}
	return [...warnings].sort();
}

function groupEntriesBySource(entries: readonly ModelRateCardEntry[]) {
	const grouped = new Map<string, ModelRateCardEntry[]>();
	for (const entry of entries) {
		const rows = grouped.get(entry.source) ?? [];
		rows.push(entry);
		grouped.set(entry.source, rows);
	}
	return grouped;
}

function getSourceRates(entries: readonly ModelRateCardEntry[]) {
	return [
		...new Set(
			entries.flatMap((entry) =>
				[
					entry.inputPerMTok,
					entry.cacheReadPerMTok,
					entry.cacheWrite5mPerMTok,
					entry.cacheWrite1hPerMTok,
					entry.outputPerMTok,
				].filter((rate): rate is number => rate !== null),
			),
		),
	].sort((left, right) => left - right);
}

function normalizePageText(text: string) {
	return text
		.replaceAll(/&#36;|&dollar;/giu, "$")
		.replaceAll(/&nbsp;|&#160;/giu, " ")
		.replaceAll(/\s+/gu, " ");
}

function containsPublishedRate(pageText: string, rate: number) {
	const variants = new Set([
		String(rate),
		rate.toFixed(2),
		rate.toFixed(3),
		rate.toFixed(4),
	]);
	return [...variants].some((variant) =>
		new RegExp(`\\$\\s*${escapeRegularExpression(variant)}(?:0*)?(?![0-9.])`, "u").test(
			pageText,
		),
	);
}

function escapeRegularExpression(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export async function runModelPricingDriftWatch() {
	const result = await checkModelPricingDrift();
	for (const warning of result.warnings) {
		process.stderr.write(`::warning title=Stale model pricing::${warning}\n`);
	}
	for (const issue of result.issues) {
		process.stderr.write(`::error title=Model pricing drift::${issue}\n`);
	}
	process.stdout.write(
		`Checked ${result.checkedSources} provider pricing sources; ${result.issues.length} drift issues and ${result.warnings.length} staleness warnings.\n`,
	);
	return result.issues.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	process.exitCode = await runModelPricingDriftWatch();
}
