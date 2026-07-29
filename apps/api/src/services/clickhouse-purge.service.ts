import { getLogger } from "@logtape/logtape";
import type postgres from "postgres";
import { sqlClient } from "../db.js";
import {
	type ClickHousePurgeFailureAlertData,
	type ResendConfig,
	sendClickHousePurgeFailureAlert,
} from "../email.js";
import { readPositiveSafeIntegerEnv } from "../lib/env.js";
import {
	deleteOrgSessions,
	deleteUserSessions,
} from "./org-session.service.js";

const logger = getLogger(["rudel", "api", "clickhouse-purge"]);

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_LEASE_DURATION_MS = 3 * 60_000;
const DEFAULT_RETRY_BASE_DELAY_MS = 5_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 15 * 60_000;
const DEFAULT_ALERT_RETRY_BASE_DELAY_MS = 30_000;
const DEFAULT_ALERT_RETRY_MAX_DELAY_MS = 60 * 60_000;
const MAX_WORK_ITEMS_PER_PASS = 20;
const MAX_SANITIZED_ERROR_LENGTH = 800;
const CONFIGURED_MAX_ATTEMPTS = readPositiveSafeIntegerEnv(
	"CLICKHOUSE_PURGE_MAX_ATTEMPTS",
	DEFAULT_MAX_ATTEMPTS,
);

export type ClickHousePurgeTarget =
	| { targetId: string; targetType: "account" }
	| { targetId: string; targetType: "organization" };

export type ClickHousePurgeFailureAlert = ClickHousePurgeFailureAlertData;

export interface ClickHousePurgeProcessorEnv {
	executePurge: (target: ClickHousePurgeTarget) => Promise<void>;
	leaseDurationMs: number;
	now: () => Date;
	random: () => number;
	sendFailureAlert: (alert: ClickHousePurgeFailureAlert) => Promise<void>;
	sqlClient: postgres.Sql;
}

export interface ClickHousePurgeWorker {
	stop: () => Promise<void>;
}

interface ClaimedPurgeJob {
	attemptCount: number;
	id: string;
	leaseToken: string;
	maxAttempts: number;
	targetId: string;
	targetType: "account" | "organization";
}

interface ClaimedPurgeAlert extends ClickHousePurgeFailureAlert {
	alertAttemptCount: number;
	leaseToken: string;
}

interface ClaimedPurgeAlertRow {
	alertAttemptCount: number;
	attemptCount: number;
	createdAt: Date | string;
	failedAt: Date | string | null;
	id: string;
	lastAttemptAt: Date | string | null;
	lastError: string | null;
	leaseToken: string;
	targetId: string;
	targetType: "account" | "organization";
}

export interface StartClickHousePurgeWorkerOptions {
	pollIntervalMs?: number;
	resend: ResendConfig;
}

export async function enqueueClickHousePurge(
	target: ClickHousePurgeTarget,
	transaction: postgres.TransactionSql,
	maxAttempts = CONFIGURED_MAX_ATTEMPTS,
): Promise<void> {
	if (!target.targetId.trim()) {
		throw new Error("ClickHouse purge target ID must not be empty");
	}
	if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
		throw new Error("ClickHouse purge max attempts must be a positive integer");
	}

	await transaction.unsafe(
		`
			INSERT INTO clickhouse_purge_job (
				id,
				target_type,
				target_id,
				max_attempts
			)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (target_type, target_id) DO NOTHING
		`,
		[crypto.randomUUID(), target.targetType, target.targetId, maxAttempts],
	);
}

