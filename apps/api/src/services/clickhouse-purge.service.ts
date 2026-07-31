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
const SUCCEEDED_JOB_RETENTION_MS = 30 * 24 * 60 * 60_000;
const SUCCEEDED_JOB_CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;
const MAX_WORK_ITEMS_PER_PASS = 20;
const MAX_ERROR_SEGMENTS = 8;
const MAX_ERROR_DEPTH = 4;
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
	sendFailureAlert?: (alert: ClickHousePurgeFailureAlert) => Promise<void>;
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
	targetType: ClickHousePurgeTarget["targetType"];
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
	targetType: ClickHousePurgeTarget["targetType"];
}

interface PurgeJobCandidate {
	attemptCount: number;
	id: string;
	maxAttempts: number;
	status: "pending" | "retrying" | "running";
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
			ON CONFLICT (target_type, target_id) DO UPDATE
			SET
				status = 'pending',
				attempt_count = 0,
				max_attempts = EXCLUDED.max_attempts,
				last_error = NULL,
				next_attempt_at = NOW(),
				last_attempt_at = NULL,
				succeeded_at = NULL,
				failed_at = NULL,
				alert_status = 'not_required',
				alert_attempt_count = 0,
				alert_last_error = NULL,
				alert_next_attempt_at = NULL,
				alert_sent_at = NULL,
				lease_token = NULL,
				lease_expires_at = NULL,
				created_at = NOW(),
				updated_at = NOW()
			WHERE clickhouse_purge_job.status IN ('succeeded', 'failed')
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
		sendFailureAlert:
			options.resend.apiKey &&
			options.resend.fromEmail &&
			options.resend.clickHousePurgeAlertRecipient
				? (alert) => sendClickHousePurgeFailureAlert(options.resend, alert)
				: undefined,
		sqlClient,
	};

	let activeRun = Promise.resolve();
	let nextCleanupAt = 0;
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
			const now = Date.now();
			if (now >= nextCleanupAt) {
				nextCleanupAt = now + SUCCEEDED_JOB_CLEANUP_INTERVAL_MS;
				try {
					await deleteExpiredSucceededPurgeJobs(env.sqlClient);
				} catch (error) {
					logger.error(
						"ClickHouse purge job retention cleanup failed: {error}",
						{ error: sanitizeClickHousePurgeError(error) },
					);
				}
			}

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

	const sendFailureAlert = env.sendFailureAlert;
	if (!sendFailureAlert) {
		return purgeJob !== null;
	}

	const purgeAlert = await claimNextPurgeAlert(env);
	if (purgeAlert) {
		await processClaimedPurgeAlert(purgeAlert, sendFailureAlert, env);
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
	const rawMessage = collectErrorSegments(error).join("; ");

	return rawMessage
		.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu, "[redacted-url]")
		.replace(
			/\bauthorization\b["']?\s*[:=]\s*["']?[^\r\n]*/giu,
			"authorization=[redacted]",
		)
		.replace(
			/\b([\w-]*(?:credential|password|secret|token|key)[\w-]*)\b\s*[:=]\s*[^\s,;]+/giu,
			"$1=[redacted]",
		)
		.replace(
			/\b(?:(?:\d{1,3}\.){3}\d{1,3}|localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?):\d{1,5}\b/giu,
			"[redacted-host]",
		)
		.replace(/[\r\n\t]+/gu, " ")
		.replace(/\s{2,}/gu, " ")
		.trim()
		.slice(0, MAX_SANITIZED_ERROR_LENGTH);
}

