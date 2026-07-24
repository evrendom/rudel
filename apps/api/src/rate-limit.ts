import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { INGEST_LIMIT_REASONS } from "@rudel/api-routes";
import { readPositiveSafeIntegerEnv } from "./lib/env.js";

const logger = getLogger(["rudel", "api", "rate-limit"]);

// ── In-memory sliding-window rate limiter ─────────────────────────

interface SlidingWindowEntry {
	timestamps: number[];
}

type WeightedSample = { ts: number; weight: number };

interface WeightedWindowEntry {
	samples: WeightedSample[];
	total: number;
}

const analyticsWindows = new Map<string, SlidingWindowEntry>();
const organizationSessionCountWindows = new Map<string, SlidingWindowEntry>();
const wrappedShareCreateWindows = new Map<string, SlidingWindowEntry>();
const wrappedShareLookupWindows = new Map<string, SlidingWindowEntry>();
const wrappedResumeCreateWindows = new Map<string, SlidingWindowEntry>();
const wrappedDecimalClaimRedeemWindows = new Map<string, SlidingWindowEntry>();
const ingestRequestWindows = new Map<string, WeightedWindowEntry>();
const ingestByteWindows = new Map<string, WeightedWindowEntry>();

const ANALYTICS_MAX_REQUESTS = Number(
	process.env.RATE_LIMIT_ANALYTICS_MAX ?? 90,
);
const ANALYTICS_WINDOW_MS =
	Number(process.env.RATE_LIMIT_ANALYTICS_WINDOW ?? 60) * 1000;
const ORGANIZATION_SESSION_COUNT_MAX_REQUESTS = 300;
const ORGANIZATION_SESSION_COUNT_WINDOW_MS = 60_000;
const WRAPPED_SHARE_CREATE_MAX_REQUESTS = Number(
	process.env.RATE_LIMIT_WRAPPED_SHARE_CREATE_MAX ?? 12,
);
const WRAPPED_SHARE_CREATE_WINDOW_MS =
	Number(process.env.RATE_LIMIT_WRAPPED_SHARE_CREATE_WINDOW ?? 600) * 1000;
const WRAPPED_SHARE_LOOKUP_MAX_REQUESTS = Number(
	process.env.RATE_LIMIT_WRAPPED_SHARE_LOOKUP_MAX ?? 180,
);
const WRAPPED_SHARE_LOOKUP_WINDOW_MS =
	Number(process.env.RATE_LIMIT_WRAPPED_SHARE_LOOKUP_WINDOW ?? 60) * 1000;
const WRAPPED_RESUME_CREATE_MAX_REQUESTS = Number(
	process.env.RATE_LIMIT_WRAPPED_RESUME_CREATE_MAX ?? 6,
);
const WRAPPED_RESUME_CREATE_WINDOW_MS =
	Number(process.env.RATE_LIMIT_WRAPPED_RESUME_CREATE_WINDOW ?? 1800) * 1000;
const WRAPPED_DECIMAL_CLAIM_REDEEM_MAX_REQUESTS = Number(
	process.env.RATE_LIMIT_WRAPPED_DECIMAL_CLAIM_REDEEM_MAX ?? 10,
);
const WRAPPED_DECIMAL_CLAIM_REDEEM_WINDOW_MS =
	Number(process.env.RATE_LIMIT_WRAPPED_DECIMAL_CLAIM_REDEEM_WINDOW ?? 60) *
	1000;
export const INGEST_REQUESTS_MAX = readPositiveSafeIntegerEnv(
	"RATE_LIMIT_INGEST_REQUESTS_MAX",
	15_000,
);
export const INGEST_REQUESTS_WINDOW_MS =
	readPositiveSafeIntegerEnv("RATE_LIMIT_INGEST_REQUESTS_WINDOW", 3600) * 1000;
