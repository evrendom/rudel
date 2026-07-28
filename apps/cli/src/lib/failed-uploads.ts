import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type Source, SourceSchema } from "@rudel/api-routes";

// Resolved per call, not at module load: RUDEL_CONFIG_DIR must work the same
// way it does for credentials.ts, including when set after import (Bun
// snapshots homedir() at process start, so a load-time constant would pin the
// real home directory for the life of the process).
function getFailedUploadsPath(): string {
	const configDir = process.env.RUDEL_CONFIG_DIR ?? join(homedir(), ".rudel");
	return join(configDir, "failed-uploads.json");
}

export interface FailedUpload {
	sessionId: string;
	transcriptPath: string;
	projectPath: string;
	source?: Source;
	organizationId?: string;
	error: string;
	failedAt: string;
}

interface FailedUploadsData {
	failures: FailedUpload[];
}

function normalizeSource(raw: unknown): Source | undefined {
	if (typeof raw !== "string") return undefined;
	const normalized = raw.replace(/-/g, "_");
	const parsed = SourceSchema.safeParse(normalized);
	return parsed.success ? parsed.data : undefined;
}

export async function loadFailedUploads(): Promise<FailedUpload[]> {
	try {
		const path = getFailedUploadsPath();
		if (!existsSync(path)) return [];
		const data = JSON.parse(readFileSync(path, "utf-8")) as FailedUploadsData;
		return data.failures.map((f) => ({
			...f,
			source: normalizeSource(f.source),
		}));
	} catch {
		return [];
	}
}

async function saveFailedUploads(failures: FailedUpload[]): Promise<void> {
	try {
		const path = getFailedUploadsPath();
		await mkdir(dirname(path), { recursive: true });
		const data: FailedUploadsData = { failures };
		await writeFile(path, JSON.stringify(data, null, 2));
	} catch {
		// Best-effort — don't break the upload flow
	}
}

export async function recordFailedUpload(
	failure: Omit<FailedUpload, "failedAt">,
): Promise<void> {
	const failures = await loadFailedUploads();
	const existing = failures.findIndex((f) => f.sessionId === failure.sessionId);
	const entry: FailedUpload = {
		...failure,
		failedAt: new Date().toISOString(),
	};
	if (existing >= 0) {
		failures[existing] = entry;
	} else {
		failures.push(entry);
	}
	await saveFailedUploads(failures);
}

export async function removeFailedUpload(sessionId: string): Promise<void> {
	const failures = await loadFailedUploads();
	const filtered = failures.filter((f) => f.sessionId !== sessionId);
	if (filtered.length !== failures.length) {
		await saveFailedUploads(filtered);
	}
}
