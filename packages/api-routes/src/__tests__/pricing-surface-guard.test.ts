import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type PricingViolation = {
	description: string;
	index: number;
};

const REPOSITORY_ROOT = dirname(
	dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))),
);
const SCANNED_ROOTS = ["apps", "packages", "scripts"] as const;
const EXECUTABLE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".mjs",
	".cjs",
	".sql",
]);
const SKIPPED_DIRECTORIES = new Set([
	".git",
	".turbo",
	"coverage",
	"dist",
	"node_modules",
]);
const ALLOWED_PRICING_FILES = new Set([
	"packages/api-routes/src/model-pricing.ts",
	"packages/api-routes/src/model-rate-card.ts",
	"packages/api-routes/src/__tests__/pricing-surface-guard.test.ts",
]);

const FORBIDDEN_PRICING_PATTERNS = [
	{
		description: "token price/rate constant",
		expression:
			/\b(?:const|let|var)\s+(?:(?:INPUT|OUTPUT|CACHE|TOKEN)[A-Z0-9_]*(?:PRICE|RATE)[A-Z0-9_]*|[A-Z0-9_]*(?:PRICE|RATE)_PER_(?:MILLION|MTOK|TOKEN|1M))\s*=/u,
	},
	{
		description: "per-million price identifier",
		expression:
			/\b[A-Za-z0-9_]*(?:price|rate)Per(?:Million|MTok|Token)\b|\b[A-Z0-9_]*(?:PRICE|RATE)_PER_(?:MILLION|MTOK|TOKEN|1M)\b/iu,
	},
	{
		description: "micro-dollar multiplication",
		expression: /\*\s*0\.0{3,}\d+/u,
	},
	{
		description: "token division followed by an inline price",
		expression:
			/\b(?:[A-Za-z_][A-Za-z0-9_.]*)?tokens?\b[\s)]{0,12}\/\s*(?:1_?000_?000(?:\.0)?|1e6)[\s)]{0,12}\*\s*\d+(?:\.\d+)?/iu,
	},
	{
		description: "token multiplication followed by per-million division",
		expression:
			/\b(?:[A-Za-z_][A-Za-z0-9_.]*)?tokens?\b[\s)]{0,12}\*\s*\d+(?:\.\d+)?[\s)]{0,12}\/\s*(?:1_?000_?000(?:\.0)?|1e6)/iu,
	},
	{
		description: "dollar-per-token-class literal",
		expression: /\$\s*\d+(?:\.\d+)?\s*\/\s*(?:M(?:TOK)?|million\s+tokens?)/iu,
	},
] as const;

function findPricingViolations(source: string): PricingViolation[] {
	return FORBIDDEN_PRICING_PATTERNS.flatMap(({ description, expression }) => {
		const match = expression.exec(source);
		return match ? [{ description, index: match.index }] : [];
	});
}

async function listExecutableFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRECTORIES.has(entry.name)) {
				files.push(...(await listExecutableFiles(join(root, entry.name))));
			}
			continue;
		}

		if (entry.isFile() && EXECUTABLE_EXTENSIONS.has(extname(entry.name))) {
			files.push(join(root, entry.name));
		}
	}

	return files;
}

function formatViolation(
	filePath: string,
	violation: PricingViolation,
	source: string,
) {
	const line = source.slice(0, violation.index).split("\n").length;
	return `${relative(REPOSITORY_ROOT, filePath)}:${line} (${violation.description})`;
}

describe("canonical pricing surface guard", () => {
	it("recognizes every banned pricing form from the closure plan", () => {
		const bannedExamples = [
			"const INPUT_PRICE_PER_MILLION = 3;",
			"const OUTPUT_RATE = 15;",
			"const cacheReadPricePerMTok = 0.3;",
			"const cost = (input_tokens / 1e6) * 3;",
			"const cost = output_tokens * 15 / 1000000;",
			"const cost = inputTokens * 0.000015;",
			"const cost = (tokens / 1000000) * 15.0;",
			"const label = '$212/MTok';",
		];

		for (const source of bannedExamples) {
			expect(findPricingViolations(source), source).not.toHaveLength(0);
		}
	});

	it("does not confuse token display scaling with price arithmetic", () => {
		expect(
			findPricingViolations(
				"const millions = (totalTokens / 1_000_000).toFixed(1);",
			),
		).toHaveLength(0);
	});

	it("keeps rate literals and token-price arithmetic out of executable code", async () => {
		const violations: string[] = [];

		for (const root of SCANNED_ROOTS) {
			const files = await listExecutableFiles(join(REPOSITORY_ROOT, root));

			for (const filePath of files) {
				const repositoryPath = relative(REPOSITORY_ROOT, filePath);
				if (ALLOWED_PRICING_FILES.has(repositoryPath)) {
					continue;
				}

				const source = await readFile(filePath, "utf8");
				violations.push(
					...findPricingViolations(source).map((violation) =>
						formatViolation(filePath, violation, source),
					),
				);

				if (
					repositoryPath.startsWith("apps/web/") &&
					/\b(?:calculateEstimatedCost|calculateCost)\b/u.test(source)
				) {
					violations.push(`${repositoryPath} (client-side cost calculator)`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