export const INGEST_BYTES_MAX = readPositiveSafeIntegerEnv(
	"RATE_LIMIT_INGEST_BYTES_MAX",
	10 * 1024 * 1024 * 1024,
);
export const INGEST_BYTES_WINDOW_MS =
	readPositiveSafeIntegerEnv("RATE_LIMIT_INGEST_BYTES_WINDOW", 3600) * 1000;

export function checkAnalyticsRateLimit(userId: string): void {
	const now = Date.now();
	const cutoff = now - ANALYTICS_WINDOW_MS;

	let entry = analyticsWindows.get(userId);
	if (!entry) {
		entry = { timestamps: [] };
		analyticsWindows.set(userId, entry);
	}

	// Evict expired timestamps
	entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

	if (entry.timestamps.length >= ANALYTICS_MAX_REQUESTS) {
		logger.warn(
			"Analytics rate limit exceeded for user {userId}: {count}/{max} in {window}s",
			{
				userId,
				count: entry.timestamps.length,
				max: ANALYTICS_MAX_REQUESTS,
				window: ANALYTICS_WINDOW_MS / 1000,
			},
		);
		throw new ORPCError("TOO_MANY_REQUESTS", {
			message: `Rate limit exceeded. Maximum ${ANALYTICS_MAX_REQUESTS} requests per ${Math.round(ANALYTICS_WINDOW_MS / 1000)} seconds.`,
		});
	}

	entry.timestamps.push(now);
}

export function checkOrganizationSessionCountRateLimit(
	userId: string,
	organizationId: string,
): void {
	checkSlidingWindowRateLimit({
		entityId: JSON.stringify([userId, organizationId]),
		errorMessage:
			"Session count refresh is temporarily limited. Please wait a moment and try again.",
		maxRequests: ORGANIZATION_SESSION_COUNT_MAX_REQUESTS,
		map: organizationSessionCountWindows,
		operationName: "organization session count refresh",
		windowMs: ORGANIZATION_SESSION_COUNT_WINDOW_MS,
	});
}

// Saturday share abuse protection stays intentionally small and auditable.
// These are not meant to replace edge or IP-based rate limits later. They are
// just enough to keep one user or one share id from being hammered unchecked.
export function checkWrappedShareCreateRateLimit(userId: string) {
	checkSlidingWindowRateLimit({
		entityId: userId,
		errorMessage: `Wrapped share creation is temporarily rate limited. Maximum ${WRAPPED_SHARE_CREATE_MAX_REQUESTS} requests per ${Math.round(WRAPPED_SHARE_CREATE_WINDOW_MS / 1000)} seconds.`,
		maxRequests: WRAPPED_SHARE_CREATE_MAX_REQUESTS,
		map: wrappedShareCreateWindows,
		operationName: "wrapped share creation",
		windowMs: WRAPPED_SHARE_CREATE_WINDOW_MS,
	});
}

export function checkWrappedShareLookupRateLimit(shareId: string) {
	checkSlidingWindowRateLimit({
		entityId: shareId,
		errorMessage: `Wrapped share lookup is temporarily rate limited. Maximum ${WRAPPED_SHARE_LOOKUP_MAX_REQUESTS} requests per ${Math.round(WRAPPED_SHARE_LOOKUP_WINDOW_MS / 1000)} seconds.`,
		maxRequests: WRAPPED_SHARE_LOOKUP_MAX_REQUESTS,
		map: wrappedShareLookupWindows,
		operationName: "wrapped share lookup",
		windowMs: WRAPPED_SHARE_LOOKUP_WINDOW_MS,
	});
}

export function checkWrappedResumeCreateRateLimit(userId: string) {
	checkSlidingWindowRateLimit({
		entityId: userId,
		errorMessage: `Desktop resume links are temporarily rate limited. Maximum ${WRAPPED_RESUME_CREATE_MAX_REQUESTS} requests per ${Math.round(WRAPPED_RESUME_CREATE_WINDOW_MS / 1000)} seconds.`,
		maxRequests: WRAPPED_RESUME_CREATE_MAX_REQUESTS,
		map: wrappedResumeCreateWindows,
		operationName: "wrapped desktop resume creation",
		windowMs: WRAPPED_RESUME_CREATE_WINDOW_MS,
	});
}

