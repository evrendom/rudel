import { describe, expect, test } from "bun:test";
import {
	SESSION_DETAIL_WINDOW_INITIAL_TURNS,
	SESSION_DETAIL_WINDOW_MAX_RAW_BYTES,
	SESSION_DETAIL_WINDOW_MAX_TURN_BYTES,
	SESSION_DETAIL_WINDOW_PAGE_TURNS,
	SessionDetailOverviewSchema,
	SessionDetailWindowSchema,
} from "@rudel/api-routes";
import {
	assembleSessionDetailWindow,
	bucketSessionDetailUsageCalls,
	decodeSessionDetailWindowCursor,
	deriveSessionDetail,
	getSessionDetailOverviewPage,
	getSessionDetailSubagent,
	getSessionDetailTurn,
	SESSION_DETAIL_OVERVIEW_MAX_BYTES,
	SessionDetailAnchorNotFoundError,
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

function createCodexTranscript() {
	return [
		line({
			payload: { id: "codex-session-1" },
			timestamp: "2026-08-16T11:00:00.000Z",
			type: "session_meta",
		}),
		line({
			payload: { collaboration_mode_kind: "default", type: "task_started" },
			timestamp: "2026-08-16T11:00:01.000Z",
			type: "event_msg",
		}),
		line({
			payload: {
				content: [{ text: "Inspect the Codex session", type: "input_text" }],
				role: "user",
				type: "message",
			},
			timestamp: "2026-08-16T11:00:02.000Z",
			type: "response_item",
		}),
		line({
			payload: {
				content: [{ text: "Codex session inspected", type: "output_text" }],
				role: "assistant",
				type: "message",
			},
			timestamp: "2026-08-16T11:00:03.000Z",
			type: "response_item",
		}),
		line({
			payload: {
				info: {
					last_token_usage: {
						cached_input_tokens: 100,
						input_tokens: 1_000,
						output_tokens: 50,
					},
					model_context_window: 300_000,
					total_token_usage: {
						cached_input_tokens: 100,
						input_tokens: 1_000,
						output_tokens: 50,
					},
				},
				model: "gpt-5.6-sol",
				type: "token_count",
			},
			timestamp: "2026-08-16T11:00:04.000Z",
			type: "event_msg",
		}),
	].join("\n");
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

	test("derives the additive overview and stable body lookup for a Codex session", () => {
		const input = snapshot(createCodexTranscript());
		input.source = "codex";
		input.modelUsed = "gpt-5.6-sol";
		const derivation = deriveSessionDetail(input);
		const overview = getSessionDetailOverviewPage({ derivation, limit: 100 });
		const turn = overview.turnPage.items[0];

		expect(SessionDetailOverviewSchema.parse(overview)).toEqual(overview);
		expect(overview.session.source).toBe("codex");
		expect(turn?.turnId).toMatch(/^codex-/u);
		expect(turn?.userPreview).toBe("Inspect the Codex session");
		expect(turn?.responsePreview).toBe("Codex session inspected");
		expect(turn?.usageCalls[0]).toMatchObject({
			cacheReadInputTokens: 100,
			freshInputTokens: 900,
			model: "gpt-5.6-sol",
			outputTokens: 50,
		});
		expect(getSessionDetailTurn(derivation, turn?.turnId ?? "")).not.toBeNull();
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

	test("returns a normal-sized session in one byte-bounded initial window", () => {
		const derivation = deriveSessionDetail(snapshot(createTranscript(75)));
		const initial = assembleSessionDetailWindow({
			derivation,
			request: {
				includeBodies: true,
				mode: "initial",
				sessionId: "session-1",
			},
		});
		expect(SessionDetailWindowSchema.parse(initial.window)).toEqual(
			initial.window,
		);
		expect(initial.window.turns).toHaveLength(75);
		expect(initial.window.olderCursor).toBeNull();
		expect(initial.window.newerCursor).toBeNull();
		expect(initial.serializedBytes).toBeLessThanOrEqual(
			SESSION_DETAIL_WINDOW_MAX_RAW_BYTES,
		);
	});

	test("keeps high turn caps as directional pagination safety rails", () => {
		const derivation = deriveSessionDetail(snapshot(createTranscript(450)));
		const initial = assembleSessionDetailWindow({
			derivation,
			request: {
				includeBodies: true,
				mode: "initial",
				sessionId: "session-1",
			},
		});
		expect(initial.window.turns).toHaveLength(
			SESSION_DETAIL_WINDOW_INITIAL_TURNS,
		);
		expect(initial.window.newerCursor).not.toBeNull();

		const newer = assembleSessionDetailWindow({
			derivation,
			request: {
				cursor: initial.window.newerCursor ?? "",
				includeBodies: true,
				mode: "newer",
				sessionId: "session-1",
			},
		});
		expect(newer.window.turns).toHaveLength(SESSION_DETAIL_WINDOW_PAGE_TURNS);
		expect(newer.window.turns[0]?.index).toBe(
			SESSION_DETAIL_WINDOW_INITIAL_TURNS,
		);
		expect(newer.window.olderCursor).not.toBeNull();
		const olderCursor = decodeSessionDetailWindowCursor(
			newer.window.olderCursor ?? "",
		);
		expect(olderCursor).toMatchObject({
			direction: "older",
			revision: derivation.revision,
		});

		const older = assembleSessionDetailWindow({
			derivation,
			request: {
				cursor: newer.window.olderCursor ?? "",
				includeBodies: true,
				mode: "older",
				sessionId: "session-1",
			},
		});
		expect(older.window.turns.at(-1)?.index).toBe(
			SESSION_DETAIL_WINDOW_INITIAL_TURNS - 1,
		);
	});

	test("centers anchor windows and reports stale or missing anchors explicitly", () => {
		const derivation = deriveSessionDetail(snapshot(createTranscript(450)));
		const anchorTurnId = derivation.turnSummaries[225]?.turnId ?? "";
		const anchored = assembleSessionDetailWindow({
			derivation,
			request: {
				anchorTurnId,
				includeBodies: true,
				mode: "anchor",
				revision: derivation.revision,
				sessionId: "session-1",
			},
		});
		expect(anchored.window.turns.map((turn) => turn.turnId)).toContain(
			anchorTurnId,
		);
		expect(anchored.window.olderCursor).not.toBeNull();
		expect(anchored.window.newerCursor).not.toBeNull();

		expect(() =>
			assembleSessionDetailWindow({
				derivation,
				request: {
					anchorTurnId: "removed-turn",
					includeBodies: true,
					mode: "anchor",
					revision: derivation.revision,
					sessionId: "session-1",
				},
			}),
		).toThrow(SessionDetailAnchorNotFoundError);
		expect(() =>
			assembleSessionDetailWindow({
				derivation,
				request: {
					anchorTurnId,
					includeBodies: true,
					mode: "anchor",
					revision: "2026-08-16T08:31:00.456Z",
					sessionId: "session-1",
				},
			}),
		).toThrow(StaleSessionDetailCursorError);
	});

	test("omits single oversized bodies and truncates the response before 4 MiB", () => {
		const derivation = deriveSessionDetail(snapshot(createTranscript(8)));
		const turnBodies = new Map(derivation.turnBodies);
		for (const [turnId, turn] of turnBodies) {
			turnBodies.set(turnId, {
				...turn,
				responseItems: [
					{
						id: `summary-${turnId}`,
						kind: "summary",
						text: "x".repeat(700_000),
					},
				],
			});
		}
		const firstTurnId = derivation.turnSummaries[0]?.turnId ?? "";
		const firstTurn = turnBodies.get(firstTurnId);
		if (!firstTurn) {
			throw new Error("Expected the synthetic first turn body");
		}
		turnBodies.set(firstTurnId, {
			...firstTurn,
			responseItems: [
				{
					id: "oversized-summary",
					kind: "summary",
					text: "x".repeat(SESSION_DETAIL_WINDOW_MAX_TURN_BYTES + 1_024),
				},
			],
		});

		const assembly = assembleSessionDetailWindow({
			derivation: { ...derivation, turnBodies },
			request: {
				includeBodies: true,
				mode: "initial",
				sessionId: "session-1",
			},
		});
		expect(assembly.window.turns[0]).toMatchObject({
			body: null,
			bodyOmitted: "oversized",
			turnId: firstTurnId,
		});
		expect(assembly.oversizedTurns).toBe(1);
		expect(assembly.truncatedByBudget).toBe(true);
		expect(assembly.window.turns.length).toBeLessThan(8);
		expect(assembly.window.newerCursor).not.toBeNull();
		expect(assembly.serializedBytes).toBeLessThanOrEqual(
			SESSION_DETAIL_WINDOW_MAX_RAW_BYTES,
		);
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

	test("indexes turn and subagent bodies once for cache reuse", () => {
		const input = snapshot(createTranscript(2));
		input.subagents = { "agent-1": "raw subagent jsonl" };
		const derivation = deriveSessionDetail(input);
		const turnId = derivation.turnSummaries[0]?.turnId;
		expect(turnId).toBe("user-0");
		const first = getSessionDetailTurn(derivation, turnId ?? "");
		expect(getSessionDetailTurn(derivation, turnId ?? "")).toBe(first);
		expect(first?.revision).toBe(input.revision);
		expect(getSessionDetailSubagent(derivation, "agent-1")).toEqual({
			content: "raw subagent jsonl",
			revision: input.revision,
			subagentId: "agent-1",
		});
	});
});
