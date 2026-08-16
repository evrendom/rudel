import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

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

export function saveCredentials(credentials: Credentials): void {
	const dir = getConfigDir();
	const path = getCredentialsPath(dir);
	const content = JSON.stringify(credentials, null, 2);

	mkdirSync(dir, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
	enforcePrivateMode(dir, PRIVATE_DIRECTORY_MODE);
	if (existsSync(path)) {
		enforcePrivateMode(path, PRIVATE_FILE_MODE);
	}
	replaceCredentialsFile(path, content);
}

export function loadCredentials(): Credentials | null {
	const dir = getConfigDir();
	const path = getCredentialsPath(dir);
	if (!existsSync(path)) return null;

	enforcePrivateMode(dir, PRIVATE_DIRECTORY_MODE);
	enforcePrivateMode(path, PRIVATE_FILE_MODE);
	const content = readFileSync(path, "utf-8");
	return JSON.parse(content) as Credentials;
}

export function clearCredentials(): void {
	const path = getCredentialsPath(getConfigDir());
	if (existsSync(path)) {
		rmSync(path);
	}
}

function getCredentialsPath(configDir: string): string {
	return join(configDir, "credentials.json");
}

function replaceCredentialsFile(path: string, content: string): void {
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

	try {
		writeFileSync(temporaryPath, content, {
			encoding: "utf8",
			flag: "wx",
			mode: PRIVATE_FILE_MODE,
		});
		enforcePrivateMode(temporaryPath, PRIVATE_FILE_MODE);
		renameSync(temporaryPath, path);
		enforcePrivateMode(path, PRIVATE_FILE_MODE);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
}

function enforcePrivateMode(path: string, mode: number): void {
	// Windows does not expose POSIX owner/group/other modes through chmod.
	// Its per-user directory ACL is the credential-store security boundary.
	if (process.platform === "win32") return;

	chmodSync(path, mode);
	if ((statSync(path).mode & 0o777) !== mode) {
		throw new Error("Unable to establish private credential permissions");
	}
}