// Per-user redemption limit. Tokens are 256 bits so brute force is impossible;
// this is a thin guardrail to keep a single account from hammering the redeem
// endpoint by accident or otherwise.
export function checkWrappedDecimalClaimRedeemRateLimit(userId: string) {
	checkSlidingWindowRateLimit({
		entityId: userId,
		errorMessage: `Decimal claim redemption is temporarily rate limited. Maximum ${WRAPPED_DECIMAL_CLAIM_REDEEM_MAX_REQUESTS} requests per ${Math.round(WRAPPED_DECIMAL_CLAIM_REDEEM_WINDOW_MS / 1000)} seconds.`,
		maxRequests: WRAPPED_DECIMAL_CLAIM_REDEEM_MAX_REQUESTS,
		map: wrappedDecimalClaimRedeemWindows,
		operationName: "wrapped decimal claim redemption",
		windowMs: WRAPPED_DECIMAL_CLAIM_REDEEM_WINDOW_MS,
	});
}

// Ingest caps split by upload mode. Both count distinct session_ids in
// a rolling window — Codex's per-turn re-uploads of the same session
// collapse into one slot in either bucket. Hook and manual buckets are
// independent: a bulk historical import does not affect the live-hook
// budget, and vice versa.

interface SessionIngestEntry {
	sessions: Map<string, number>;
}

const hookIngestWindows = new Map<string, SessionIngestEntry>();
const manualIngestWindows = new Map<string, SessionIngestEntry>();

const HOOK_INGEST_MAX = Number(process.env.RATE_LIMIT_INGEST_MAX ?? 500);
const HOOK_INGEST_WINDOW_MS =
	Number(process.env.RATE_LIMIT_INGEST_WINDOW ?? 3600) * 1000;

const MANUAL_INGEST_MAX = Number(
	process.env.RATE_LIMIT_INGEST_MANUAL_MAX ?? 10_000,
);
const MANUAL_INGEST_WINDOW_MS =
	Number(process.env.RATE_LIMIT_INGEST_MANUAL_WINDOW ?? 3600) * 1000;

// These caps are per user/process: the global ceiling scales with active
// instances, and limiter state resets whenever an instance restarts or deploys.
export function checkIngestRequestRateLimit(userId: string): void {
	checkIngestRateLimit(userId, 1, "requests");
}

export function checkIngestByteRateLimit(userId: string, bytes: number): void {
	checkIngestRateLimit(userId, bytes, "bytes");
}

function checkIngestRateLimit(
	userId: string,
	weight: number,
	unit: "requests" | "bytes",
): void {
	const isRequestLimit = unit === "requests";
	const maxTotal = isRequestLimit ? INGEST_REQUESTS_MAX : INGEST_BYTES_MAX;
	const windowMs = isRequestLimit
		? INGEST_REQUESTS_WINDOW_MS
		: INGEST_BYTES_WINDOW_MS;
	const reason = isRequestLimit
		? INGEST_LIMIT_REASONS.requestLimit
		: INGEST_LIMIT_REASONS.byteLimit;
	const windows = isRequestLimit ? ingestRequestWindows : ingestByteWindows;
	const now = Date.now();
	const cutoff = now - windowMs;
	let entry = windows.get(userId);
	if (!entry) {
		entry = { samples: [], total: 0 };
		windows.set(userId, entry);
	}

	let expiredCount = 0;
	let expiredWeight = 0;
	while (expiredCount < entry.samples.length) {
		const sample = entry.samples[expiredCount];
		if (!sample || sample.ts > cutoff) {
			break;
		}
		expiredWeight += sample.weight;
		expiredCount += 1;
	}
	if (expiredCount > 0) {
		entry.samples.splice(0, expiredCount);
		entry.total -= expiredWeight;
	}

	const current = entry.total + weight;
	if (current > maxTotal) {
		logger.warn("Ingest rate limit exceeded for user {userId}", {
			current,
			limit: maxTotal,
			reason,
			userId,
		});
		throw new ORPCError("TOO_MANY_REQUESTS", {
			data: {
				current,
				limit: maxTotal,
				reason,
				windowSeconds: windowMs / 1000,
			},
			message: `Rate limit exceeded. Maximum ${maxTotal} ingest ${unit} per ${Math.round(windowMs / 60_000)} minutes. Try again later.`,
		});
	}

	entry.samples.push({ ts: now, weight });
	entry.total = current;
}

