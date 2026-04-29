import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";

const logger = getLogger(["rudel", "api", "rate-limit"]);

// ── In-memory sliding-window rate limiter ─────────────────────────

interface SlidingWindowEntry {
	timestamps: number[];
}

const analyticsWindows = new Map<string, SlidingWindowEntry>();
const wrappedShareCreateWindows = new Map<string, SlidingWindowEntry>();
const wrappedShareLookupWindows = new Map<string, SlidingWindowEntry>();
const wrappedResumeCreateWindows = new Map<string, SlidingWindowEntry>();

const ANALYTICS_MAX_REQUESTS = Number(
	process.env.RATE_LIMIT_ANALYTICS_MAX ?? 90,
);
const ANALYTICS_WINDOW_MS =
	Number(process.env.RATE_LIMIT_ANALYTICS_WINDOW ?? 60) * 1000;
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
