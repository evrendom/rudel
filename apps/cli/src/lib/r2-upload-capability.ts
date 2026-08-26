import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { getConfigDir, writePrivateFile } from "./local-state.js";
import { R2_INGEST_PROTOCOL } from "./r2-ingest-contract.js";

const advertisedEndpoints = new Set<string>();

export function hasAdvertisedR2UploadCapability(
	endpoint: URL,
	authType: "api-key" | "bearer",
	token: string,
): boolean {
	const key = getCapabilityKey(endpoint, authType, token);
	if (advertisedEndpoints.has(key)) return true;
	try {
		const path = getCapabilityPath(key);
		if (!existsSync(path)) return false;
		if (readFileSync(path, "utf8").trim() !== R2_INGEST_PROTOCOL) return false;
		advertisedEndpoints.add(key);
		return true;
	} catch {
		return false;
	}
}

export async function rememberR2UploadCapability(
	endpoint: URL,
	authType: "api-key" | "bearer",
	token: string,
): Promise<void> {
	const key = getCapabilityKey(endpoint, authType, token);
	advertisedEndpoints.add(key);
	try {
		await writePrivateFile(
			getCapabilityPath(key),
			`${R2_INGEST_PROTOCOL}\n`,
			getConfigDir(),
		);
	} catch {
		// Capability persistence is an optimization; in-memory use still works.
	}
}

export async function forgetR2UploadCapability(
	endpoint: URL,
	authType: "api-key" | "bearer",
	token: string,
): Promise<void> {
	const key = getCapabilityKey(endpoint, authType, token);
	advertisedEndpoints.delete(key);
	try {
		await rm(getCapabilityPath(key), { force: true });
	} catch {
		// A stale cache entry only causes another safe init/fallback attempt.
	}
}

function getCapabilityKey(
	endpoint: URL,
	authType: "api-key" | "bearer",
	token: string,
): string {
	return createHash("sha256")
		.update(`${endpoint.href}\u0000${authType}\u0000${token}`, "utf8")
		.digest("hex");
}

function getCapabilityPath(key: string): string {
	return join(getConfigDir(), "upload-capabilities", `${key}.txt`);
}
