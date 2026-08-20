import { describe, expect, test } from "bun:test";
import { createSessionDetailDerivationCache } from "../services/session-detail-derivation-cache.js";

function key(sessionId: string) {
	return {
		organizationId: "org-1",
		ownerId: "owner-1",
		revision: "2026-08-16T08:30:00.123Z",
		sessionId,
		source: "claude_code",
	};
}

describe("sessionDetailDerivationCache", () => {
	test("evicts least-recently-used entries by bytes", () => {
		const cache = createSessionDetailDerivationCache<string>({
			maxBytes: 10,
			maxEntryBytes: 8,
		});
		cache.set(key("a"), "a", 4);
		cache.set(key("b"), "b", 4);
		expect(cache.get(key("a"))).toBe("a");
		cache.set(key("c"), "c", 4);

		expect(cache.get(key("b"))).toBeUndefined();
		expect(cache.get(key("a"))).toBe("a");
		expect(cache.get(key("c"))).toBe("c");
		expect(cache.getStats()).toMatchObject({
			bytes: 8,
			entryCount: 2,
			evictionCount: 1,
		});
	});

	test("rejects a pathological entry instead of evicting the cache", () => {
		const cache = createSessionDetailDerivationCache<string>({
			maxBytes: 10,
			maxEntryBytes: 6,
		});
		cache.set(key("kept"), "kept", 5);
		cache.set(key("too-large"), "too-large", 7);

		expect(cache.get(key("kept"))).toBe("kept");
		expect(cache.get(key("too-large"))).toBeUndefined();
		expect(cache.getStats().rejectedEntryCount).toBe(1);
	});

	test("coalesces concurrent misses for the full owner-bound key", async () => {
		const cache = createSessionDetailDerivationCache<string>({
			maxBytes: 100,
			maxEntryBytes: 50,
		});
		let loads = 0;
		let resolveLoad!: (value: { bytes: number; value: string }) => void;
		const load = () => {
			loads += 1;
			return new Promise<{ bytes: number; value: string }>((resolve) => {
				resolveLoad = resolve;
			});
		};
		const first = cache.getOrLoad(key("same"), load);
		const second = cache.getOrLoad(key("same"), load);
		expect(loads).toBe(1);
		expect(cache.getStats().coalescedRequests).toBe(1);
		resolveLoad({ bytes: 4, value: "same" });

		expect(await Promise.all([first, second])).toEqual(["same", "same"]);
		expect(cache.getStats().missCount).toBe(1);
	});

	test("never reuses a cached value across owners", () => {
		const cache = createSessionDetailDerivationCache<string>({
			maxBytes: 100,
			maxEntryBytes: 50,
		});
		cache.set(key("same"), "owner-1", 4);
		expect(cache.get({ ...key("same"), ownerId: "owner-2" })).toBeUndefined();
	});
});
