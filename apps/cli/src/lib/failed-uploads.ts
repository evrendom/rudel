import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Source, SourceSchema } from "../contracts/index.js";
import {
	ensurePrivateFile,
	getConfigDir,
	writePrivateFile,
} from "./local-state.js";

// Resolved per call, not at module load: config-directory environment
// overrides must work when set after import (Bun
// snapshots homedir() at process start, so a load-time constant would pin the
// real home directory for the life of the process).
function getFailedUploadsPath(): string {
	return join(getConfigDir(), "failed-uploads.json");
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
	failureKind?: "json-integrity" | "session-shrink-rejected";
}

interface FailedUploadsData {
	failures: FailedUpload[];
}

let mutationQueue: Promise<void> = Promise.resolve();

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
		await ensurePrivateFile(path, getConfigDir());
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
		await writePrivateFile(path, JSON.stringify(data, null, 2), getConfigDir());
	} catch {
		// Best-effort — don't break the upload flow
	}
}

export async function recordFailedUpload(
	failure: Omit<FailedUpload, "failedAt" | "status"> & {
		status?: FailedUpload["status"];
	},
): Promise<void> {
	await enqueueMutation(async () => {
		const failures = await loadFailedUploads();
		const existing = failures.findIndex(
			(f) => f.sessionId === failure.sessionId,
		);
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
	});
}

export async function removeFailedUpload(sessionId: string): Promise<void> {
	await enqueueMutation(async () => {
		const failures = await loadFailedUploads();
		const filtered = failures.filter((f) => f.sessionId !== sessionId);
		if (filtered.length !== failures.length) {
			await saveFailedUploads(filtered);
		}
	});
}

async function enqueueMutation(operation: () => Promise<void>): Promise<void> {
	const queued = mutationQueue.then(operation, operation);
	mutationQueue = queued.catch(() => {});
	await queued;
}

export function isRetryCandidate(
	failure: FailedUpload,
	forceReplace: boolean,
): boolean {
	if (failure.status === "retryable") return true;
	if (!forceReplace) return false;
	return (
		failure.failureKind === "session-shrink-rejected" ||
		failure.error.includes("--force-replace")
	);
}
