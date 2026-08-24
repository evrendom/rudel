import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensurePrivateFile,
	getConfigDir,
	writePrivateFile,
} from "./local-state.js";

type RemoteCacheData = Record<string, string>;

export async function getRemoteCache(): Promise<RemoteCacheData> {
	try {
		const path = getRemoteCachePath();
		if (!existsSync(path)) return {};
		await ensurePrivateFile(path, getConfigDir());
		return JSON.parse(readFileSync(path, "utf-8")) as RemoteCacheData;
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
		await writePrivateFile(
			getRemoteCachePath(),
			JSON.stringify(cache),
			getConfigDir(),
		);
	} catch {
		// Fire-and-forget — cache is best-effort
	}
}

function getRemoteCachePath(): string {
	return join(getConfigDir(), "remote-cache.json");
}
