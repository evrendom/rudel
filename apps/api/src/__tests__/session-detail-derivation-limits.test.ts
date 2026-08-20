import { describe, expect, test } from "bun:test";
import {
	SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_BYTES,
	SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_ENTRY_BYTES,
	SESSION_DETAIL_DERIVATION_MAX_CONCURRENCY,
} from "../services/session-detail-derivation-limits.js";

describe("session detail derivation limits", () => {
	test("fit the launch bridge inside the two-gigabyte production envelope", () => {
		expect(SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_BYTES).toBe(
			256 * 1024 * 1024,
		);
		expect(SESSION_DETAIL_DERIVATION_CACHE_DEFAULT_MAX_ENTRY_BYTES).toBe(
			64 * 1024 * 1024,
		);
		expect(SESSION_DETAIL_DERIVATION_MAX_CONCURRENCY).toBe(2);
	});
});
