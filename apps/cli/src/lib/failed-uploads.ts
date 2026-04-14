import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type Source, SourceSchema } from "@rudel/api-routes";

const FAILED_UPLOADS_PATH = join(homedir(), ".rudel", "failed-uploads.json");

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
	if (typeof raw !== "string") {
		return undefined;
	}
	const normalized = raw.replace(/-/g, "_");
	const parsed = SourceSchema.safeParse(normalized);
	return parsed.success ? parsed.data : undefined;
}

export async function loadFailedUploads(): Promise<FailedUpload[]> {
	try {
		if (!existsSync(FAILED_UPLOADS_PATH)) {
			return [];
		}
		const data = JSON.parse(
			readFileSync(FAILED_UPLOADS_PATH, "utf-8"),
		) as FailedUploadsData;
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
		await mkdir(dirname(FAILED_UPLOADS_PATH), { recursive: true });
		const data: FailedUploadsData = { failures };
		await writeFile(FAILED_UPLOADS_PATH, JSON.stringify(data, null, 2));
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