function checkSessionIngestRateLimit(input: {
	windows: Map<string, SessionIngestEntry>;
	max: number;
	windowMs: number;
	label: string;
	userId: string;
	sessionId: string;
}): void {
	const { windows, max, windowMs, label, userId, sessionId } = input;
	const now = Date.now();
	const cutoff = now - windowMs;

	let entry = windows.get(userId);
	if (!entry) {
		entry = { sessions: new Map() };
		windows.set(userId, entry);
	}

	for (const [sid, ts] of entry.sessions) {
		if (ts <= cutoff) entry.sessions.delete(sid);
	}

	const isNew = !entry.sessions.has(sessionId);
	if (isNew && entry.sessions.size >= max) {
		logger.warn(
			"{label} ingest rate limit exceeded for user {userId}: {count}/{max} unique sessions in {window}s",
			{
				label,
				userId,
				count: entry.sessions.size,
				max,
				window: windowMs / 1000,
			},
		);
		throw new ORPCError("TOO_MANY_REQUESTS", {
			message: `Rate limit exceeded. Maximum ${max} sessions per ${Math.round(windowMs / 60_000)} minutes. Try again later.`,
			data: {
				reason: INGEST_LIMIT_REASONS.sessionLimit,
				limit: max,
				windowSeconds: windowMs / 1000,
				current: entry.sessions.size,
			},
		});
	}

	entry.sessions.set(sessionId, now);
}

export function checkHookIngestRateLimit(
	userId: string,
	sessionId: string,
): void {
	checkSessionIngestRateLimit({
		windows: hookIngestWindows,
		max: HOOK_INGEST_MAX,
		windowMs: HOOK_INGEST_WINDOW_MS,
		label: "Hook",
		userId,
		sessionId,
	});
}

export function checkManualIngestRateLimit(
	userId: string,
	sessionId: string,
): void {
	checkSessionIngestRateLimit({
		windows: manualIngestWindows,
		max: MANUAL_INGEST_MAX,
		windowMs: MANUAL_INGEST_WINDOW_MS,
		label: "Manual",
		userId,
		sessionId,
	});
}

function checkSlidingWindowRateLimit(input: {
	entityId: string;
	errorMessage: string;
	maxRequests: number;
	map: Map<string, SlidingWindowEntry>;
	operationName: string;
	windowMs: number;
}) {
	const { entityId, errorMessage, maxRequests, map, operationName, windowMs } =
		input;
	const now = Date.now();
	const cutoff = now - windowMs;

	let entry = map.get(entityId);
	if (!entry) {
		entry = { timestamps: [] };
		map.set(entityId, entry);
	}

	entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > cutoff);

	if (entry.timestamps.length >= maxRequests) {
		logger.warn(
			"{operationName} rate limit exceeded for {entityId}: {count}/{max} in {window}s",
			{
				count: entry.timestamps.length,
				entityId,
				max: maxRequests,
				operationName,
				window: Math.round(windowMs / 1000),
			},
		);
		throw new ORPCError("TOO_MANY_REQUESTS", {
			message: errorMessage,
		});
	}

	entry.timestamps.push(now);
}
