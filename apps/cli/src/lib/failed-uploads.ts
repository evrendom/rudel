import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Source, SourceSchema } from "@rudel/api-routes";
import {
	ensurePrivateFile,
	getRudelConfigDir,
	writePrivateFile,
} from "./local-state.js";

// Resolved per call, not at module load: RUDEL_CONFIG_DIR must work the same
// way it does for credentials.ts, including when set after import (Bun
// snapshots homedir() at process start, so a load-time constant would pin the
// real home directory for the life of the process).
function getFailedUploadsPath(): string {
	return join(getRudelConfigDir(), "failed-uploads.json");
}

export interface FailedUpload {
	sessionId: string;
	transcriptPath: string;
	projectPath: string;
	source?: Source;
	organizationId?: string;
	error: string;
	failedAt: string;
	status: "permanent" | "retryable";
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
		await ensurePrivateFile(path, getRudelConfigDir());
		const data = JSON.parse(readFileSync(path, "utf-8")) as FailedUploadsData;
		return data.failures.map((f) => ({
			...f,
			source: normalizeSource(f.source),
			status: f.status === "permanent" ? "permanent" : "retryable",
		}));
	} catch {
		return [];
	}
}

async function saveFailedUploads(failures: FailedUpload[]): Promise<void> {
	try {
		const path = getFailedUploadsPath();
		const data: FailedUploadsData = { failures };
		await writePrivateFile(
			path,
			JSON.stringify(data, null, 2),
			getRudelConfigDir(),
		);
	} catch {
		// Best-effort — don't break the upload flow
	}
}

export async function recordFailedUpload(
	failure: Omit<FailedUpload, "failedAt" | "status"> & {
		status?: FailedUpload["status"];
	},
): Promise<void> {
	const failures = await loadFailedUploads();
	const existing = failures.findIndex((f) => f.sessionId === failure.sessionId);
	const entry: FailedUpload = {
		...failure,
		failedAt: new Date().toISOString(),
		status: failure.status ?? "retryable",
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
