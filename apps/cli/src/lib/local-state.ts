import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export function getRudelConfigDir(): string {
	return process.env.RUDEL_CONFIG_DIR ?? join(homedir(), ".rudel");
}

export async function ensurePrivateFile(
	filePath: string,
	configDir: string,
): Promise<void> {
	await secureDirectory(configDir);
	const fileDirectory = dirname(filePath);
	if (fileDirectory !== configDir) {
		await secureDirectory(fileDirectory);
	}
	await writeFile(filePath, "", { flag: "a", mode: PRIVATE_FILE_MODE });
	await chmod(filePath, PRIVATE_FILE_MODE);
}

export async function writePrivateFile(
	filePath: string,
	content: string,
	configDir: string,
): Promise<void> {
	await ensurePrivateFile(filePath, configDir);
	await writeFile(filePath, content, "utf8");
}

async function secureDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
	await chmod(path, PRIVATE_DIRECTORY_MODE);
}