function collectErrorSegments(error: unknown): string[] {
	const segments: string[] = [];
	const seen = new Set<Error>();

	const visit = (value: unknown, depth: number): void => {
		if (depth > MAX_ERROR_DEPTH || segments.length >= MAX_ERROR_SEGMENTS) {
			return;
		}
		if (typeof value === "string") {
			segments.push(value);
			return;
		}
		if (!(value instanceof Error) || seen.has(value)) {
			return;
		}

		seen.add(value);
		segments.push(`${value.name}: ${value.message}`);

		if (value instanceof AggregateError) {
			for (const nestedError of value.errors) {
				visit(nestedError, depth + 1);
				if (segments.length >= MAX_ERROR_SEGMENTS) {
					break;
				}
			}
		}
		visit(value.cause, depth + 1);
	};

	visit(error, 0);
	return segments.length > 0 ? segments : ["Unknown ClickHouse purge error"];
}

async function deleteExpiredSucceededPurgeJobs(
	database: postgres.Sql,
): Promise<void> {
	await database`
		DELETE FROM clickhouse_purge_job
		WHERE status = 'succeeded'
			AND succeeded_at < NOW() - ${SUCCEEDED_JOB_RETENTION_MS}::bigint * INTERVAL '1 millisecond'
	`;
}

