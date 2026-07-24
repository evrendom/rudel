import { afterEach, describe, expect, test } from "bun:test";
import { IngestSessionInputSchema } from "@rudel/api-routes";
import { readPositiveSafeIntegerEnv } from "../lib/env.js";
import {
	checkAnalyticsRateLimit,
	checkHookIngestRateLimit,
	checkIngestByteRateLimit,
	checkIngestRequestRateLimit,
	checkManualIngestRateLimit,
	checkOrganizationSessionCountRateLimit,
	INGEST_BYTES_MAX,
	INGEST_BYTES_WINDOW_MS,
	INGEST_REQUESTS_MAX,
	INGEST_REQUESTS_WINDOW_MS,
} from "../rate-limit.js";

describe("IngestSessionInputSchema metadata field limits", () => {
	const validBase = {
		source: "claude_code" as const,
		sessionId: "abc-123",
		projectPath: "/home/user/project",
		content: '{"type":"user","timestamp":"2026-01-01T00:00:00Z"}',
	};

	test("accepts metadata fields within 200 char limit", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			sessionId: "a".repeat(200),
			projectPath: "b".repeat(200),
			gitRemote: "c".repeat(200),
			gitBranch: "d".repeat(200),
			gitSha: "e".repeat(200),
			packageName: "f".repeat(200),
			packageType: "g".repeat(200),
			organizationId: "h".repeat(200),
		});
		expect(result.success).toBe(true);
	});

	test("rejects sessionId over 200 chars", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			sessionId: "a".repeat(201),
		});
		expect(result.success).toBe(false);
	});

	test("rejects projectPath over 200 chars", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			projectPath: "a".repeat(201),
		});
		expect(result.success).toBe(false);
	});

	test("rejects gitRemote over 200 chars", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			gitRemote: "a".repeat(201),
		});
		expect(result.success).toBe(false);
	});

	test("rejects gitBranch over 200 chars", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			gitBranch: "a".repeat(201),
		});
		expect(result.success).toBe(false);
	});

	test("rejects organizationId over 200 chars", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			organizationId: "a".repeat(201),
		});
		expect(result.success).toBe(false);
	});

	test("rejects more than 512 subagents", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			subagents: Array.from({ length: 513 }, (_, index) => ({
				agentId: `agent-${index}`,
				content: "content",
			})),
		});
		expect(result.success).toBe(false);
	});

	test("rejects subagent agentId over 200 chars", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			subagents: [{ agentId: "a".repeat(201), content: "content" }],
		});
		expect(result.success).toBe(false);
	});

	test("rejects duplicate subagent agentId values", () => {
		const result = IngestSessionInputSchema.safeParse({
			...validBase,
			subagents: [
				{ agentId: "agent-1", content: "first" },
				{ agentId: "agent-1", content: "second" },
			],
		});
		expect(result.success).toBe(false);
	});
});

describe("readPositiveSafeIntegerEnv", () => {
	afterEach(() => {
		delete process.env.TEST_LIMIT;
	});

	test("uses the default when the variable is absent", () => {
		delete process.env.TEST_LIMIT;
		expect(readPositiveSafeIntegerEnv("TEST_LIMIT", 42)).toBe(42);
	});

	test("accepts a positive safe integer", () => {
		process.env.TEST_LIMIT = "123";
		expect(readPositiveSafeIntegerEnv("TEST_LIMIT", 42)).toBe(123);
	});

	test("fails closed for invalid values", () => {
		for (const invalidValue of [
			"",
			"0",
			"-1",
			"1.5",
			"abc",
			"Infinity",
			"9007199254740992",
		]) {
			process.env.TEST_LIMIT = invalidValue;
			expect(() => readPositiveSafeIntegerEnv("TEST_LIMIT", 42)).toThrow(
				"TEST_LIMIT must be a positive safe integer",
			);
		}
	});
});

