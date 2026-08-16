import { describe, expect, test } from "bun:test";
import { SessionDetailOverviewSchema } from "@rudel/api-routes";
import {
	bucketSessionDetailUsageCalls,
	deriveSessionDetail,
	getSessionDetailOverviewPage,
	SESSION_DETAIL_OVERVIEW_MAX_BYTES,
	type SessionDetailRawSnapshot,
	StaleSessionDetailCursorError,
	truncateSessionDetailPreview,
} from "../services/session-detail-derivation.service.js";

function line(value: unknown) {
	return JSON.stringify(value);
}

function createTranscript(turnCount: number, usageCallsPerTurn = 1) {
	const lines: string[] = [];
	for (let turn = 0; turn < turnCount; turn++) {
		const baseMs = Date.UTC(2026, 7, 16, 8, 0, turn);
		lines.push(
			line({
				message: {
					content: `Please inspect turn ${turn} 🙂 `.repeat(20),
					role: "user",
				},
				sessionId: "session-1",
				timestamp: new Date(baseMs).toISOString(),
				type: "user",
				uuid: `user-${turn}`,
			}),
		);
		for (let usage = 0; usage < usageCallsPerTurn; usage++) {
			lines.push(
				line({
					message: {
						content: [
							{
								text: `Completed turn ${turn}, request ${usage}`,
								type: "text",
							},
						],
						id: `message-${turn}-${usage}`,
						model: "claude-opus-5",
						role: "assistant",
						usage: {
							cache_creation_input_tokens: 3,
							cache_read_input_tokens: 5,
							input_tokens: 7,
							output_tokens: 11,
						},
					},
					sessionId: "session-1",
					timestamp: new Date(baseMs + usage + 1).toISOString(),
					type: "assistant",
					uuid: `assistant-${turn}-${usage}`,
				}),
			);
		}
	}
	return lines.join("\n");
}

function snapshot(
	content: string,
	revision = "2026-08-16T08:30:00.123Z",
): SessionDetailRawSnapshot {
	return {
		content,
		durationMinutes: 90,
		gitBranch: "main",
		gitRemote: "github.com/rudel/rudel",
		gitSha: "abc",
		inputTokens: 1_000,
		lastInteractionDate: "2026-08-16T09:30:00.123Z",
		modelUsed: "claude-opus-5",
		organizationId: "org-1",
		outputTokens: 200,
		ownerId: "owner-1",
		packageName: "rudel",
		projectPath: "/src/rudel",
		revision,
		sessionDate: "2026-08-16T08:00:00.123Z",
		sessionId: "session-1",
		skills: ["testing-bun"],
		slashCommands: [],
		source: "claude_code",
		subagents: {},
		totalInteractions: 112,
		totalTokens: 1_200,
	};
}

function responseBytes(value: unknown) {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}

describe("session detail derivation", () => {
	test("keeps the measured 56-turn baseline profile under 250 KB", () => {
		const derivation = deriveSessionDetail(snapshot(createTranscript(56, 2)));
		const overview = getSessionDetailOverviewPage({
			derivation,
			limit: 100,
		});

		expect(SessionDetailOverviewSchema.parse(overview)).toEqual(overview);
		expect(overview.turnPage.items).toHaveLength(56);
		expect(responseBytes(overview)).toBeLessThanOrEqual(
			SESSION_DETAIL_OVERVIEW_MAX_BYTES,
		);
		expect(
			overview.turnPage.items.every(
				(item) => item.activityResolution === "exact",
			),
		).toBe(true);
	});

	test("paginates a synthetic 500-turn session with revision-bound cursors", () => {
		const derivation = deriveSessionDetail(snapshot(createTranscript(500)));
		const first = getSessionDetailOverviewPage({ derivation, limit: 100 });
		expect(first.turnPage.items).toHaveLength(100);
		expect(first.turnPage.nextCursor).not.toBeNull();
		expect(responseBytes(first)).toBeLessThanOrEqual(
			SESSION_DETAIL_OVERVIEW_MAX_BYTES,
		);

		const changed = deriveSessionDetail(
			snapshot(createTranscript(500), "2026-08-16T08:31:00.456Z"),
		);
		expect(() =>
			getSessionDetailOverviewPage({
				cursor: first.turnPage.nextCursor ?? undefined,
				derivation: changed,
				limit: 100,
			}),
		).toThrow(StaleSessionDetailCursorError);
	});

	test("buckets an event-dense turn without changing token sums", () => {
		const derivation = deriveSessionDetail(snapshot(createTranscript(1, 800)));
		const overview = getSessionDetailOverviewPage({ derivation, limit: 100 });
		const item = overview.turnPage.items[0];
		expect(item?.activityResolution).toBe("bucketed");
		expect(item?.usageCalls.length).toBeLessThanOrEqual(512);
		expect(responseBytes(overview)).toBeLessThanOrEqual(
			SESSION_DETAIL_OVERVIEW_MAX_BYTES,
		);
		const sums = item?.usageCalls.reduce(
			(total, call) => ({
				cacheCreation: total.cacheCreation + call.cacheCreationInputTokens,
				cacheRead: total.cacheRead + call.cacheReadInputTokens,
				fresh: total.fresh + call.freshInputTokens,
				output: total.output + call.outputTokens,
			}),
			{ cacheCreation: 0, cacheRead: 0, fresh: 0, output: 0 },
		);
		expect(sums).toEqual({
			cacheCreation: 2_400,
			cacheRead: 4_000,
			fresh: 5_600,
			output: 8_800,
		});
	});

	test("preserves every usage component in direct deterministic buckets", () => {
		const calls = bucketSessionDetailUsageCalls(
			Array.from({ length: 25 }, (_, index) => ({
				at: new Date(Date.UTC(2026, 7, 16, 8, 0, index)).toISOString(),
				cacheCreationInputTokens: 2,
				cacheReadInputTokens: 3,
				inputTokens: 5,
				model: "claude-opus-5",
				outputTokens: 7,
			})),
			4,
		);
		expect(calls).toHaveLength(4);
		expect(calls.reduce((sum, call) => sum + call.freshInputTokens, 0)).toBe(
			125,
		);
		expect(
			calls.reduce((sum, call) => sum + call.cacheReadInputTokens, 0),
		).toBe(75);
		expect(
			calls.reduce((sum, call) => sum + call.cacheCreationInputTokens, 0),
		).toBe(50);
		expect(calls.reduce((sum, call) => sum + call.outputTokens, 0)).toBe(175);
	});

	test("truncates previews by Unicode code point after whitespace normalization", () => {
		const preview = truncateSessionDetailPreview(`  ${"🙂".repeat(150)}  `);
		expect(Array.from(preview ?? "")).toHaveLength(140);
		expect(preview?.endsWith("...")).toBe(true);
	});
});