async function claimNextPurgeJob(
	env: ClickHousePurgeProcessorEnv,
): Promise<ClaimedPurgeJob | null> {
	const leaseToken = crypto.randomUUID();

	return env.sqlClient.begin(async (transaction) => {
		const [candidate] = await transaction.unsafe<PurgeJobCandidate[]>(
			`
				SELECT
					id,
					status,
					attempt_count AS "attemptCount",
					max_attempts AS "maxAttempts"
				FROM clickhouse_purge_job
				WHERE (
					status IN ('pending', 'retrying')
					AND next_attempt_at <= NOW()
				) OR (
					status = 'running'
					AND lease_expires_at <= NOW()
				)
				ORDER BY
					COALESCE(next_attempt_at, lease_expires_at) ASC,
					created_at ASC
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			`,
		);

		if (!candidate) {
			return null;
		}

		if (
			candidate.status === "running" &&
			candidate.attemptCount >= candidate.maxAttempts
		) {
			const alertsEnabled = env.sendFailureAlert !== undefined;
			await transaction.unsafe(
				`
					UPDATE clickhouse_purge_job
					SET
						status = 'failed',
						last_error = 'ClickHouse purge worker lease expired after the final attempt',
						failed_at = NOW(),
						alert_status = CASE
							WHEN $1 THEN 'pending'
							ELSE 'not_required'
						END,
						alert_next_attempt_at = CASE
							WHEN $1 THEN NOW()
							ELSE NULL
						END,
						lease_token = NULL,
						lease_expires_at = NULL,
						updated_at = NOW()
					WHERE id = $2
				`,
				[alertsEnabled, candidate.id],
			);
			return null;
		}

		const [claimed] = await transaction.unsafe<ClaimedPurgeJob[]>(
			`
				UPDATE clickhouse_purge_job
				SET
					status = 'running',
					attempt_count = attempt_count + 1,
					last_attempt_at = NOW(),
					next_attempt_at = NULL,
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
	const heartbeat = startPurgeLeaseHeartbeat(job, env);
	let purgeError: unknown;

	try {
		await env.executePurge({
			targetId: job.targetId,
			targetType: job.targetType,
		});
	} catch (error) {
		purgeError = error;
	}

	const heartbeatError = await heartbeat.stop();
	if (purgeError !== undefined && purgeError !== null) {
		await handleClickHousePurgeFailure(job, purgeError, env);
		return;
	}
	if (heartbeatError) {
		logger.warn(
			"ClickHouse purge completed after a lease heartbeat error; the lease-guarded update will confirm ownership (job_id={jobId} error={error})",
			{
				error: sanitizeClickHousePurgeError(heartbeatError),
				jobId: job.id,
			},
		);
	}

	const markedSucceeded = await markPurgeSucceeded(job, env);
	if (!markedSucceeded) {
		logger.warn(
			"ClickHouse purge completed after its lease was lost; a current worker will confirm the idempotent purge (job_id={jobId})",
			{ jobId: job.id },
		);
		return;
	}

	logger.info(
		"ClickHouse purge succeeded (job_id={jobId} target_type={targetType} target_id={targetId} attempts={attemptCount})",
		{
			attemptCount: job.attemptCount,
			jobId: job.id,
			targetId: job.targetId,
			targetType: job.targetType,
		},
	);
}

async function handleClickHousePurgeFailure(
	job: ClaimedPurgeJob,
	error: unknown,
	env: ClickHousePurgeProcessorEnv,
): Promise<void> {
	const sanitizedError = sanitizeClickHousePurgeError(error);
	const exhausted = job.attemptCount >= job.maxAttempts;
	const nextAttemptAt = exhausted
		? null
		: new Date(
				env.now().getTime() +
					calculateExponentialBackoffWithJitter(job.attemptCount, env.random()),
			);
	const markedFailed = await markPurgeFailedAttempt(
		job,
		sanitizedError,
		nextAttemptAt,
		env,
	);

	if (!markedFailed) {
		logger.warn(
			"ClickHouse purge attempt finished after its lease was lost; state was left to the current worker (job_id={jobId})",
			{ jobId: job.id },
		);
		return;
	}

	if (exhausted) {
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

function startPurgeLeaseHeartbeat(
	job: ClaimedPurgeJob,
	env: ClickHousePurgeProcessorEnv,
): { stop: () => Promise<Error | null> } {
	const intervalMs = Math.max(25, Math.floor(env.leaseDurationMs / 3));
	let activeHeartbeat = Promise.resolve();
	let heartbeatError: Error | null = null;

	const timer = setInterval(() => {
		activeHeartbeat = activeHeartbeat.then(async () => {
			if (heartbeatError) {
				return;
			}
			try {
				const renewed = await renewClickHousePurgeJobLease(
					job,
					env.leaseDurationMs,
					env,
				);
				if (!renewed) {
					heartbeatError = new Error(
						"ClickHouse purge lease was lost during execution",
					);
				}
			} catch (error) {
				heartbeatError =
					error instanceof Error
						? error
						: new Error("ClickHouse purge lease renewal failed");
			}
		});
	}, intervalMs);
	timer.unref();

	return {
		async stop() {
			clearInterval(timer);
			await activeHeartbeat;
			return heartbeatError;
		},
	};
}

async function renewClickHousePurgeJobLease(
	job: ClaimedPurgeJob,
	leaseDurationMs: number,
	env: ClickHousePurgeProcessorEnv,
): Promise<boolean> {
	const renewed = await env.sqlClient<Array<{ id: string }>>`
		UPDATE clickhouse_purge_job
		SET
			lease_expires_at = NOW() + ${leaseDurationMs}::bigint * INTERVAL '1 millisecond',
			updated_at = NOW()
		WHERE id = ${job.id}
			AND status = 'running'
			AND lease_token = ${job.leaseToken}
		RETURNING id
	`;
	return renewed.length === 1;
}

async function markPurgeSucceeded(
	job: ClaimedPurgeJob,
	env: ClickHousePurgeProcessorEnv,
): Promise<boolean> {
	const updated = await env.sqlClient<Array<{ id: string }>>`
		UPDATE clickhouse_purge_job
		SET
			status = 'succeeded',
			last_error = NULL,
			succeeded_at = NOW(),
			lease_token = NULL,
			lease_expires_at = NULL,
			updated_at = NOW()
		WHERE id = ${job.id}
			AND status = 'running'
			AND lease_token = ${job.leaseToken}
		RETURNING id
	`;
	return updated.length === 1;
}

async function markPurgeFailedAttempt(
	job: ClaimedPurgeJob,
	sanitizedError: string,
	nextAttemptAt: Date | null,
	env: ClickHousePurgeProcessorEnv,
): Promise<boolean> {
	if (nextAttemptAt === null) {
		const alertsEnabled = env.sendFailureAlert !== undefined;
		const updated = await env.sqlClient<Array<{ id: string }>>`
			UPDATE clickhouse_purge_job
			SET
				status = 'failed',
				last_error = ${sanitizedError},
				failed_at = NOW(),
				alert_status = CASE
					WHEN ${alertsEnabled} THEN 'pending'
					ELSE 'not_required'
				END,
				alert_next_attempt_at = CASE
					WHEN ${alertsEnabled} THEN NOW()
					ELSE NULL
				END,
				lease_token = NULL,
				lease_expires_at = NULL,
				updated_at = NOW()
			WHERE id = ${job.id}
				AND status = 'running'
				AND lease_token = ${job.leaseToken}
			RETURNING id
		`;
		return updated.length === 1;
	}

	const updated = await env.sqlClient<Array<{ id: string }>>`
		UPDATE clickhouse_purge_job
		SET
			status = 'retrying',
			last_error = ${sanitizedError},
			next_attempt_at = ${nextAttemptAt.toISOString()}::timestamptz,
			lease_token = NULL,
			lease_expires_at = NULL,
			updated_at = NOW()
		WHERE id = ${job.id}
			AND status = 'running'
			AND lease_token = ${job.leaseToken}
		RETURNING id
	`;
	return updated.length === 1;
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
				ORDER BY
					COALESCE(alert_next_attempt_at, lease_expires_at) ASC,
					failed_at ASC NULLS LAST
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
						alert_next_attempt_at = NULL,
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

		const fallbackTimestamp = env.now();
		const createdAt = readTimestamp(claimed.createdAt, fallbackTimestamp);
		const lastAttemptAt = readTimestamp(claimed.lastAttemptAt, createdAt);

		return {
			alertAttemptCount: claimed.alertAttemptCount,
			attemptCount: claimed.attemptCount,
			createdAt,
			failedAt: readTimestamp(claimed.failedAt, lastAttemptAt),
			id: claimed.id,
			lastAttemptAt,
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
	sendFailureAlert: (alert: ClickHousePurgeFailureAlert) => Promise<void>,
	env: ClickHousePurgeProcessorEnv,
): Promise<void> {
	try {
		await sendFailureAlert(alert);
		const updated = await env.sqlClient<Array<{ id: string }>>`
			UPDATE clickhouse_purge_job
			SET
				alert_status = 'sent',
				alert_last_error = NULL,
				alert_sent_at = NOW(),
				lease_token = NULL,
				lease_expires_at = NULL,
				updated_at = NOW()
			WHERE id = ${alert.id}
				AND status = 'failed'
				AND alert_status = 'sending'
				AND lease_token = ${alert.leaseToken}
			RETURNING id
		`;
		if (updated.length === 0) {
			logger.warn(
				"ClickHouse purge alert was accepted after its lease was lost; the stable provider idempotency key will deduplicate recovery (job_id={jobId})",
				{ jobId: alert.id },
			);
			return;
		}
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
		const updated = await env.sqlClient<Array<{ id: string }>>`
			UPDATE clickhouse_purge_job
			SET
				alert_status = 'retrying',
				alert_last_error = ${sanitizedError},
				alert_next_attempt_at = ${nextAttemptAt}::timestamptz,
				lease_token = NULL,
				lease_expires_at = NULL,
				updated_at = NOW()
			WHERE id = ${alert.id}
				AND status = 'failed'
				AND alert_status = 'sending'
				AND lease_token = ${alert.leaseToken}
			RETURNING id
		`;
		if (updated.length === 0) {
			logger.warn(
				"ClickHouse purge alert attempt finished after its lease was lost; state was left to the current worker (job_id={jobId})",
				{ jobId: alert.id },
			);
			return;
		}
		logger.error(
			"ClickHouse purge failure alert delivery failed and will retry (job_id={jobId} error={error})",
			{ error: sanitizedError, jobId: alert.id },
		);
	}
}

function readTimestamp(value: Date | string | null, fallback: Date): Date {
	if (value === null) {
		return fallback;
	}
	const timestamp = value instanceof Date ? value : new Date(value);
	return Number.isNaN(timestamp.getTime()) ? fallback : timestamp;
}
