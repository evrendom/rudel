import {
	afterAll,
	afterEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import postgres from "postgres";
import {
	createClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { sqlClient } from "../db.js";
import {
	type ClickHousePurgeFailureAlertData,
	getClickHousePurgeFailureAlertIdempotencyKey,
} from "../email.js";
import {
	type ClickHousePurgeProcessorEnv,
	type ClickHousePurgeTarget,
	calculateExponentialBackoffWithJitter,
	enqueueClickHousePurge,
	registerClickHousePurgeWorker,
	runClickHousePurgeWorkerOnce,
	sanitizeClickHousePurgeError,
	startClickHousePurgeWorker,
} from "../services/clickhouse-purge.service.js";
import {
	deleteOrgSessions,
	deleteUserSessions,
} from "../services/org-session.service.js";
import { deleteUserPostgresData } from "../services/user-deletion.service.js";

const TEST_RUN_ID = `clickhouse_purge_${Date.now()}_${crypto.randomUUID()}`;
const unavailableClickHouse = createClickHouseExecutor({
	url: "http://127.0.0.1:1",
});
const postgresConnectionString = getPostgresConnectionString();
const lockTimeoutSqlClient = postgres(
	withLockTimeout(postgresConnectionString, 25),
	{ max: 1 },
);
const rowLockSqlClient = postgres(postgresConnectionString, { max: 1 });

setDefaultTimeout(120_000);

afterAll(async () => {
	await Promise.all([
		unavailableClickHouse.close(),
		lockTimeoutSqlClient.end(),
		rowLockSqlClient.end(),
	]);
});

afterEach(async () => {
	await sqlClient`
		DELETE FROM clickhouse_purge_job
		WHERE target_id LIKE ${`${TEST_RUN_ID}%`}
	`;
	await sqlClient`
		DELETE FROM member
		WHERE id LIKE ${`${TEST_RUN_ID}%`}
			OR organization_id LIKE ${`${TEST_RUN_ID}%`}
			OR user_id LIKE ${`${TEST_RUN_ID}%`}
	`;
	await sqlClient`
		DELETE FROM organization
		WHERE id LIKE ${`${TEST_RUN_ID}%`}
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id LIKE ${`${TEST_RUN_ID}%`}
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

	test("counts an expired running lease as another attempt", async () => {
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
				attemptCount: 2,
				status: "succeeded",
			}),
		);
	});

	test("counts terminalizing an expired attempt as work and continues", async () => {
		const terminalTarget: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_expired_final`,
			targetType: "organization",
		};
		const runnableTarget: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_after_expired_final`,
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
				lease_expires_at,
				created_at
			)
			VALUES (
				${crypto.randomUUID()},
				${terminalTarget.targetType},
				${terminalTarget.targetId},
				'running',
				1,
				1,
				NULL,
				NOW() - INTERVAL '2 minutes',
				'abandoned-worker',
				TIMESTAMPTZ '1950-01-01 00:00:00+00',
				TIMESTAMPTZ '1960-01-01 00:00:00+00'
			)
		`;
		await enqueue(runnableTarget, 3);

		let executionCount = 0;
		const env = createProcessorEnv(async () => {
			executionCount += 1;
		});

		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		expect(executionCount).toBe(0);
		expect(await getPurgeJob(terminalTarget)).toEqual(
			expect.objectContaining({
				alertStatus: "not_required",
				attemptCount: 1,
				leaseToken: null,
				status: "failed",
			}),
		);

		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		expect(executionCount).toBe(1);
		expect(await getPurgeJob(runnableTarget)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});

	test("fails a malformed pending job already at its maximum attempts", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_pending_at_max`,
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
				next_attempt_at
			)
			VALUES (
				${crypto.randomUUID()},
				${target.targetType},
				${target.targetId},
				'pending',
				1,
				1,
				TIMESTAMPTZ '1970-01-01 00:00:00+00'
			)
		`;

		let executionCount = 0;
		const env = createProcessorEnv(async () => {
			executionCount += 1;
		});
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(false);
		expect(executionCount).toBe(0);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				lastError:
					"ClickHouse purge job reached its maximum attempts before execution",
				status: "failed",
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
		try {
			await started.wait;
			await Bun.sleep(180);

			const secondProcessed = await runClickHousePurgeWorkerOnce(
				createProcessorEnv(async () => {
					executionCount += 1;
				}, rejectUnexpectedAlert),
			);
			expect(secondProcessed).toBe(false);
		} finally {
			release.release();
		}

		expect(await firstRun).toBe(true);
		expect(executionCount).toBe(1);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});

	test("records success after a transient heartbeat database error", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_heartbeat_error`,
			targetType: "organization",
		};
		const purgeStarted = createSignal();
		const releasePurge = createSignal();
		const env = createProcessorEnv(async () => {
			purgeStarted.release();
			await releasePurge.wait;
		});
		env.leaseDurationMs = 90;
		env.sqlClient = lockTimeoutSqlClient;
		await enqueue(target, 3);

		const run = runClickHousePurgeWorkerOnce(env);
		await purgeStarted.wait;
		const rowLock = holdPurgeJobRowLock(target);
		try {
			await rowLock.acquired;
			await Bun.sleep(100);
		} finally {
			rowLock.release();
			await rowLock.completed;
			releasePurge.release();
		}

		expect(await run).toBe(true);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});

	test("allows a second worker to confirm an idempotent purge after lease expiry", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_lease_expiry_race`,
			targetType: "organization",
		};
		const firstPurgeStarted = createSignal();
		const releaseFirstPurge = createSignal();
		let executionCount = 0;
		const firstEnv = createProcessorEnv(async (claimedTarget) => {
			executionCount += 1;
			firstPurgeStarted.release();
			await releaseFirstPurge.wait;
			await executeLivePurge(claimedTarget);
		});
		firstEnv.leaseDurationMs = 90;
		firstEnv.sqlClient = lockTimeoutSqlClient;
		await enqueue(target, 3);

		const firstRun = runClickHousePurgeWorkerOnce(firstEnv);
		try {
			await firstPurgeStarted.wait;
			const rowLock = holdPurgeJobRowLock(target);
			try {
				await rowLock.acquired;
				await Bun.sleep(130);
			} finally {
				rowLock.release();
				await rowLock.completed;
			}

			const secondRun = await runClickHousePurgeWorkerOnce(
				createProcessorEnv(async (claimedTarget) => {
					executionCount += 1;
					await executeLivePurge(claimedTarget);
				}),
			);
			expect(secondRun).toBe(true);
		} finally {
			releaseFirstPurge.release();
		}

		expect(await firstRun).toBe(true);
		expect(executionCount).toBe(2);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 2,
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

	test("deduplicates active enqueue and revives a succeeded purge", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_idempotent`,
			targetType: "account",
		};
		await enqueue(target, 3);
		await enqueue(target, 7);
		expect(await countPurgeJobs(target)).toBe(1);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				maxAttempts: 3,
				status: "pending",
			}),
		);

		const env = createProcessorEnv(executeLivePurge, rejectUnexpectedAlert);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		await enqueue(target, 4);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);

		expect(await countPurgeJobs(target)).toBe(1);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				maxAttempts: 4,
				status: "succeeded",
			}),
		);
	});

	test("revives a failed purge and clears its alert state", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_revive_failed`,
			targetType: "account",
		};
		await enqueue(target, 1);
		expect(
			await runClickHousePurgeWorkerOnce(
				createProcessorEnv(executeUnavailablePurge),
			),
		).toBe(true);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				alertStatus: "not_required",
				status: "failed",
			}),
		);

		await enqueue(target, 2);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				alertAttemptCount: 0,
				alertStatus: "not_required",
				attemptCount: 0,
				failedAt: null,
				lastAttemptAt: null,
				lastError: null,
				maxAttempts: 2,
				status: "pending",
			}),
		);
	});

	test("uses a new alert identity when a revived purge fails again", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_revived_alert`,
			targetType: "account",
		};
		const alerts: ClickHousePurgeFailureAlertData[] = [];
		const env = createProcessorEnv(executeUnavailablePurge, async (alert) => {
			alerts.push(alert);
		});
		await enqueue(target, 1);

		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		const firstJob = await getPurgeJob(target);
		expect(firstJob?.alertStatus).toBe("sent");

		await enqueue(target, 1);
		expect(await runClickHousePurgeWorkerOnce(env)).toBe(true);
		const secondJob = await getPurgeJob(target);
		if (!firstJob || !secondJob) {
			throw new Error("Expected both purge failure lifecycles to be stored");
		}

		expect(alerts).toHaveLength(2);
		expect(secondJob.alertStatus).toBe("sent");
		expect(secondJob.id).not.toBe(firstJob.id);
		expect(alerts.map((alert) => alert.id)).toEqual([
			firstJob.id,
			secondJob.id,
		]);
		const alertKeys = alerts.map((alert) =>
			getClickHousePurgeFailureAlertIdempotencyKey(alert.id),
		);
		expect(new Set(alertKeys).size).toBe(2);
	});

	test("does not lose a terminal revival while another worker is claiming", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_revival_claim_race`,
			targetType: "account",
		};
		await enqueue(target, 1);
		expect(
			await runClickHousePurgeWorkerOnce(
				createProcessorEnv(executeUnavailablePurge),
			),
		).toBe(true);

		const rowLock = holdPurgeJobRowLock(target);
		await rowLock.acquired;
		const revival = enqueue(target, 2);
		try {
			expect(
				await runClickHousePurgeWorkerOnce(
					createProcessorEnv(executeLivePurge),
				),
			).toBe(false);
		} finally {
			rowLock.release();
			await rowLock.completed;
		}
		await revival;

		expect(
			await runClickHousePurgeWorkerOnce(createProcessorEnv(executeLivePurge)),
		).toBe(true);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				maxAttempts: 2,
				status: "succeeded",
			}),
		);
	});

	test("coordinates two polling workers without double-claiming jobs", async () => {
		const targetPrefix = `${TEST_RUN_ID}_two_pollers_`;
		const targets = createTargets(targetPrefix, 12);
		for (const target of targets) {
			await enqueue(target, 3);
		}

		const firstWorker = startClickHousePurgeWorker({
			pollIntervalMs: 5,
			resend: {},
		});
		const secondWorker = startClickHousePurgeWorker({
			pollIntervalMs: 5,
			resend: {},
		});
		try {
			await waitForPurgeJobCount(targetPrefix, "succeeded", targets.length);
		} finally {
			await Promise.all([firstWorker.stop(), secondWorker.stop()]);
		}

		const attempts = await getAttemptCounts(targetPrefix);
		expect(attempts).toHaveLength(targets.length);
		expect(attempts.every((attemptCount) => attemptCount === 1)).toBe(true);
	});

	test("wake triggers an immediate pass before the recovery poll", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_wake`,
			targetType: "organization",
		};
		const worker = startClickHousePurgeWorker({
			pollIntervalMs: 60_000,
			resend: {},
		});

		try {
			await worker.wake();
			await enqueue(target, 3);
			await worker.wake();
		} finally {
			await worker.stop();
		}

		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});

	test("schedules a durable retry at its due time before the recovery poll", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_scheduled_retry`,
			targetType: "organization",
		};
		await enqueue(target, 3);
		await sqlClient`
			UPDATE clickhouse_purge_job
			SET
				status = 'retrying',
				attempt_count = 1,
				next_attempt_at = NOW() + INTERVAL '2 seconds'
			WHERE target_type = ${target.targetType}
				AND target_id = ${target.targetId}
		`;

		const worker = startClickHousePurgeWorker({
			pollIntervalMs: 60_000,
			resend: {},
		});
		try {
			await Bun.sleep(100);
			expect(await getPurgeJob(target)).toEqual(
				expect.objectContaining({
					attemptCount: 1,
					status: "retrying",
				}),
			);
			await waitForPurgeJobAttemptCount(target, 2, 5_000);
		} finally {
			await worker.stop();
		}

		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 2,
				status: "succeeded",
			}),
		);
	});

	test("registered worker wakes after commit and stays quiet after rollback", async () => {
		const observedQueries: string[] = [];
		const observedSqlClient = postgres(postgresConnectionString, {
			debug: (_connection, query) => {
				observedQueries.push(query);
			},
			max: 1,
		});
		const worker = startClickHousePurgeWorker({
			pollIntervalMs: 60_000,
			resend: {},
			sqlClient: observedSqlClient,
		});

		try {
			await worker.wake();
			registerClickHousePurgeWorker(worker);
			observedQueries.length = 0;

			const committedUserId = `${TEST_RUN_ID}_committed_user`;
			await createUserRecord(committedUserId);
			await deleteUserPostgresData(committedUserId, { sqlClient });
			await waitForPurgeJobStatus(
				{ targetId: committedUserId, targetType: "account" },
				"succeeded",
				5_000,
			);
			expect(countClaimQueries(observedQueries)).toBeGreaterThan(0);

			const rolledBackUserId = `${TEST_RUN_ID}_rolled_back_user`;
			const lockedOrganizationId = `${TEST_RUN_ID}_locked_organization`;
			await createUserRecord(rolledBackUserId);
			await createOwnedOrganizationRecord(
				rolledBackUserId,
				lockedOrganizationId,
			);
			const organizationLock = holdOrganizationRowLock(lockedOrganizationId);
			await organizationLock.acquired;
			observedQueries.length = 0;
			try {
				await expect(
					deleteUserPostgresData(rolledBackUserId, {
						sqlClient: lockTimeoutSqlClient,
					}),
				).rejects.toThrow();
			} finally {
				organizationLock.release();
				await organizationLock.completed;
			}

			await Bun.sleep(100);
			expect(observedQueries).toEqual([]);
			expect(
				await countPurgeJobs({
					targetId: rolledBackUserId,
					targetType: "account",
				}),
			).toBe(0);
		} finally {
			await worker.stop();
			await observedSqlClient.end();
		}
	});

	test("coalesces wakes during an active pass into one follow-up", async () => {
		const observedQueries: string[] = [];
		const observedSqlClient = postgres(postgresConnectionString, {
			debug: (_connection, query) => {
				observedQueries.push(query);
			},
			max: 1,
		});
		const tableLock = holdPurgeJobTableLock();
		await tableLock.acquired;
		const worker = startClickHousePurgeWorker({
			pollIntervalMs: 60_000,
			resend: {},
			sqlClient: observedSqlClient,
		});

		let wakes: Promise<void>[] = [];
		try {
			await waitForObservedQuery(observedQueries, (query) =>
				query.includes("DELETE FROM clickhouse_purge_job"),
			);
			wakes = [worker.wake(), worker.wake(), worker.wake()];
			tableLock.release();
			await tableLock.completed;
			await Promise.all(wakes);

			expect(countClaimQueries(observedQueries)).toBe(2);
		} finally {
			tableLock.release();
			await tableLock.completed;
			await worker.stop();
			await observedSqlClient.end();
		}
	});

	test("empty steady state issues no Postgres query before the recovery interval", async () => {
		const observedQueries: string[] = [];
		const observedSqlClient = postgres(postgresConnectionString, {
			debug: (_connection, query) => {
				observedQueries.push(query);
			},
			max: 1,
		});
		const pollIntervalMs = 250;
		const worker = startClickHousePurgeWorker({
			pollIntervalMs,
			resend: {},
			sqlClient: observedSqlClient,
		});

		try {
			await worker.wake();
			observedQueries.length = 0;
			await Bun.sleep(Math.floor(pollIntervalMs / 2));
			expect(observedQueries).toEqual([]);
		} finally {
			await worker.stop();
			await observedSqlClient.end();
		}
	});

	test("disabled worker ignores wake requests", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_disabled`,
			targetType: "organization",
		};
		await enqueue(target, 3);
		const worker = startClickHousePurgeWorker({
			enabled: false,
			pollIntervalMs: 5,
			resend: {},
		});

		await worker.wake();
		await Bun.sleep(25);
		await worker.stop();

		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 0,
				status: "pending",
			}),
		);
	});

	test("immediately continues when a pass reaches the twenty-item cap", async () => {
		const targetPrefix = `${TEST_RUN_ID}_batching_`;
		const targets = createTargets(targetPrefix, 25);
		for (const target of targets) {
			await enqueue(target, 1);
		}
		await sqlClient`
			UPDATE clickhouse_purge_job
			SET attempt_count = max_attempts
			WHERE target_id LIKE ${`${targetPrefix}%`}
		`;

		const observedQueries: string[] = [];
		const observedSqlClient = postgres(postgresConnectionString, {
			debug: (_connection, query) => {
				observedQueries.push(query);
			},
			max: 1,
		});
		const worker = startClickHousePurgeWorker({
			pollIntervalMs: 60_000,
			resend: {},
			sqlClient: observedSqlClient,
		});
		try {
			await waitForPurgeJobCount(targetPrefix, "failed", targets.length, 5_000);
			await waitForObservedQuery(observedQueries, (query) =>
				query.includes('SELECT MIN(due_at) AS "nextDueAt"'),
			);
			expect(
				observedQueries.filter((query) =>
					query.includes('SELECT MIN(due_at) AS "nextDueAt"'),
				),
			).toHaveLength(1);
		} finally {
			await worker.stop();
			await observedSqlClient.end();
		}
	});

	test("waits for an active polling pass when the worker stops", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_stop_active`,
			targetType: "organization",
		};
		await enqueue(target, 3);
		const worker = startClickHousePurgeWorker({
			pollIntervalMs: 60_000,
			resend: {},
		});

		try {
			await waitForPurgeJobStatus(target, "running");
		} finally {
			await worker.stop();
		}

		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				attemptCount: 1,
				status: "succeeded",
			}),
		);
	});

	test("deletes only succeeded purge jobs past the retention window", async () => {
		const expiredTarget: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_expired_success`,
			targetType: "account",
		};
		const retainedTarget: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_retained_failure`,
			targetType: "account",
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
				succeeded_at
			)
			VALUES
				(
					${crypto.randomUUID()},
					${expiredTarget.targetType},
					${expiredTarget.targetId},
					'succeeded',
					1,
					1,
					NULL,
					NOW() - INTERVAL '31 days'
				),
				(
					${crypto.randomUUID()},
					${retainedTarget.targetType},
					${retainedTarget.targetId},
					'failed',
					1,
					1,
					NULL,
					NULL
				)
		`;

		const worker = startClickHousePurgeWorker({
			pollIntervalMs: 60_000,
			resend: {},
		});
		await worker.stop();

		expect(await countPurgeJobs(expiredTarget)).toBe(0);
		expect(await countPurgeJobs(retainedTarget)).toBe(1);
	});

	test("sends an alert even when legacy failure timestamps are missing", async () => {
		const target: ClickHousePurgeTarget = {
			targetId: `${TEST_RUN_ID}_missing_timestamps`,
			targetType: "organization",
		};
		const alerts: ClickHousePurgeFailureAlertData[] = [];
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
				failed_at,
				alert_status,
				alert_next_attempt_at
			)
			VALUES (
				${crypto.randomUUID()},
				${target.targetType},
				${target.targetId},
				'failed',
				1,
				1,
				NULL,
				NULL,
				NULL,
				'pending',
				TIMESTAMPTZ '1970-01-01 00:00:00+00'
			)
		`;

		expect(
			await runClickHousePurgeWorkerOnce(
				createProcessorEnv(
					async () => {
						throw new Error("Purge execution was not expected");
					},
					async (alert) => {
						alerts.push(alert);
					},
				),
			),
		).toBe(true);

		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.createdAt).toBeInstanceOf(Date);
		expect(alerts[0]?.failedAt).toBeInstanceOf(Date);
		expect(alerts[0]?.lastAttemptAt).toBeInstanceOf(Date);
		expect(await getPurgeJob(target)).toEqual(
			expect.objectContaining({
				alertStatus: "sent",
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

	test("redacts compound secret names and bare database hosts", () => {
		const sanitized = sanitizeClickHousePurgeError(
			new Error(
				"ECONNREFUSED clickhouse.internal:8123 CLICKHOUSE_PASSWORD=hunter2 X-ClickHouse-Key: supersecret",
			),
		);

		expect(sanitized).toContain("[redacted-host]");
		expect(sanitized).toContain("CLICKHOUSE_PASSWORD=[redacted]");
		expect(sanitized).toContain("X-ClickHouse-Key=[redacted]");
		expect(sanitized).not.toContain("clickhouse.internal");
		expect(sanitized).not.toContain("hunter2");
		expect(sanitized).not.toContain("supersecret");
	});

	test("sanitizes bounded causes and aggregate errors", () => {
		const sanitized = sanitizeClickHousePurgeError(
			new AggregateError(
				[
					new Error("primary failed at 10.2.3.4:8123"),
					new Error("secondary failed", {
						cause: new Error("apiToken=nested-secret"),
					}),
				],
				"ClickHouse table purges failed",
			),
		);

		expect(sanitized).toContain("ClickHouse table purges failed");
		expect(sanitized).toContain("primary failed");
		expect(sanitized).toContain("secondary failed");
		expect(sanitized).toContain("apiToken=[redacted]");
		expect(sanitized).not.toContain("10.2.3.4");
		expect(sanitized).not.toContain("nested-secret");
	});

	test("redacts IPv6, JSON-escaped secrets, and unicode separators", () => {
		const adversarialErrors = [
			{ input: "connect [2001:db8::42]:8123", secret: "2001:db8::42" },
			{ input: "connect [fe80::1%lo0]:9000", secret: "fe80::1%lo0" },
			{ input: '{"CLICKHOUSE_PASSWORD":"json-secret"}', secret: "json-secret" },
			{
				input: '{\\"X-ClickHouse-Key\\":\\"escaped-secret\\"}',
				secret: "escaped-secret",
			},
			{
				input: '{\\"Authorization\\":\\"Bearer auth-secret\\"}',
				secret: "auth-secret",
			},
		];

		for (const adversarialError of adversarialErrors) {
			const sanitized = sanitizeClickHousePurgeError(adversarialError.input);
			expect(sanitized).not.toContain(adversarialError.secret);
		}

		const separators = ["\u0085", "\u2028", "\u2029"];
		const secretKeys = ["password", "apiToken", "X-ClickHouse-Key"];
		const keyQuotes = ["", '"', '\\"'];
		const valueQuotes = ["", '"', '\\"'];
		for (const separator of separators) {
			for (const secretKey of secretKeys) {
				for (const keyQuote of keyQuotes) {
					for (const valueQuote of valueQuotes) {
						const sanitized = sanitizeClickHousePurgeError(
							`${keyQuote}${secretKey}${keyQuote}:${valueQuote}unicode-secret${valueQuote}${separator}request failed`,
						);
						expect(sanitized).not.toContain("unicode-secret");
						expect(sanitized).not.toContain(separator);
						expect(sanitized).toContain("request failed");
					}
				}
			}
		}
	});
});

function createProcessorEnv(
	executePurge: (target: ClickHousePurgeTarget) => Promise<void>,
	sendFailureAlert?: (alert: ClickHousePurgeFailureAlertData) => Promise<void>,
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
	id: string;
	lastAttemptAt: Date | string | null;
	lastError: string | null;
	leaseToken: string | null;
	maxAttempts: number;
	nextAttemptAt: Date | string | null;
	status: string;
}

async function getPurgeJob(
	target: ClickHousePurgeTarget,
): Promise<PurgeJobRow | undefined> {
	const [row] = await sqlClient<PurgeJobRow[]>`
		SELECT
			id,
			status,
			attempt_count AS "attemptCount",
			last_error AS "lastError",
			next_attempt_at AS "nextAttemptAt",
			last_attempt_at AS "lastAttemptAt",
			failed_at AS "failedAt",
			alert_status AS "alertStatus",
			alert_attempt_count AS "alertAttemptCount",
			lease_token AS "leaseToken",
			max_attempts AS "maxAttempts"
		FROM clickhouse_purge_job
		WHERE target_type = ${target.targetType}
			AND target_id = ${target.targetId}
	`;
	return row;
}

function createTargets(
	targetPrefix: string,
	count: number,
): ClickHousePurgeTarget[] {
	return Array.from({ length: count }, (_, index) => ({
		targetId: `${targetPrefix}${index}`,
		targetType: "organization",
	}));
}

async function createUserRecord(userId: string): Promise<void> {
	await sqlClient`
		INSERT INTO "user" (id, name, email)
		VALUES (${userId}, ${userId}, ${`${userId}@example.com`})
	`;
}

async function createOwnedOrganizationRecord(
	userId: string,
	organizationId: string,
): Promise<void> {
	await sqlClient.begin(async (transaction) => {
		await transaction.unsafe(
			"INSERT INTO organization (id, name, slug) VALUES ($1, $2, $3)",
			[organizationId, organizationId, organizationId],
		);
		await transaction.unsafe(
			"INSERT INTO member (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'owner')",
			[`${TEST_RUN_ID}_member_${crypto.randomUUID()}`, organizationId, userId],
		);
	});
}

function countClaimQueries(queries: readonly string[]): number {
	return queries.filter(
		(query) =>
			query.includes('attempt_count AS "attemptCount"') &&
			query.includes("FOR UPDATE SKIP LOCKED"),
	).length;
}

async function waitForObservedQuery(
	queries: readonly string[],
	predicate: (query: string) => boolean,
	timeoutMs = 5_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let observed = queries.some(predicate);
	while (!observed && Date.now() < deadline) {
		await Bun.sleep(5);
		observed = queries.some(predicate);
	}
	expect(observed).toBe(true);
}

async function waitForPurgeJobCount(
	targetPrefix: string,
	status: string,
	expectedCount: number,
	timeoutMs = 60_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let count = await countPurgeJobsByStatus(targetPrefix, status);
	while (count !== expectedCount && Date.now() < deadline) {
		await Bun.sleep(5);
		count = await countPurgeJobsByStatus(targetPrefix, status);
	}
	expect(count).toBe(expectedCount);
}

async function waitForPurgeJobStatus(
	target: ClickHousePurgeTarget,
	status: string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let job = await getPurgeJob(target);
	while (job?.status !== status && Date.now() < deadline) {
		await Bun.sleep(1);
		job = await getPurgeJob(target);
	}
	expect(job?.status).toBe(status);
}

async function waitForPurgeJobAttemptCount(
	target: ClickHousePurgeTarget,
	attemptCount: number,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let job = await getPurgeJob(target);
	while (job?.attemptCount !== attemptCount && Date.now() < deadline) {
		await Bun.sleep(1);
		job = await getPurgeJob(target);
	}
	expect(job?.attemptCount).toBe(attemptCount);
}

async function countPurgeJobsByStatus(
	targetPrefix: string,
	status: string,
): Promise<number> {
	const [row] = await sqlClient<Array<{ count: number }>>`
		SELECT COUNT(*)::int AS count
		FROM clickhouse_purge_job
		WHERE target_id LIKE ${`${targetPrefix}%`}
			AND status = ${status}
	`;
	return row?.count ?? 0;
}

async function getAttemptCounts(targetPrefix: string): Promise<number[]> {
	const rows = await sqlClient<Array<{ attemptCount: number }>>`
		SELECT attempt_count AS "attemptCount"
		FROM clickhouse_purge_job
		WHERE target_id LIKE ${`${targetPrefix}%`}
		ORDER BY target_id
	`;
	return rows.map((row) => row.attemptCount);
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

function holdPurgeJobRowLock(target: ClickHousePurgeTarget): {
	acquired: Promise<void>;
	completed: Promise<void>;
	release: () => void;
} {
	const acquired = createSignal();
	const release = createSignal();
	const completed = rowLockSqlClient.begin(async (transaction) => {
		await transaction.unsafe(
			`
				SELECT id
				FROM clickhouse_purge_job
				WHERE target_type = $1
					AND target_id = $2
				FOR UPDATE
			`,
			[target.targetType, target.targetId],
		);
		acquired.release();
		await release.wait;
	});

	return {
		acquired: acquired.wait,
		completed,
		release: release.release,
	};
}

function holdOrganizationRowLock(organizationId: string): {
	acquired: Promise<void>;
	completed: Promise<void>;
	release: () => void;
} {
	const acquired = createSignal();
	const release = createSignal();
	const completed = rowLockSqlClient.begin(async (transaction) => {
		await transaction.unsafe(
			"SELECT id FROM organization WHERE id = $1 FOR UPDATE",
			[organizationId],
		);
		acquired.release();
		await release.wait;
	});

	return {
		acquired: acquired.wait,
		completed,
		release: release.release,
	};
}

function holdPurgeJobTableLock(): {
	acquired: Promise<void>;
	completed: Promise<void>;
	release: () => void;
} {
	const acquired = createSignal();
	const release = createSignal();
	const completed = rowLockSqlClient.begin(async (transaction) => {
		await transaction.unsafe(
			"LOCK TABLE clickhouse_purge_job IN ACCESS EXCLUSIVE MODE",
		);
		acquired.release();
		await release.wait;
	});

	return {
		acquired: acquired.wait,
		completed,
		release: release.release,
	};
}

function getPostgresConnectionString(): string {
	const connectionString = process.env.PG_CONNECTION_STRING;
	if (!connectionString) {
		throw new Error("PG_CONNECTION_STRING is required for integration tests");
	}
	return connectionString;
}

function withLockTimeout(connectionString: string, timeoutMs: number): string {
	const url = new URL(connectionString);
	url.searchParams.set("options", `-c lock_timeout=${timeoutMs}ms`);
	return url.toString();
}
