import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const CLI_SOURCE_ROOT = resolve(import.meta.dir, "..");
const UPLOADER_PATH = "lib/uploader.ts";

function listProductionTypeScriptFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "__tests__") {
				files.push(...listProductionTypeScriptFiles(absolutePath));
			}
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".ts")) {
			files.push(absolutePath);
		}
	}
	return files;
}

test("the uploader chokepoint is the only authenticated ingest request", () => {
	const sources = listProductionTypeScriptFiles(CLI_SOURCE_ROOT).map(
		(path) => ({
			path: relative(CLI_SOURCE_ROOT, path),
			content: readFileSync(path, "utf8"),
		}),
	);
	const authenticatedIngestSinks = sources
		.filter(
			(source) =>
				source.content.includes(".ingestSession(") &&
				source.content.includes('"x-api-key"') &&
				source.content.includes("Authorization"),
		)
		.map((source) => source.path);
	const allIngestCallers = sources
		.filter((source) => source.content.includes(".ingestSession("))
		.map((source) => source.path);

	expect(authenticatedIngestSinks).toEqual([UPLOADER_PATH]);
	expect(allIngestCallers).toEqual([UPLOADER_PATH]);
	expect(
		sources.find((source) => source.path === UPLOADER_PATH)?.content,
	).toContain("parseSafeApiEndpoint");
});
