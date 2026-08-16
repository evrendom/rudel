import { getLogger } from "@logtape/logtape";
import { readPositiveSafeIntegerEnv } from "../lib/env.js";
import {
	deriveSessionDetail,
	getSessionDetailSubagent as getCachedSessionDetailSubagent,
	getSessionDetailTurn as getCachedSessionDetailTurn,
	getSessionDetailOverviewPage,
	type SessionDetailDerivation,
} from "./session-detail-derivation.service.js";
import {
	createSessionDetailDerivationCache,
	type SessionDetailDerivationCacheKey,
} from "./session-detail-derivation-cache.js";
import {
	SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_BYTES,
	SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_ENTRY_BYTES,
	SESSION_DETAIL_DERIVATION_MAX_CONCURRENCY,
} from "./session-detail-derivation-limits.js";
import { createSessionDetailDerivationSemaphore } from "./session-detail-derivation-semaphore.js";
import { createSessionDetailInstrumentation } from "./session-detail-instrumentation.js";
import {
	getSessionDetailCurrentRevision,
	getSessionDetailRawSnapshot,
} from "./session-detail-snapshot.service.js";

const logger = getLogger(["rudel", "api", "session-detail"]);
const MAX_LATENCY_SAMPLES = 1_024;
const instrumentation = createSessionDetailInstrumentation({
	maxSamples: MAX_LATENCY_SAMPLES,
	readMemoryUsage: () => process.memoryUsage(),
	startedAt: new Date().toISOString(),
});
const cache = createSessionDetailDerivationCache<SessionDetailDerivation>({
	maxBytes: readPositiveSafeIntegerEnv(
		"SESSION_DETAIL_DERIVATION_CACHE_MAX_BYTES",
		SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_BYTES,
	),
	maxEntryBytes: readPositiveSafeIntegerEnv(
		"SESSION_DETAIL_DERIVATION_CACHE_MAX_ENTRY_BYTES",
		SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_ENTRY_BYTES,
	),
});
const derivationSemaphore = createSessionDetailDerivationSemaphore(
	SESSION_DETAIL_DERIVATION_MAX_CONCURRENCY,
);

export class SessionDetailStaleRevisionError extends Error {
	constructor(
		readonly requestedRevision: string,
		readonly currentRevision: string,
	) {
		super("The session detail revision is stale");
		this.name = "SessionDetailStaleRevisionError";
	}
}

function logRequestLatency(
	kind: "overview" | "subagent" | "turn",
	startedAt: number,
) {
	const durationMs = Math.round(performance.now() - startedAt);
	const latency = instrumentation.recordRequestLatency(kind, durationMs);
	logger.info(
		"Served session detail {kind} in {durationMs}ms (p50={p50Ms}, p95={p95Ms}, p99={p99Ms}, samples={sampleCount})",
		{
			...cache.getStats(),
			durationMs,
			kind,
			p50Ms: latency.p50,
			p95Ms: latency.p95,
			p99Ms: latency.p99,
			sampleCount: latency.sampleCount,
		},
	);
}

function createKey(input: {
	organizationId: string;
	ownerId: string;
	revision: string;
	sessionId: string;
	source: string;
}): SessionDetailDerivationCacheKey {
	return input;
}

