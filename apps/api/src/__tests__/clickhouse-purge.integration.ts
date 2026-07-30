import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
	createClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { sqlClient } from "../db.js";
import type { ClickHousePurgeFailureAlertData } from "../email.js";
import {
	type ClickHousePurgeProcessorEnv,
	type ClickHousePurgeTarget,
	calculateExponentialBackoffWithJitter,
	enqueueClickHousePurge,
	runClickHousePurgeWorkerOnce,
	sanitizeClickHousePurgeError,
} from "../services/clickhouse-purge.service.js";
import {
	deleteOrgSessions,
	deleteUserSessions,
} from "../services/org-session.service.js";

const TEST_RUN_ID = `clickhouse_purge_${Date.now()}_${crypto.randomUUID()}`;
const unavailableClickHouse = createClickHouseExecutor({
	url: "http://127.0.0.1:1",
});

setDefaultTimeout(120_000);

afterEach(async () => {
	await sqlClient`
		DELETE FROM clickhouse_purge_job
		WHERE target_id LIKE ${`${TEST_RUN_ID}%`}
	`;
});

describe("durable ClickHouse purge worker", () => {
	test("retries a transient failure and records success after ClickHouse recovers", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_transient`,
			targetType: "organization",
		};
		await enqueue(target, 3);
		const retryBaseTime = Date.now();
		const failingEnv = createProcessorEnv(
			executeUnavailablePurge,
			rejectUnexpectedAlert,
		);
		failingEnv.now = () => new Date(retryBaseTime);

		expect(await runClickHousePurgeWorkerOnce(failingEnv)).toBe(true);
		const retryingJob = await getPurgeJob(target);
		expect(retryingJob).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "retrying",
			}),
		);
		expect(new Date(retryingJob?.nextAttemptAt ?? 0).getTime()).toBe(
			retryBaseTime + 5_625,
		);

		await makePurgeDue(target);
		expect(
			await runClickHousePurgeWorkerOnce(
				createProcessorEnv(executeLivePurge, rejectUnexpectedAlert),
			),
		).toBe(true);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				alertStatus: "not_required",
				attemptCount: 2,
				lastError: null,
				status: "succeeded",
			}),
		);
	});

	test("recovers an expired running lease without double-counting the attempt", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_restart`,
			targetType: "organization",
		};
		await sqlClient`
			INSERT INTO clickhouse_purge_job (
				id,
				target_type,
				target_id,
				status,
				attempt_count,
				max_attempts,
				next_attempt_at,
				last_attempt_at,
				lease_token,
				lease_expires_at
			)
			VALUES (
				${crypto.randomUUID()},
				${target.targetType},
				${target.targetId},
				'running',
				1,
				3,
				NULL,
				NOW() - INTERVAL '2 minutes',
				'abandoned-worker',
				NOW() - INTERVAL '1 minute'
			)
		`;

		expect(
			await runClickHousePurgeWorkerOnce(
				createProcessorEnv(executeLivePurge, rejectUnexpectedAlert),
			),
		).toBe(true);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});

	test("renews the lease while a slow purge is still running", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_heartbeat`,
			targetType: "organization",
		};
		const started = createSignal();
		const release = createSignal();
		let executionCount = 0;
		const slowEnv = createProcessorEnv(async () => {
			executionCount += 1;
			started.release();
			await release.wait;
		}, rejectUnexpectedAlert);
		slowEnv.leaseDurationMs = 90;
		await enqueue(target, 3);

		const firstRun = runClickHousePurgeWorkerOnce(slowEnv);
		await started.wait;
		await Bun.sleep(180);

		const secondProcessed = await runClickHousePurgeWorkerOnce(
			createProcessorEnv(async () => {
				executionCount += 1;
			}, rejectUnexpectedAlert),
		);
		expect(secondProcessed).toBe(false);

		release.release();
		expect(await firstRun).toBe(true);
		expect(executionCount).toBe(1);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});

	test("does not overwrite state after losing a lease", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_lost_lease`,
			targetType: "account",
		};
		await enqueue(target, 3);
		const env = createProcessorEnv(async () => {
			await sqlClient`
				UPDATE clickhouse_purge_job
				SET
					lease_token = 'replacement-worker',
					lease_expires_at = NOW() + INTERVAL '1 minute'
				WHERE target_type = ${target.targetType}
					AND target_id = ${target.targetId}
			`;
		}, rejectUnexpectedAlert);

		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				leaseToken: "replacement-worker",
				status: "running",
			}),
		);
	});

	test("stops after exhaustion and sends one terminal alert", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_exhausted`,
			targetType: "account",
		};
		const alerts: ClickHousePurgeFailureAlertData[] = [];
		const env = createProcessorEnv(executeUnavailablePurge, async (alert) => {
			alerts.push(alert);
		});
		await enqueue(target, 2);

		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		await makePurgeDue(target);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(false);

		const job = await getPurgeJob(target);
		expect(job).toEqual(
			expect.objectContaining({
				alertAttemptCount: 1,
				alertStatus: "sent",
				attemptCount: 2,
				status: "failed",
			}),
		);
		expectValidTimestamp(job?.failedAt);
		expectValidTimestamp(job?.lastAttemptAt);
		expect(job?.lastError).not.toContain("127.0.0.1");
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toEqual(
			expect.objectContaining({
				attemptCount: 2,
				targetId: target.targetId,
				targetType: target.targetType,
			}),
		);
		expect(alerts[0]?.createdAt).toBeInstanceOf(Date);
		expect(alerts[0]?.failedAt).toBeInstanceOf(Date);
		expect(alerts[0]?.lastAttemptAt).toBeInstanceOf(Date);
	});

	test("does not queue a terminal alert when alerts are disabled", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_alerts_disabled`,
			targetType: "account",
		};
		const env = createProcessorEnv(
			executeUnavailablePurge,
			rejectUnexpectedAlert,
		);
		env.sendFailureAlert = undefined;
		await enqueue(target, 1);

		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				alertStatus: "not_required",
				attemptCount: 1,
				status: "failed",
			}),
		);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(false);
	});

	test("deduplicates enqueue and leaves a succeeded replay unchanged", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_idempotent`,
			targetType: "account",
		};
		await enqueue(target, 3);
		await enqueue(target, 3);
		expect(await countPurgeJobs(target)).toBe(1);

		const env = createProcessorEnv(executeLivePurge, rejectUnexpectedAlert);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		await enqueue(target, 3);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(false);
		await executeLivePurge(target);

		expect(await countPurgeJobs(target)).toBe(1);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});
});

describe("ClickHouse purge error sanitization", () => {
	test("uses capped exponential backoff with bounded jitter", () => {
		expect(calculateExponentialBackoffWithJitter(1, 0, 100, 1_000)).toBe(100);
		expect(calculateExponentialBackoffWithJitter(2, 0.5, 100, 1_000)).toBe(225);
		expect(calculateExponentialBackoffWithJitter(10, 1, 100, 1_000)).toBe(
			1_000,
		);
	});

	test("removes connection details and secrets before persistence", () => {
		const sanitized = sanitizeClickHousePurgeError(
			new Error(
				"connect https://admin:secret@clickhouse.example.test/query password=hunter2 authorization=Bearer-secret",
			),
		);

		expect(sanitized).toContain("[redacted-url]");
		expect(sanitized).toContain("password=[redacted]");
		expect(sanitized).toContain("authorization=[redacted]");
		expect(sanitized).not.toContain("hunter2");
		expect(sanitized).not.toContain("admin:secret");
	});

	test("redacts the complete Authorization scheme and credential", () => {
		const sanitized = sanitizeClickHousePurgeError(
			new Error(
				"Authorization: Bearer supersecret\nClickHouse request timed out",
			),
		);

		expect(sanitized).toContain("authorization=[redacted]");
		expect(sanitized).toContain("ClickHouse request timed out");
		expect(sanitized).not.toContain("Bearer");
		expect(sanitized).not.toContain("supersecret");
	});
});

function createProcessorEnv(
	executePurge: (target: ClickHousePurgeTarget) => Promise<void>,
	sendFailureAlert: (alert: ClickHousePurgeFailureAlertData) => Promise<void>,
): ClickHousePurgeProcessorEnv {
	return {
		executePurge,
		leaseDurationMs: 60_000,
		now: () => new Date(),
		random: () => 0.5,
		sendFailureAlert,
		sqlClient,
	};
}

async function enqueue(
	target: ClickHousePurgeTarget,
	maxAttempts: number,
): Promise<void> {
	await sqlClient.begin((transaction) =>
		enqueueClickHousePurge(target, transaction, maxAttempts),
	);
	await sqlClient`
		UPDATE clickhouse_purge_job
		SET
			next_attempt_at = TIMESTAMPTZ '1970-01-01 00:00:00+00',
			created_at = TIMESTAMPTZ '1970-01-01 00:00:00+00'
		WHERE target_type = ${target.targetType}
			AND target_id = ${target.targetId}
			AND status = 'pending'
	`;
}

async function executeUnavailablePurge(
	target: ClickHousePurgeTarget,
): Promise<void> {
	const field =
		target.targetType === "organization" ? "organization_id" : "user_id";
	await unavailableClickHouse.execute({
		query: `DELETE FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE ${field} = {targetId:String}`,
		query_params: { targetId: target.targetId },
	});
}

async function executeLivePurge(target: ClickHousePurgeTarget): Promise<void> {
	if (target.targetType === "organization") {
		await deleteOrgSessions(target.targetId);
		return;
	}
	await deleteUserSessions(target.targetId);
}

async function rejectUnexpectedAlert(): Promise<void> {
	throw new Error("Purge alert was not expected");
}

async function makePurgeDue(target: ClickHousePurgeTarget): Promise<void> {
	await sqlClient`
		UPDATE clickhouse_purge_job
		SET next_attempt_at = TIMESTAMPTZ '1970-01-01 00:00:00+00'
		WHERE target_type = ${target.targetType}
			AND target_id = ${target.targetId}
	`;
}

interface PurgeJobRow {
	alertAttemptCount: number;
	alertStatus: string;
	attemptCount: number;
	failedAt: Date | string | null;
	lastAttemptAt: Date | string | null;
	lastError: string | null;
	leaseToken: string | null;
	nextAttemptAt: Date | string | null;
	status: string;
}

async function getPurgeJob(
	target: ClickHousePurgeTarget,
): Promise<PurgeJobRow | undefined> {
	const [row] = await sqlClient<PurgeJobRow[]>`
		SELECT
			status,
			attempt_count AS "attemptCount",
			last_error AS "lastError",
			next_attempt_at AS "nextAttemptAt",
			last_attempt_at AS "lastAttemptAt",
			failed_at AS "failedAt",
			alert_status AS "alertStatus",
			alert_attempt_count AS "alertAttemptCount",
			lease_token AS "leaseToken"
		FROM clickhouse_purge_job
		WHERE target_type = ${target.targetType}
			AND target_id = ${target.targetId}
	`;
	return row;
}

async function countPurgeJobs(target: ClickHousePurgeTarget): Promise<number> {
	const [row] = await sqlClient<Array<{ count: number }>>`
		SELECT COUNT(*)::int AS count
		FROM clickhouse_purge_job
		WHERE target_type = ${target.targetType}
			AND target_id = ${target.targetId}
	`;
	return row?.count ?? 0;
}

function expectValidTimestamp(value: Date | string | null | undefined): void {
	expect(value).not.toBeNull();
	expect(value).not.toBeUndefined();
	const timestamp = value instanceof Date ? value : new Date(value ?? "");
	expect(Number.isNaN(timestamp.getTime())).toBe(false);
}

function createSignal(): { release: () => void; wait: Promise<void> } {
	let releaseSignal: () => void = () => {};
	const wait = new Promise<void>((resolve) => {
		releaseSignal = resolve;
	});
	return { release: releaseSignal, wait };
}
