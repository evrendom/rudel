import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export type ConfigPathSource =
	| "opaline-environment"
	| "rudel-environment"
	| "rudel-default";

export interface ConfigPathInfo {
	directory: string;
	migrationStatus: string;
	source: ConfigPathSource;
}

export function getConfigPathInfo(
	environment: NodeJS.ProcessEnv = process.env,
	homeDirectory: string = homedir(),
): ConfigPathInfo {
	const opalineDirectory = environment.OPALINE_CONFIG_DIR?.trim();
	if (opalineDirectory) {
		return {
			directory: opalineDirectory,
			migrationStatus: "using OPALINE_CONFIG_DIR",
			source: "opaline-environment",
		};
	}

	const rudelDirectory = environment.RUDEL_CONFIG_DIR?.trim();
	if (rudelDirectory) {
		return {
			directory: rudelDirectory,
			migrationStatus: "using legacy RUDEL_CONFIG_DIR compatibility",
			source: "rudel-environment",
		};
	}

	return {
		directory: join(homeDirectory, ".rudel"),
		migrationStatus: "legacy ~/.rudel path retained; no migration needed",
		source: "rudel-default",
	};
}

export function getConfigDir(): string {
	return getConfigPathInfo().directory;
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
