import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	R2_PART_STAGING_DIRECTORY_PREFIX,
	R2_UPLOAD_STAGING_DIRECTORY_PREFIX,
	scavengeStaleR2StagingDirectories,
} from "../lib/r2-staging-cleanup.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	);
});

describe("R2 staging cleanup", () => {
	test("removes stale owned staging directories and ignores fresh, foreign, and non-owned directories", async () => {
		const root = await mkdtemp(join(tmpdir(), "opaline-r2-scavenger-test-"));
		temporaryDirectories.push(root);
		const staleUpload = join(root, `${R2_UPLOAD_STAGING_DIRECTORY_PREFIX}old`);
		const stalePart = join(root, `${R2_PART_STAGING_DIRECTORY_PREFIX}old`);
		const freshUpload = join(
			root,
			`${R2_UPLOAD_STAGING_DIRECTORY_PREFIX}fresh`,
		);
		const foreign = join(root, "foreign-r2-upload-old");
		await Promise.all(
			[staleUpload, stalePart, freshUpload, foreign].map((directory) =>
				mkdir(directory),
			),
		);
		const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1_000);
		await Promise.all(
			[staleUpload, stalePart, foreign].map((directory) =>
				utimes(directory, oldDate, oldDate),
			),
		);
		const ownerUid = (await stat(staleUpload)).uid;

		const removed = await scavengeStaleR2StagingDirectories({
			ownerUid,
			staleBeforeMs: Date.now() - 60 * 60 * 1_000,
			temporaryDirectory: root,
		});

		expect(new Set(removed)).toEqual(new Set([staleUpload, stalePart]));
		await expect(access(staleUpload)).rejects.toThrow();
		await expect(access(stalePart)).rejects.toThrow();
		await expect(access(freshUpload)).resolves.toBeNull();
		await expect(access(foreign)).resolves.toBeNull();

		const nonOwned = join(
			root,
			`${R2_UPLOAD_STAGING_DIRECTORY_PREFIX}non-owned`,
		);
		await mkdir(nonOwned);
		await utimes(nonOwned, oldDate, oldDate);
		const nonOwnerResult = await scavengeStaleR2StagingDirectories({
			ownerUid: ownerUid + 1,
			staleBeforeMs: Date.now() - 60 * 60 * 1_000,
			temporaryDirectory: root,
		});

		expect(nonOwnerResult).toEqual([]);
		await expect(access(nonOwned)).resolves.toBeNull();
	});
});
