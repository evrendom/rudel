import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
	token: string;
	apiBaseUrl: string;
	authType?: "bearer" | "api-key";
	apiKeyId?: string;
	user?: {
		id: string;
		email: string;
		name: string;
	};
	organizations?: Array<{
		id: string;
		name: string;
		slug: string;
	}>;
}

function getConfigDir(): string {
	return process.env.RUDEL_CONFIG_DIR ?? join(homedir(), ".rudel");
}

function getCredentialsPath(): string {
	return join(getConfigDir(), "credentials.json");
}

export function saveCredentials(credentials: Credentials): void {
	const dir = getConfigDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(getCredentialsPath(), JSON.stringify(credentials, null, 2), {
		mode: 0o600,
	});
}

export function loadCredentials(): Credentials | null {
	const path = getCredentialsPath();
	if (!existsSync(path)) {
		return null;
	}
	const content = readFileSync(path, "utf-8");
	return JSON.parse(content) as Credentials;
}

export function clearCredentials(): void {
	const path = getCredentialsPath();
	if (existsSync(path)) {
		rmSync(path);
	}
}