export function startClickHousePurgeWorker(
	options: StartClickHousePurgeWorkerOptions,
): ClickHousePurgeWorker {
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const env: ClickHousePurgeProcessorEnv = {
		executePurge: async (target) => {
			if (target.targetType === "organization") {
				await deleteOrgSessions(target.targetId);
				return;
			}
			await deleteUserSessions(target.targetId);
		},
		leaseDurationMs: DEFAULT_LEASE_DURATION_MS,
		now: () => new Date(),
		random: Math.random,
		sendFailureAlert: (alert) =>
			sendClickHousePurgeFailureAlert(options.resend, alert),
		sqlClient,
	};

	let activeRun = Promise.resolve();
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const scheduleNextRun = () => {
		if (stopped) {
			return;
		}
		timer = setTimeout(() => {
			activeRun = runWorkerPass();
		}, pollIntervalMs);
		timer.unref();
	};

	const runWorkerPass = async () => {
		try {
			for (
				let processed = 0;
				processed < MAX_WORK_ITEMS_PER_PASS;
				processed++
			) {
				if (stopped || !(await runClickHousePurgeWorkerOnce(env))) {
					break;
				}
			}
		} catch (error) {
			logger.error("ClickHouse purge worker pass failed: {error}", {
				error: sanitizeClickHousePurgeError(error),
			});
		} finally {
			scheduleNextRun();
		}
	};

	activeRun = runWorkerPass();

	return {
		async stop() {
			stopped = true;
			if (timer) {
				clearTimeout(timer);
			}
			await activeRun;
		},
	};
}

export async function runClickHousePurgeWorkerOnce(
	env: ClickHousePurgeProcessorEnv,
): Promise<boolean> {
	const purgeJob = await claimNextPurgeJob(env);
	if (purgeJob) {
		await processClaimedPurgeJob(purgeJob, env);
	}

	const purgeAlert = await claimNextPurgeAlert(env);
	if (purgeAlert) {
		await processClaimedPurgeAlert(purgeAlert, env);
	}

	return purgeJob !== null || purgeAlert !== null;
}

export function calculateExponentialBackoffWithJitter(
	attemptCount: number,
	randomValue: number,
	baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
	maxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
): number {
	const safeAttemptCount = Math.max(1, attemptCount);
	const exponentialDelay = Math.min(
		maxDelayMs,
		baseDelayMs * 2 ** (safeAttemptCount - 1),
	);
	const boundedRandomValue = Math.min(1, Math.max(0, randomValue));
	const jitter = Math.floor(exponentialDelay * 0.25 * boundedRandomValue);
	return Math.min(maxDelayMs, exponentialDelay + jitter);
}

export function sanitizeClickHousePurgeError(error: unknown): string {
	const rawMessage =
		error instanceof Error
			? `${error.name}: ${error.message}`
			: typeof error === "string"
				? error
				: "Unknown ClickHouse purge error";

	return rawMessage
		.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu, "[redacted-url]")
		.replace(
			/\b(authorization|credential|password|secret|token|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/giu,
			"$1=[redacted]",
		)
		.replace(/[\r\n\t]+/gu, " ")
		.replace(/\s{2,}/gu, " ")
		.trim()
		.slice(0, MAX_SANITIZED_ERROR_LENGTH);
}

async function claimNextPurgeJob(
	env: ClickHousePurgeProcessorEnv,
): Promise<ClaimedPurgeJob | null> {
	const leaseToken = crypto.randomUUID();

	return env.sqlClient.begin(async (transaction) => {
		const [candidate] = await transaction.unsafe<Array<{ id: string }>>(
			`
				SELECT id
				FROM clickhouse_purge_job
				WHERE (
					status IN ('pending', 'retrying')
					AND next_attempt_at <= NOW()
				) OR (
					status = 'running'
					AND lease_expires_at <= NOW()
				)
				ORDER BY next_attempt_at ASC, created_at ASC
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			`,
		);

		if (!candidate) {
			return null;
		}

		const [claimed] = await transaction.unsafe<ClaimedPurgeJob[]>(
			`
				UPDATE clickhouse_purge_job
				SET
					status = 'running',
					attempt_count = attempt_count + 1,
					last_attempt_at = NOW(),
					lease_token = $1,
					lease_expires_at = NOW() + $2::bigint * INTERVAL '1 millisecond',
					updated_at = NOW()
				WHERE id = $3
				RETURNING
					id,
					target_type AS "targetType",
					target_id AS "targetId",
					attempt_count AS "attemptCount",
					max_attempts AS "maxAttempts",
					lease_token AS "leaseToken"
			`,
			[leaseToken, env.leaseDurationMs, candidate.id],
		);

		return claimed ?? null;
	});
}

