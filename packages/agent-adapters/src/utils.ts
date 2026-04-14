import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function toClickHouseDateTime(isoString: string): string {
	return isoString.replace("T", " ").replace("Z", "").replace(/\+.*$/, "");
}

export async function readFileWithRetry(
	filePath: string,
	maxRetries = 5,
): Promise<string> {
	const delayMs = 500;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await readFile(filePath, "utf-8");
		} catch (error) {
			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				continue;
			}
			throw error;
		}
	}

	throw new Error(`Failed to read file: ${filePath}`);
}

export async function readJsonlFirstLine(
	filePath: string,
): Promise<unknown | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		const firstLine = content.split("\n")[0];
		if (!firstLine) {
			return null;
		}
		return JSON.parse(firstLine);
	} catch {
		return null;
	}
}

export async function walkJsonlFiles(dir: string): Promise<string[]> {
	const results: string[] = [];

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return results;
	}

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		if (entry.endsWith(".jsonl")) {
			results.push(fullPath);
		} else if (!entry.includes(".")) {
			const nested = await walkJsonlFiles(fullPath);
			results.push(...nested);
		}
	}

	return results;
}

export function toDisplayPath(absolutePath: string): string {
	const home = homedir();
	return absolutePath.startsWith(home)
		? `~${absolutePath.slice(home.length)}`
		: absolutePath;
}
