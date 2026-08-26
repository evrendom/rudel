import { type Dirent, rmSync } from "node:fs";
import { lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const R2_UPLOAD_STAGING_DIRECTORY_PREFIX = "opaline-r2-upload-";
export const R2_PART_STAGING_DIRECTORY_PREFIX = "opaline-r2-part-";
export const R2_STAGING_STALE_AGE_MS = 24 * 60 * 60 * 1_000;

const R2_STAGING_DIRECTORY_PREFIXES = [
	R2_UPLOAD_STAGING_DIRECTORY_PREFIX,
	R2_PART_STAGING_DIRECTORY_PREFIX,
] as const;
const HANDLED_SIGNALS = ["SIGINT", "SIGTERM"] as const;
const activeStagingDirectories = new Set<string>();
const signalHandlers = new Map<HandledSignal, () => void>();
let initialized = false;

type HandledSignal = (typeof HANDLED_SIGNALS)[number];

export async function initializeR2StagingCleanup(): Promise<void> {
	if (initialized) return;
	initialized = true;
	installCleanupHandlers();
	try {
		await scavengeStaleR2StagingDirectories({
			ownerUid: getCurrentUid(),
			staleBeforeMs: Date.now() - R2_STAGING_STALE_AGE_MS,
			temporaryDirectory: tmpdir(),
		});
	} catch {
		// Startup cleanup is best effort and must not prevent the CLI from running.
	}
}

export async function createOwnedR2StagingDirectory(
	prefix:
		| typeof R2_UPLOAD_STAGING_DIRECTORY_PREFIX
		| typeof R2_PART_STAGING_DIRECTORY_PREFIX,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	activeStagingDirectories.add(directory);
	return directory;
}

export async function cleanupOwnedR2StagingDirectory(
	directory: string,
): Promise<void> {
	await rm(directory, { force: true, recursive: true });
	activeStagingDirectories.delete(directory);
}

export async function scavengeStaleR2StagingDirectories(options: {
	readonly ownerUid: number | undefined;
	readonly staleBeforeMs: number;
	readonly temporaryDirectory: string;
}): Promise<readonly string[]> {
	if (options.ownerUid === undefined) return [];
	let entries: Dirent<string>[];
	try {
		entries = await readdir(options.temporaryDirectory, {
			encoding: "utf8",
			withFileTypes: true,
		});
	} catch {
		return [];
	}

	const removed: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !hasOwnedStagingPrefix(entry.name)) continue;
		const directory = join(options.temporaryDirectory, entry.name);
		if (activeStagingDirectories.has(directory)) continue;
		try {
			const metadata = await lstat(directory);
			if (
				!metadata.isDirectory() ||
				metadata.uid !== options.ownerUid ||
				metadata.mtimeMs >= options.staleBeforeMs
			) {
				continue;
			}
			await rm(directory, { force: true, recursive: true });
			removed.push(directory);
		} catch {
			// A concurrent process may remove or replace the directory while scanning.
		}
	}
	return removed;
}

function installCleanupHandlers(): void {
	for (const signal of HANDLED_SIGNALS) {
		const handler = () => handleSignal(signal);
		signalHandlers.set(signal, handler);
		process.once(signal, handler);
	}
	process.once("exit", cleanupActiveStagingDirectoriesSync);
}

function handleSignal(signal: HandledSignal): void {
	cleanupActiveStagingDirectoriesSync();
	for (const [registeredSignal, handler] of signalHandlers) {
		process.removeListener(registeredSignal, handler);
	}
	signalHandlers.clear();
	try {
		process.kill(process.pid, signal);
	} catch {
		process.exit(signal === "SIGINT" ? 130 : 143);
	}
}

function cleanupActiveStagingDirectoriesSync(): void {
	for (const directory of activeStagingDirectories) {
		try {
			rmSync(directory, { force: true, recursive: true });
		} catch {
			// Signal and exit cleanup cannot safely surface filesystem failures.
		}
	}
	activeStagingDirectories.clear();
}

function hasOwnedStagingPrefix(name: string): boolean {
	return R2_STAGING_DIRECTORY_PREFIXES.some((prefix) =>
		name.startsWith(prefix),
	);
}

function getCurrentUid(): number | undefined {
	return typeof process.getuid === "function" ? process.getuid() : undefined;
}