async function processClaimedPurgeJob(
	job: ClaimedPurgeJob,
	env: ClickHousePurgeProcessorEnv,
): Promise<void> {
	try {
		await env.executePurge({
			targetId: job.targetId,
			targetType: job.targetType,
		});
		await markPurgeSucceeded(job, env);
		logger.info(
			"ClickHouse purge succeeded (job_id={jobId} target_type={targetType} target_id={targetId} attempts={attemptCount})",
			{
				attemptCount: job.attemptCount,
				jobId: job.id,
				targetId: job.targetId,
				targetType: job.targetType,
			},
		);
	} catch (error) {
		const sanitizedError = sanitizeClickHousePurgeError(error);
		await markPurgeFailedAttempt(job, sanitizedError, env);

		if (job.attemptCount >= job.maxAttempts) {
			logger.error(
				"ClickHouse purge permanently failed (job_id={jobId} target_type={targetType} target_id={targetId} attempts={attemptCount} error={error})",
				{
					attemptCount: job.attemptCount,
					error: sanitizedError,
					jobId: job.id,
					targetId: job.targetId,
					targetType: job.targetType,
				},
			);
			return;
		}

		logger.warn(
			"ClickHouse purge attempt failed and will retry (job_id={jobId} target_type={targetType} target_id={targetId} attempt={attemptCount}/{maxAttempts} error={error})",
			{
				attemptCount: job.attemptCount,
				error: sanitizedError,
				jobId: job.id,
				maxAttempts: job.maxAttempts,
				targetId: job.targetId,
				targetType: job.targetType,
			},
		);
	}
}

async function markPurgeSucceeded(
	job: ClaimedPurgeJob,
	env: ClickHousePurgeProcessorEnv,
): Promise<void> {
	await env.sqlClient`
		UPDATE clickhouse_purge_job
		SET
			status = 'succeeded',
			last_error = NULL,
			next_attempt_at = NULL,
			succeeded_at = NOW(),
			lease_token = NULL,
			lease_expires_at = NULL,
			updated_at = NOW()
		WHERE id = ${job.id}
			AND lease_token = ${job.leaseToken}
	`;
}

async function markPurgeFailedAttempt(
	job: ClaimedPurgeJob,
	sanitizedError: string,
	env: ClickHousePurgeProcessorEnv,
): Promise<void> {
	if (job.attemptCount >= job.maxAttempts) {
		await env.sqlClient`
			UPDATE clickhouse_purge_job
			SET
				status = 'failed',
				last_error = ${sanitizedError},
				next_attempt_at = NULL,
				failed_at = NOW(),
				alert_status = 'pending',
				alert_next_attempt_at = NOW(),
				lease_token = NULL,
				lease_expires_at = NULL,
				updated_at = NOW()
			WHERE id = ${job.id}
				AND lease_token = ${job.leaseToken}
		`;
		return;
	}

	const retryDelayMs = calculateExponentialBackoffWithJitter(
		job.attemptCount,
		env.random(),
	);
	const nextAttemptAt = new Date(
		env.now().getTime() + retryDelayMs,
	).toISOString();
	await env.sqlClient`
		UPDATE clickhouse_purge_job
		SET
			status = 'retrying',
			last_error = ${sanitizedError},
			next_attempt_at = ${nextAttemptAt},
			lease_token = NULL,
			lease_expires_at = NULL,
			updated_at = NOW()
		WHERE id = ${job.id}
			AND lease_token = ${job.leaseToken}
	`;
}