async function loadDerivation(
	key: SessionDetailDerivationCacheKey,
): Promise<SessionDetailDerivation | null> {
	try {
		return await cache.getOrLoad(key, () =>
			derivationSemaphore.run(async () => {
				const memoryBefore = process.memoryUsage();
				const startedAt = performance.now();
				const snapshot = await getSessionDetailRawSnapshot(
					key.organizationId,
					key.sessionId,
					key.ownerId,
				);
				if (!snapshot) {
					throw new SessionDetailSnapshotNotFoundError();
				}
				if (
					snapshot.revision !== key.revision ||
					snapshot.source !== key.source
				) {
					throw new SessionDetailStaleRevisionError(
						key.revision,
						snapshot.revision,
					);
				}
				const value = deriveSessionDetail(snapshot);
				const durationMs = Math.round(performance.now() - startedAt);
				const heapGrowthBytes =
					process.memoryUsage().heapUsed - memoryBefore.heapUsed;
				const rawBytes =
					Buffer.byteLength(snapshot.content, "utf8") +
					Object.values(snapshot.subagents).reduce(
						(total, content) => total + Buffer.byteLength(content, "utf8"),
						0,
					);
				instrumentation.recordDerivation({
					cachedBytes: value.byteSize,
					durationMs,
					heapGrowthBytes,
					rawBytes,
				});
				logger.info(
					"Derived session detail snapshot in {durationMs}ms (rawBytes={rawBytes}, cachedBytes={cachedBytes}, heapGrowthBytes={heapGrowthBytes})",
					{
						cachedBytes: value.byteSize,
						durationMs,
						heapGrowthBytes,
						rawBytes,
					},
				);
				return { bytes: value.byteSize, value };
			}),
		);
	} catch (error) {
		if (error instanceof SessionDetailSnapshotNotFoundError) {
			return null;
		}
		throw error;
	}
}

class SessionDetailSnapshotNotFoundError extends Error {}

async function getCurrentDerivation(input: {
	organizationId: string;
	ownerId: string;
	sessionId: string;
}) {
	for (let attempt = 0; attempt < 2; attempt++) {
		const current = await getSessionDetailCurrentRevision(
			input.organizationId,
			input.sessionId,
			input.ownerId,
		);
		if (!current) {
			return null;
		}
		try {
			return await loadDerivation(createKey({ ...input, ...current }));
		} catch (error) {
			if (error instanceof SessionDetailStaleRevisionError && attempt === 0) {
				continue;
			}
			throw error;
		}
	}
	return null;
}

async function getRequestedDerivation(input: {
	organizationId: string;
	ownerId: string;
	revision: string;
	sessionId: string;
}) {
	const current = await getSessionDetailCurrentRevision(
		input.organizationId,
		input.sessionId,
		input.ownerId,
	);
	if (!current) {
		return null;
	}
	if (current.revision !== input.revision) {
		throw new SessionDetailStaleRevisionError(input.revision, current.revision);
	}
	return loadDerivation(createKey({ ...input, source: current.source }));
}

export async function getSessionDetailOverview(input: {
	organizationId: string;
	ownerId: string;
	sessionId: string;
	turnCursor?: string;
	turnLimit: number;
}) {
	const startedAt = performance.now();
	try {
		const derivation = await getCurrentDerivation(input);
		if (!derivation) {
			return null;
		}
		const response = getSessionDetailOverviewPage({
			cursor: input.turnCursor,
			derivation,
			limit: input.turnLimit,
		});
		logger.info(
			"Serialized session detail overview ({serializedBytes} bytes)",
			{
				serializedBytes: Buffer.byteLength(JSON.stringify(response), "utf8"),
			},
		);
		return response;
	} finally {
		logRequestLatency("overview", startedAt);
	}
}

export async function getSessionDetailTurn(input: {
	organizationId: string;
	ownerId: string;
	revision: string;
	sessionId: string;
	turnId: string;
}) {
	const startedAt = performance.now();
	try {
		const derivation = await getRequestedDerivation(input);
		return derivation
			? getCachedSessionDetailTurn(derivation, input.turnId)
			: null;
	} finally {
		logRequestLatency("turn", startedAt);
	}
}

export async function getSessionDetailSubagent(input: {
	organizationId: string;
	ownerId: string;
	revision: string;
	sessionId: string;
	subagentId: string;
}) {
	const startedAt = performance.now();
	try {
		const derivation = await getRequestedDerivation(input);
		return derivation
			? getCachedSessionDetailSubagent(derivation, input.subagentId)
			: null;
	} finally {
		logRequestLatency("subagent", startedAt);
	}
}

export function getSessionDetailInstrumentationStats() {
	const cacheStats = cache.getStats();
	const cacheRequests = cacheStats.hitCount + cacheStats.missCount;
	return {
		...instrumentation.getStats(),
		cache: {
			...cacheStats,
			hitRate: cacheRequests === 0 ? null : cacheStats.hitCount / cacheRequests,
		},
		derivationConcurrency: derivationSemaphore.getStats(),
	};
}