describe("checkAnalyticsRateLimit", () => {
	test("allows requests under the limit", () => {
		const userId = `test-under-${Date.now()}`;
		expect(() => checkAnalyticsRateLimit(userId)).not.toThrow();
	});

	test("throws after exceeding the limit", () => {
		const userId = `test-over-${Date.now()}`;
		// Default is 90 requests per 60 seconds
		for (let i = 0; i < 90; i++) {
			checkAnalyticsRateLimit(userId);
		}
		expect(() => checkAnalyticsRateLimit(userId)).toThrow(
			"Rate limit exceeded",
		);
	});

	test("different users have independent limits", () => {
		const userA = `test-a-${Date.now()}`;
		const userB = `test-b-${Date.now()}`;
		for (let i = 0; i < 90; i++) {
			checkAnalyticsRateLimit(userA);
		}
		// userA is exhausted, userB should still work
		expect(() => checkAnalyticsRateLimit(userB)).not.toThrow();
	});
});

describe("checkOrganizationSessionCountRateLimit", () => {
	test("allows five one-second pollers for one minute", () => {
		const userId = `test-session-count-polling-${Date.now()}`;
		const organizationId = "org-polling";

		expect(() => {
			for (let i = 0; i < 300; i++) {
				checkOrganizationSessionCountRateLimit(userId, organizationId);
			}
		}).not.toThrow();
	});

	test("blocks sustained traffic above the refresh limit", () => {
		const userId = `test-session-count-over-${Date.now()}`;
		const organizationId = "org-over";

		for (let i = 0; i < 300; i++) {
			checkOrganizationSessionCountRateLimit(userId, organizationId);
		}

		expect(() =>
			checkOrganizationSessionCountRateLimit(userId, organizationId),
		).toThrow("Session count refresh is temporarily limited");
	});

	test("keeps organization limits independent", () => {
		const userId = `test-session-count-orgs-${Date.now()}`;

		for (let i = 0; i < 300; i++) {
			checkOrganizationSessionCountRateLimit(userId, "org-at-limit");
		}

		expect(() =>
			checkOrganizationSessionCountRateLimit(userId, "org-fresh"),
		).not.toThrow();
	});
});

describe("checkIngestRequestRateLimit", () => {
	test("allows requests through the cap, then throws", () => {
		const userId = `test-ingest-requests-cap-${Date.now()}`;
		for (let index = 0; index < INGEST_REQUESTS_MAX; index += 1) {
			checkIngestRequestRateLimit(userId);
		}
		expect(() => checkIngestRequestRateLimit(userId)).toThrow(
			"Rate limit exceeded",
		);
	});

	test("keeps per-user request limits independent", () => {
		const userA = `test-ingest-requests-a-${Date.now()}`;
		const userB = `test-ingest-requests-b-${Date.now()}`;
		for (let index = 0; index < INGEST_REQUESTS_MAX; index += 1) {
			checkIngestRequestRateLimit(userA);
		}
		expect(() => checkIngestRequestRateLimit(userB)).not.toThrow();
	});

	test("evicts request entries after the window", () => {
		const userId = `test-ingest-requests-evict-${Date.now()}`;
		const realNow = Date.now;
		let fakeTime = 1_700_000_000_000;
		Date.now = () => fakeTime;
		try {
			for (let index = 0; index < INGEST_REQUESTS_MAX; index += 1) {
				checkIngestRequestRateLimit(userId);
			}
			fakeTime += INGEST_REQUESTS_WINDOW_MS + 1;
			expect(() => checkIngestRequestRateLimit(userId)).not.toThrow();
		} finally {
			Date.now = realNow;
		}
	});
});

describe("checkIngestByteRateLimit", () => {
	test("allows weighted bytes through the cap, then throws", () => {
		const userId = `test-ingest-bytes-cap-${Date.now()}`;
		const firstWeight = Math.floor(INGEST_BYTES_MAX / 2);
		checkIngestByteRateLimit(userId, firstWeight);
		checkIngestByteRateLimit(userId, INGEST_BYTES_MAX - firstWeight);
		expect(() => checkIngestByteRateLimit(userId, 1)).toThrow(
			"Rate limit exceeded",
		);
	});

	test("keeps per-user byte limits independent", () => {
		const userA = `test-ingest-bytes-a-${Date.now()}`;
		const userB = `test-ingest-bytes-b-${Date.now()}`;
		checkIngestByteRateLimit(userA, INGEST_BYTES_MAX);
		expect(() => checkIngestByteRateLimit(userB, 1)).not.toThrow();
	});

	test("rejects one weight over the full cap", () => {
		const userId = `test-ingest-bytes-single-${Date.now()}`;
		expect(() =>
			checkIngestByteRateLimit(userId, INGEST_BYTES_MAX + 1),
		).toThrow("Rate limit exceeded");
	});

	test("evicts byte samples after the window", () => {
		const userId = `test-ingest-bytes-evict-${Date.now()}`;
		const realNow = Date.now;
		let fakeTime = 1_700_000_000_000;
		Date.now = () => fakeTime;
		try {
			checkIngestByteRateLimit(userId, INGEST_BYTES_MAX);
			fakeTime += INGEST_BYTES_WINDOW_MS + 1;
			expect(() => checkIngestByteRateLimit(userId, 1)).not.toThrow();
		} finally {
			Date.now = realNow;
		}
	});
});

