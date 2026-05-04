#!/usr/bin/env bun
import { createHash, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

// db.js connects to Postgres on import. Loading it lazily lets --help and
// argument validation errors run without a database connection.
type SqlClient = typeof import("../apps/api/src/db.js")["sqlClient"];
let cachedClient: SqlClient | null = null;
async function getSqlClient(): Promise<SqlClient> {
	if (!cachedClient) {
		const module = await import("../apps/api/src/db.js");
		cachedClient = module.sqlClient;
	}
	return cachedClient;
}

interface ParsedArgs {
	count: number | null;
	outPath: string | null;
	appUrl: string;
	inspect: boolean;
	force: boolean;
	help: boolean;
}

const USAGE = `Generate single-use Decimal Wrapped claim links.

Usage:
  bun run scripts/generate-wrapped-decimal-claims.ts --count 223 --out ./decimal-links.csv [--app-url https://app.rudel.ai]
  bun run scripts/generate-wrapped-decimal-claims.ts --inspect

Flags:
  --count <N>     Number of links to generate. Required unless --inspect is passed.
  --out <path>    CSV output path. Use '-' for stdout. Required unless --inspect.
  --app-url <url> Base URL for the claim link. Defaults to APP_URL env or https://app.rudel.ai.
  --inspect       Print counts of total/claimed/unclaimed rows and exit. Read-only.
  --force         Allow overwriting an existing --out file.
  --help          Show this message.

Notes:
  - Raw tokens are written to the CSV only. The DB stores sha256(token).
  - Refuses to overwrite an existing --out file unless --force is passed,
    because the CSV is the only copy of the raw tokens.
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
	const args: ParsedArgs = {
		count: null,
		outPath: null,
		appUrl: process.env.APP_URL ?? "https://app.rudel.ai",
		inspect: false,
		force: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const flag = argv[i];

		if (flag === "--help" || flag === "-h") {
			args.help = true;
			continue;
		}

		if (flag === "--inspect") {
			args.inspect = true;
			continue;
		}

		if (flag === "--force") {
			args.force = true;
			continue;
		}

		if (flag === "--count") {
			const raw = argv[++i];
			const parsed = Number(raw);
			if (!Number.isInteger(parsed) || parsed <= 0) {
				throw new Error(`--count must be a positive integer (got ${raw})`);
			}
			args.count = parsed;
			continue;
		}

		if (flag === "--out") {
			args.outPath = argv[++i] ?? null;
			continue;
		}

		if (flag === "--app-url") {
			args.appUrl = argv[++i] ?? args.appUrl;
			continue;
		}

		throw new Error(`Unknown flag: ${flag}`);
	}

	return args;
}

function generateClaimToken(): string {
	const raw = randomBytes(32).toString("base64url");
	return `wct_${raw}`;
}

function hashClaimToken(token: string): Uint8Array {
	return createHash("sha256").update(token).digest();
}

function buildClaimUrl(appUrl: string, token: string): string {
	const base = appUrl.replace(/\/+$/u, "");
	return `${base}/wrapped?claim=${encodeURIComponent(token)}`;
}

async function inspect(): Promise<void> {
	const sqlClient = await getSqlClient();
	const [row] = await sqlClient<Array<{ total: number; claimed: number }>>`
		SELECT
			COUNT(*)::int AS total,
			COUNT(claimed_by_user_id)::int AS claimed
		FROM wrapped_decimal_claim
	`;
	const total = row?.total ?? 0;
	const claimed = row?.claimed ?? 0;

	console.log(`total:     ${total}`);
	console.log(`claimed:   ${claimed}`);
	console.log(`unclaimed: ${total - claimed}`);
}

async function generate(input: {
	count: number;
	appUrl: string;
	outPath: string;
	force: boolean;
}): Promise<void> {
	const { count, appUrl, outPath, force } = input;
	const writingToFile = outPath !== "-";

	if (writingToFile && existsSync(outPath) && !force) {
		throw new Error(
			`Refusing to overwrite existing file: ${outPath}. Pass --force to override (the CSV is the only copy of raw tokens).`,
		);
	}

	const tokens: string[] = [];
	const tokenHashes: Uint8Array[] = [];

	for (let i = 0; i < count; i += 1) {
		const token = generateClaimToken();
		tokens.push(token);
		tokenHashes.push(hashClaimToken(token));
	}

	const sqlClient = await getSqlClient();

	// Single transaction so the script never leaves a partial batch in the DB.
	// If anything throws, all rows roll back together.
	await sqlClient.begin(async (tx) => {
		for (const tokenHash of tokenHashes) {
			await tx`
				INSERT INTO wrapped_decimal_claim (token_hash)
				VALUES (${tokenHash})
			`;
		}
	});

	const csvLines = ["url"];
	for (const token of tokens) {
		csvLines.push(buildClaimUrl(appUrl, token));
	}
	const csv = `${csvLines.join("\n")}\n`;

	if (writingToFile) {
		writeFileSync(outPath, csv, { mode: 0o600 });
		console.error(`Wrote ${count} URLs to ${outPath} (mode 0600).`);
	} else {
		process.stdout.write(csv);
	}

	console.error(
		`WARNING: this output is the only copy of the raw tokens. The database stores only sha256 hashes — once this file is lost, the corresponding ${count} rows can no longer be claimed.`,
	);
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		console.log(USAGE);
		return;
	}

	if (args.inspect) {
		await inspect();
		return;
	}

	if (args.count === null) {
		throw new Error("--count is required (or pass --inspect to read counts).");
	}

	if (args.outPath === null) {
		throw new Error("--out is required (use '-' for stdout).");
	}

	await generate({
		count: args.count,
		appUrl: args.appUrl,
		outPath: args.outPath,
		force: args.force,
	});
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
} finally {
	if (cachedClient) {
		await cachedClient.end();
	}
}