async function claimNextPurgeAlert(
	env: ClickHousePurgeProcessorEnv,
): Promise<ClaimedPurgeAlert | null> {
	const leaseToken = crypto.randomUUID();

	return env.sqlClient.begin(async (transaction) => {
		const [candidate] = await transaction.unsafe<Array<{ id: string }>>(
			`
				SELECT id
				FROM clickhouse_purge_job
				WHERE status = 'failed'
					AND alert_sent_at IS NULL
					AND (
						(
							alert_status IN ('pending', 'retrying')
							AND alert_next_attempt_at <= NOW()
						) OR (
							alert_status = 'sending'
							AND lease_expires_at <= NOW()
						)
					)
				ORDER BY alert_next_attempt_at ASC, failed_at ASC
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			`,
		);

		if (!candidate) {
			return null;
		}

		const [claimed] = await transaction.unsafe<ClaimedPurgeAlertRow[]>(
			`
				UPDATE clickhouse_purge_job
				SET
					alert_status = 'sending',
					alert_attempt_count = alert_attempt_count + 1,
					lease_token = $1,
					lease_expires_at = NOW() + $2::bigint * INTERVAL '1 millisecond',
					updated_at = NOW()
				WHERE id = $3
				RETURNING
					id,
					target_type AS "targetType",
					target_id AS "targetId",
					attempt_count AS "attemptCount",
					last_error AS "lastError",
					created_at AS "createdAt",
					last_attempt_at AS "lastAttemptAt",
					failed_at AS "failedAt",
					alert_attempt_count AS "alertAttemptCount",
					lease_token AS "leaseToken"
			`,
			[leaseToken, env.leaseDurationMs, candidate.id],
		);

		if (!claimed) {
			return null;
		}

		return {
			alertAttemptCount: claimed.alertAttemptCount,
			attemptCount: claimed.attemptCount,
			createdAt: readRequiredTimestamp(claimed.createdAt, "created_at"),
			failedAt: readRequiredTimestamp(claimed.failedAt, "failed_at"),
			id: claimed.id,
			lastAttemptAt: readRequiredTimestamp(
				claimed.lastAttemptAt,
				"last_attempt_at",
			),
			lastError:
				claimed.lastError ?? "No sanitized error details were recorded",
			leaseToken: claimed.leaseToken,
			targetId: claimed.targetId,
			targetType: claimed.targetType,
		};
	});
}

async function processClaimedPurgeAlert(
	alert: ClaimedPurgeAlert,
	env: ClickHousePurgeProcessorEnv,
): Promise<void> {
	try {
		await env.sendFailureAlert(alert);
		await env.sqlClient`
			UPDATE clickhouse_purge_job
			SET
				alert_status = 'sent',
				alert_last_error = NULL,
				alert_next_attempt_at = NULL,
				alert_sent_at = NOW(),
				lease_token = NULL,
				lease_expires_at = NULL,
				updated_at = NOW()
			WHERE id = ${alert.id}
				AND lease_token = ${alert.leaseToken}
		`;
		logger.info("ClickHouse purge failure alert sent (job_id={jobId})", {
			jobId: alert.id,
		});
	} catch (error) {
		const sanitizedError = sanitizeClickHousePurgeError(error);
		const retryDelayMs = calculateExponentialBackoffWithJitter(
			alert.alertAttemptCount,
			env.random(),
			DEFAULT_ALERT_RETRY_BASE_DELAY_MS,
			DEFAULT_ALERT_RETRY_MAX_DELAY_MS,
		);
		const nextAttemptAt = new Date(
			env.now().getTime() + retryDelayMs,
		).toISOString();

		await env.sqlClient`
			UPDATE clickhouse_purge_job
			SET
				alert_status = 'retrying',
				alert_last_error = ${sanitizedError},
				alert_next_attempt_at = ${nextAttemptAt},
				lease_token = NULL,
				lease_expires_at = NULL,
				updated_at = NOW()
			WHERE id = ${alert.id}
				AND lease_token = ${alert.leaseToken}
		`;
		logger.error(
			"ClickHouse purge failure alert delivery failed and will retry (job_id={jobId} error={error})",
			{ error: sanitizedError, jobId: alert.id },
		);
	}
}

function readRequiredTimestamp(
	value: Date | string | null,
	fieldName: string,
): Date {
	if (value === null) {
		throw new Error(`ClickHouse purge alert is missing ${fieldName}`);
	}

	const timestamp = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(timestamp.getTime())) {
		throw new Error(`ClickHouse purge alert has an invalid ${fieldName}`);
	}
	return timestamp;
}
