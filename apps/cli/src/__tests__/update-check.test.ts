import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareCliVersions, getCliUpdateNotice } from "../lib/update-check.js";

const originalConfigDir = process.env.RUDEL_CONFIG_DIR;
const originalCi = process.env.CI;
const originalNoUpdateCheck = process.env.RUDEL_NO_UPDATE_CHECK;
const tempDirs: string[] = [];

afterEach(() => {
	restoreEnv("RUDEL_CONFIG_DIR", originalConfigDir);
	restoreEnv("CI", originalCi);
	restoreEnv("RUDEL_NO_UPDATE_CHECK", originalNoUpdateCheck);
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("compareCliVersions", () => {
	test("orders patch, minor, and equal versions", () => {
		expect(compareCliVersions("0.1.11", "0.1.12")).toBeLessThan(0);
		expect(compareCliVersions("0.2.0", "0.1.99")).toBeGreaterThan(0);
		expect(compareCliVersions("v1.2.3", "1.2.3")).toBe(0);
	});
});

describe("getCliUpdateNotice", () => {
	test("returns an update notice for interactive outdated CLI runs", async () => {
		process.env.RUDEL_CONFIG_DIR = createTempConfigDir();

		const notice = await getCliUpdateNotice({
			commandName: "upload",
			currentVersion: "0.1.11",
			fetchLatestVersion: async () => "0.1.12",
			isTty: true,
			now: 1_000,
		});

		expect(notice).toBe(
			[
				"A newer rudel CLI is available: 0.1.12 (current: 0.1.11).",
				"Update with: npm install -g rudel@latest",
			].join("\n"),
		);
	});

	test("caches checks so repeated commands stay quiet", async () => {
		const configDir = createTempConfigDir();
		process.env.RUDEL_CONFIG_DIR = configDir;
		let fetchCount = 0;

		await getCliUpdateNotice({
			commandName: "upload",
			currentVersion: "0.1.11",
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "0.1.12";
			},
			isTty: true,
			now: 1_000,
		});
		const notice = await getCliUpdateNotice({
			commandName: "whoami",
			currentVersion: "0.1.11",
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "0.1.12";
			},
			isTty: true,
			now: 2_000,
		});

		expect(notice).toBeNull();
		expect(fetchCount).toBe(1);
		const cachePath = join(configDir, "update-check.json");
		expect(existsSync(cachePath)).toBe(true);
		expect(readFileSync(cachePath, "utf8")).toContain(
			'"latestVersion": "0.1.12"',
		);
	});

	test("skips hook commands and non-interactive runs", async () => {
		process.env.RUDEL_CONFIG_DIR = createTempConfigDir();
		let fetchCount = 0;

		const hookNotice = await getCliUpdateNotice({
			commandName: "hooks",
			currentVersion: "0.1.11",
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "0.1.12";
			},
			isTty: true,
			now: 1_000,
		});
		const pipeNotice = await getCliUpdateNotice({
			commandName: "upload",
			currentVersion: "0.1.11",
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "0.1.12";
			},
			isTty: false,
			now: 1_000,
		});

		expect(hookNotice).toBeNull();
		expect(pipeNotice).toBeNull();
		expect(fetchCount).toBe(0);
	});
});

function createTempConfigDir() {
	const dir = mkdtempSync(join(tmpdir(), "rudel-update-check-test-"));
	tempDirs.push(dir);
	return dir;
}

function restoreEnv(key: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}
