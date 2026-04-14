import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CACHE_PATH = join(homedir(), ".rudel", "remote-cache.json");

type RemoteCacheData = Record<string, string>;

export async function getRemoteCache(): Promise<RemoteCacheData> {
	try {
		if (!existsSync(CACHE_PATH)) {
			return {};
		}
		return JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as RemoteCacheData;
	} catch {
		return {};
	}
}

export function getCachedRemote(
	cache: RemoteCacheData,
	encodedDir: string,
): string | null {
	return cache[encodedDir] ?? null;
}

export function cacheRemote(
	cache: RemoteCacheData,
	encodedDir: string,
	normalizedRemote: string,
): void {
	cache[encodedDir] = normalizedRemote;
}

export async function cacheRemotes(cache: RemoteCacheData): Promise<void> {
	try {
		await mkdir(dirname(CACHE_PATH), { recursive: true });
		await writeFile(CACHE_PATH, JSON.stringify(cache));
	} catch {
		// Fire-and-forget — cache is best-effort
	}
}