describe("checkHookIngestRateLimit", () => {
	test("allows requests under the limit", () => {
		const userId = `test-hook-under-${Date.now()}`;
		expect(() => checkHookIngestRateLimit(userId, "session-1")).not.toThrow();
	});

	test("repeated uploads of an existing session_id do not exhaust the cap", () => {
		const userId = `test-hook-dedup-${Date.now()}`;
		// Fill the limiter to the cap with distinct session_ids.
		for (let i = 0; i < 500; i++) {
			checkHookIngestRateLimit(userId, `session-${i}`);
		}
		// At cap. Hammering an existing id (Codex turn-complete pattern) must
		// not throw — repeats don't claim new slots. If this regresses, every
		// 501st turn would 429 even though it's the same session.
		expect(() => {
			for (let i = 0; i < 1000; i++) {
				checkHookIngestRateLimit(userId, "session-1");
			}
		}).not.toThrow();
	});

	test("throws once distinct session_ids exceed the limit", () => {
		const userId = `test-hook-over-${Date.now()}`;
		// Default cap is 500 distinct sessions per hour.
		for (let i = 0; i < 500; i++) {
			checkHookIngestRateLimit(userId, `session-${i}`);
		}
		expect(() => checkHookIngestRateLimit(userId, "session-overflow")).toThrow(
			"Rate limit exceeded",
		);
	});

	test("different users have independent limits", () => {
		const userA = `test-hook-a-${Date.now()}`;
		const userB = `test-hook-b-${Date.now()}`;
		for (let i = 0; i < 500; i++) {
			checkHookIngestRateLimit(userA, `session-${i}`);
		}
		// userA is exhausted; userB starts fresh.
		expect(() =>
			checkHookIngestRateLimit(userB, "session-fresh"),
		).not.toThrow();
	});

	test("entries past the window are evicted, freeing slots", () => {
		const userId = `test-hook-evict-${Date.now()}`;
		const realNow = Date.now;
		let fakeTime = 1_700_000_000_000;
		Date.now = () => fakeTime;
		try {
			for (let i = 0; i < 500; i++) {
				checkHookIngestRateLimit(userId, `session-${i}`);
			}
			// Advance past the default 1h window. All seeded entries should
			// be evicted on the next call, freeing the cap.
			fakeTime += 3600 * 1000 + 1;
			expect(() =>
				checkHookIngestRateLimit(userId, "session-after-window"),
			).not.toThrow();
		} finally {
			Date.now = realNow;
		}
	});
});

describe("checkManualIngestRateLimit", () => {
	test("allows requests under the cap", () => {
		const userId = `test-manual-under-${Date.now()}`;
		expect(() => checkManualIngestRateLimit(userId, "session-1")).not.toThrow();
	});

	test("manual and hook caps are independent buckets", () => {
		const userId = `test-independent-${Date.now()}`;
		// A session in the manual bucket must not consume hook budget.
		checkManualIngestRateLimit(userId, "session-manual-1");
		// Hook bucket should still allow its full 500 distinct sessions.
		for (let i = 0; i < 500; i++) {
			checkHookIngestRateLimit(userId, `session-hook-${i}`);
		}
		// 501st new hook session throws — confirms hook cap is intact.
		expect(() =>
			checkHookIngestRateLimit(userId, "session-hook-overflow"),
		).toThrow("Rate limit exceeded");
	});
});
