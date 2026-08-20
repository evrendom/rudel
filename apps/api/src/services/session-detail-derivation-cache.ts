import { getLogger } from "@logtape/logtape";

const logger = getLogger(["rudel", "api", "session-detail-derivation-cache"]);

export interface SessionDetailDerivationCacheKey {
	organizationId: string;
	ownerId: string;
	revision: string;
	sessionId: string;
	source: string;
}

export interface SessionDetailDerivationCacheStats {
	bytes: number;
	coalescedRequests: number;
	entryCount: number;
	evictionCount: number;
	hitCount: number;
	missCount: number;
	rejectedEntryCount: number;
}

interface CacheEntry<Value> {
	bytes: number;
	value: Value;
}

function serializeKey(key: SessionDetailDerivationCacheKey) {
	return JSON.stringify([
		key.organizationId,
		key.ownerId,
		key.source,
		key.sessionId,
		key.revision,
	]);
}

export function createSessionDetailDerivationCache<Value>(options: {
	maxBytes: number;
	maxEntryBytes: number;
}) {
	if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
		throw new Error("session detail cache maxBytes must be a positive integer");
	}
	if (
		!Number.isSafeInteger(options.maxEntryBytes) ||
		options.maxEntryBytes <= 0 ||
		options.maxEntryBytes > options.maxBytes
	) {
		throw new Error(
			"session detail cache maxEntryBytes must be a positive integer no greater than maxBytes",
		);
	}

	const entries = new Map<string, CacheEntry<Value>>();
	const inFlight = new Map<string, Promise<Value>>();
	const stats: SessionDetailDerivationCacheStats = {
		bytes: 0,
		coalescedRequests: 0,
		entryCount: 0,
		evictionCount: 0,
		hitCount: 0,
		missCount: 0,
		rejectedEntryCount: 0,
	};

	function get(key: SessionDetailDerivationCacheKey) {
		const serializedKey = serializeKey(key);
		const entry = entries.get(serializedKey);
		if (!entry) {
			return undefined;
		}
		entries.delete(serializedKey);
		entries.set(serializedKey, entry);
		stats.hitCount += 1;
		return entry.value;
	}

	function set(
		key: SessionDetailDerivationCacheKey,
		value: Value,
		bytes: number,
	) {
		if (!Number.isSafeInteger(bytes) || bytes < 0) {
			throw new Error("session detail cache entry bytes must be non-negative");
		}
		if (bytes > options.maxEntryBytes) {
			stats.rejectedEntryCount += 1;
			logger.warn(
				"Session detail derivation exceeded the maximum cache entry size ({bytes} > {maxEntryBytes})",
				{ bytes, maxEntryBytes: options.maxEntryBytes },
			);
			return;
		}

		const serializedKey = serializeKey(key);
		const previous = entries.get(serializedKey);
		if (previous) {
			entries.delete(serializedKey);
			stats.bytes -= previous.bytes;
		}
		entries.set(serializedKey, { bytes, value });
		stats.bytes += bytes;

		while (stats.bytes > options.maxBytes) {
			const oldest = entries.entries().next().value as
				| [string, CacheEntry<Value>]
				| undefined;
			if (!oldest) {
				break;
			}
			entries.delete(oldest[0]);
			stats.bytes -= oldest[1].bytes;
			stats.evictionCount += 1;
		}
		stats.entryCount = entries.size;
	}

	async function getOrLoad(
		key: SessionDetailDerivationCacheKey,
		load: () => Promise<{ bytes: number; value: Value }>,
	) {
		const cached = get(key);
		if (cached !== undefined) {
			return cached;
		}

		const serializedKey = serializeKey(key);
		const pending = inFlight.get(serializedKey);
		if (pending) {
			stats.coalescedRequests += 1;
			return pending;
		}

		stats.missCount += 1;
		const loading = load().then((loaded) => {
			set(key, loaded.value, loaded.bytes);
			return loaded.value;
		});
		inFlight.set(serializedKey, loading);
		try {
			return await loading;
		} finally {
			inFlight.delete(serializedKey);
		}
	}

	return {
		clear() {
			entries.clear();
			inFlight.clear();
			stats.bytes = 0;
			stats.entryCount = 0;
		},
		get,
		getOrLoad,
		getStats(): SessionDetailDerivationCacheStats {
			return { ...stats, entryCount: entries.size };
		},
		set,
	};
}

export type SessionDetailDerivationCache<Value> = ReturnType<
	typeof createSessionDetailDerivationCache<Value>
>;
