import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseTOML } from "smol-toml";
import { installHook, isHookInstalled, removeHook } from "./config.js";

let tempDir: string;

beforeAll(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "opaline-codex-config-"));
});

afterAll(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

function configPath(name: string): string {
	return join(tempDir, `${name}.toml`);
}

async function readNotify(path: string): Promise<unknown> {
	const config = parseTOML(await readFile(path, "utf8"));
	return config.notify;
}

describe("Codex notify configuration", () => {
	test("installs Opaline as one argv vector and is idempotent", async () => {
		const path = configPath("fresh");

		installHook(path);
		installHook(path);

		expect(await readNotify(path)).toEqual([
			"opaline",
			"hooks",
			"codex",
			"turn-complete",
		]);
		expect(isHookInstalled(path)).toBe(true);
	});

	test("migrates Rudel's malformed legacy singleton", async () => {
		const path = configPath("legacy-singleton");
		await writeFile(path, 'notify = ["rudel hooks codex turn-complete"]\n', {
			flag: "wx",
		});

		installHook(path);

		expect(await readNotify(path)).toEqual([
			"opaline",
			"hooks",
			"codex",
			"turn-complete",
		]);
	});

	test("migrates Rudel's legacy argv vector", async () => {
		const path = configPath("legacy-vector");
		await writeFile(
			path,
			'notify = ["rudel", "hooks", "codex", "turn-complete"]\n',
			{ flag: "wx" },
		);

		expect(isHookInstalled(path)).toBe(true);
		installHook(path);

		expect(await readNotify(path)).toEqual([
			"opaline",
			"hooks",
			"codex",
			"turn-complete",
		]);
	});

	test("installs into an explicitly empty notify vector", async () => {
		const path = configPath("empty");
		await writeFile(path, "notify = []\n", { flag: "wx" });

		installHook(path);

		expect(await readNotify(path)).toEqual([
			"opaline",
			"hooks",
			"codex",
			"turn-complete",
		]);
	});

	test("preserves an unrelated existing notify command", async () => {
		const path = configPath("existing");
		const original = 'notify = ["python3", "/tmp/notify.py"]\n';
		await writeFile(path, original, { flag: "wx" });

		expect(() => installHook(path)).toThrow("supports only one notify command");
		expect(await readFile(path, "utf8")).toBe(original);
		expect(isHookInstalled(path)).toBe(false);
	});

	test("repairs a previously corrupted notify command without replacing it", async () => {
		const path = configPath("legacy-appended");
		await writeFile(
			path,
			'notify = ["python3", "/tmp/notify.py", "rudel hooks codex turn-complete"]\n',
			{ flag: "wx" },
		);

		expect(() => installHook(path)).toThrow("restoring the previous command");
		expect(await readNotify(path)).toEqual(["python3", "/tmp/notify.py"]);
		expect(isHookInstalled(path)).toBe(false);
	});

	test("removes only Opaline's notify command", async () => {
		const installedPath = configPath("remove-installed");
		installHook(installedPath);

		removeHook(installedPath);

		expect(await readNotify(installedPath)).toBeUndefined();

		const existingPath = configPath("remove-existing");
		const original = 'notify = ["python3", "/tmp/notify.py"]\n';
		await writeFile(existingPath, original, { flag: "wx" });

		removeHook(existingPath);

		expect(await readFile(existingPath, "utf8")).toBe(original);
	});
});
