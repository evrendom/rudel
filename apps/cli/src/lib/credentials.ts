import { spawnSync } from "node:child_process";
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
}

interface CredentialMetadata {
	apiBaseUrl: string;
	storage: "secure-store";
}

const CREDENTIAL_SERVICE = "ai.rudel.cli";
const CREDENTIAL_ACCOUNT = "default";

function getConfigDir(): string {
	return process.env.RUDEL_CONFIG_DIR ?? join(homedir(), ".rudel");
}

function getCredentialsPath(): string {
	return join(getConfigDir(), "credentials.json");
}

function getMetadataPath(): string {
	return join(getConfigDir(), "credentials-meta.json");
}

function ensureConfigDir(): void {
	const dir = getConfigDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
}

function shouldAllowPlaintextFallback(): boolean {
	return process.env.RUDEL_ALLOW_PLAINTEXT_CREDENTIALS === "1";
}

function runCredentialCommand(
	command: string,
	args: string[],
	stdin?: string,
): { success: boolean; stdout: string; stderr: string } {
	const result = spawnSync(command, args, {
		input: stdin,
		encoding: "utf8",
	});
	return {
		success: result.status === 0,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

function saveToMacKeychain(token: string): boolean {
	const result = runCredentialCommand("security", [
		"add-generic-password",
		"-U",
		"-a",
		CREDENTIAL_ACCOUNT,
		"-s",
		CREDENTIAL_SERVICE,
		"-w",
		token,
	]);
	return result.success;
}

function loadFromMacKeychain(): string | null {
	const result = runCredentialCommand("security", [
		"find-generic-password",
		"-a",
		CREDENTIAL_ACCOUNT,
		"-s",
		CREDENTIAL_SERVICE,
		"-w",
	]);
	if (!result.success) {
		return null;
	}
	return result.stdout.trim() || null;
}

function clearFromMacKeychain(): void {
	runCredentialCommand("security", [
		"delete-generic-password",
		"-a",
		CREDENTIAL_ACCOUNT,
		"-s",
		CREDENTIAL_SERVICE,
	]);
}

function saveToLinuxKeyring(token: string): boolean {
	const result = runCredentialCommand(
		"secret-tool",
		[
			"store",
			"--label",
			"Rudel CLI",
			"service",
			CREDENTIAL_SERVICE,
			"account",
			CREDENTIAL_ACCOUNT,
		],
		token,
	);
	return result.success;
}

function loadFromLinuxKeyring(): string | null {
	const result = runCredentialCommand("secret-tool", [
		"lookup",
		"service",
		CREDENTIAL_SERVICE,
		"account",
		CREDENTIAL_ACCOUNT,
	]);
	if (!result.success) {
		return null;
	}
	return result.stdout.trim() || null;
}

function clearFromLinuxKeyring(): void {
	runCredentialCommand("secret-tool", [
		"clear",
		"service",
		CREDENTIAL_SERVICE,
		"account",
		CREDENTIAL_ACCOUNT,
	]);
}

function hasCommand(command: string): boolean {
	const result = spawnSync("sh", ["-c", `command -v ${command}`], {
		encoding: "utf8",
	});
	return result.status === 0;
}

function saveToSecureStore(token: string): boolean {
	if (process.platform === "darwin" && hasCommand("security")) {
		return saveToMacKeychain(token);
	}
	if (process.platform === "linux" && hasCommand("secret-tool")) {
		return saveToLinuxKeyring(token);
	}
	return false;
}

function loadFromSecureStore(): string | null {
	if (process.platform === "darwin" && hasCommand("security")) {
		return loadFromMacKeychain();
	}
	if (process.platform === "linux" && hasCommand("secret-tool")) {
		return loadFromLinuxKeyring();
	}
	return null;
}

function clearFromSecureStore(): void {
	if (process.platform === "darwin" && hasCommand("security")) {
		clearFromMacKeychain();
		return;
	}
	if (process.platform === "linux" && hasCommand("secret-tool")) {
		clearFromLinuxKeyring();
	}
}

function savePlaintextCredentials(token: string, apiBaseUrl: string): void {
	ensureConfigDir();
	const data: Credentials = { token, apiBaseUrl };
	writeFileSync(getCredentialsPath(), JSON.stringify(data, null, 2), {
		mode: 0o600,
	});
}

function loadPlaintextCredentials(): Credentials | null {
	const path = getCredentialsPath();
	if (!existsSync(path)) return null;
	const content = readFileSync(path, "utf-8");
	return JSON.parse(content) as Credentials;
}

export function saveCredentials(token: string, apiBaseUrl: string): void {
	if (shouldAllowPlaintextFallback()) {
		savePlaintextCredentials(token, apiBaseUrl);
		return;
	}

	ensureConfigDir();
	if (!saveToSecureStore(token)) {
		throw new Error(
			"No secure credential store is available. Set RUDEL_ALLOW_PLAINTEXT_CREDENTIALS=1 to allow plaintext fallback.",
		);
	}

	const metadata: CredentialMetadata = {
		apiBaseUrl,
		storage: "secure-store",
	};
	writeFileSync(getMetadataPath(), JSON.stringify(metadata, null, 2), {
		mode: 0o600,
	});
}

export function loadCredentials(): Credentials | null {
	const plaintext = loadPlaintextCredentials();
	if (plaintext) {
		return plaintext;
	}

	const metadataPath = getMetadataPath();
	if (!existsSync(metadataPath)) {
		return null;
	}

	const metadata = JSON.parse(
		readFileSync(metadataPath, "utf-8"),
	) as CredentialMetadata;
	const token = loadFromSecureStore();
	if (!token) {
		return null;
	}

	return {
		token,
		apiBaseUrl: metadata.apiBaseUrl,
	};
}

export function clearCredentials(): void {
	const path = getCredentialsPath();
	if (existsSync(path)) {
		rmSync(path);
	}

	const metadataPath = getMetadataPath();
	if (existsSync(metadataPath)) {
		rmSync(metadataPath);
	}

	clearFromSecureStore();
}
