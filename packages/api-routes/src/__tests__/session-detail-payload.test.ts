import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
	contract,
	SESSION_DETAIL_REVISION_ERRORS,
	SESSION_DETAIL_WINDOW_ERRORS,
	SessionDetailOverviewInputSchema,
	SessionDetailOverviewSchema,
	SessionDetailSpineInputSchema,
	SessionDetailSpineSchema,
	SessionDetailStaleRevisionDataSchema,
	SessionDetailSubagentInputSchema,
	SessionDetailSubagentSchema,
	SessionDetailTurnInputSchema,
	SessionDetailTurnSchema,
	SessionDetailWindowRequestSchema,
	SessionDetailWindowSchema,
	sessionDetailProcedureContracts,
} from "../index.js";

describe("session detail payload contracts", () => {
	test("bounds the initial turn-summary page", () => {
		expect(
			SessionDetailOverviewInputSchema.parse({ sessionId: "session-1" }),
		).toEqual({
			sessionId: "session-1",
			turnLimit: 100,
		});
		expect(
			SessionDetailOverviewInputSchema.safeParse({
				sessionId: "session-1",
				turnLimit: 101,
			}).success,
		).toBe(false);
	});

	test("binds body requests and stale errors to explicit revisions", () => {
		const input = {
			revision: "2026-08-16T08:30:00.123Z",
			sessionId: "session-1",
		};

		expect(
			SessionDetailTurnInputSchema.parse({ ...input, turnId: "turn-1" }),
		).toEqual({ ...input, turnId: "turn-1" });
		expect(SessionDetailSpineInputSchema.parse(input)).toEqual(input);
		expect(
			SessionDetailSubagentInputSchema.parse({
				...input,
				subagentId: "agent-1",
			}),
		).toEqual({ ...input, subagentId: "agent-1" });
		expect(
			SessionDetailTurnInputSchema.safeParse({
				...input,
				ownerId: "caller-controlled-owner",
				turnId: "turn-1",
			}).success,
		).toBe(false);
		expect(
			SessionDetailOverviewInputSchema.safeParse({
				organizationId: "caller-controlled-organization",
				sessionId: input.sessionId,
			}).success,
		).toBe(false);
		expect(
			SessionDetailSubagentInputSchema.safeParse({
				...input,
				ownerId: "caller-controlled-owner",
				subagentId: "agent-1",
			}).success,
		).toBe(false);
		expect(
			SessionDetailStaleRevisionDataSchema.parse({
				currentRevision: "2026-08-16T08:31:00.456Z",
				requestedRevision: input.revision,
			}),
		).toEqual({
			currentRevision: "2026-08-16T08:31:00.456Z",
			requestedRevision: input.revision,
		});
		expect(SESSION_DETAIL_REVISION_ERRORS.STALE_REVISION.status).toBe(409);
		expect(
			Object.values(sessionDetailProcedureContracts).every(
				(procedure) =>
					procedure["~orpc"].errorMap.STALE_REVISION?.status === 409,
			),
		).toBe(true);
		expect(contract.analytics.sessions.detailOverview).toBe(
			sessionDetailProcedureContracts.detailOverview,
		);
		expect(contract.analytics.sessions.detailSpine).toBe(
			sessionDetailProcedureContracts.detailSpine,
		);
		expect(contract.analytics.sessions.detailSubagent).toBe(
			sessionDetailProcedureContracts.detailSubagent,
		);
		expect(contract.analytics.sessions.detailTurn).toBe(
			sessionDetailProcedureContracts.detailTurn,
		);
	});

	test("validates an ordered, lean session spine", () => {
		const spine = SessionDetailSpineSchema.parse({
			revision: "2026-08-16T08:30:00.123Z",
			turns: [
				{ eventCount: 12, responseBytes: 4_096, turnId: "turn-1" },
				{ eventCount: 3, responseBytes: 512, turnId: "turn-2" },
			],
		});

		expect(spine.turns.map((turn) => turn.turnId)).toEqual([
			"turn-1",
			"turn-2",
		]);
	});

	test("accepts only the strict session detail window request variants", () => {
		const base = { includeBodies: true as const, sessionId: "session-1" };
		const revision = "2026-08-16T08:30:00.123Z";
		const requests = [
			{ ...base, mode: "initial" as const },
			{
				...base,
				anchorTurnId: "turn-20",
				mode: "anchor" as const,
				revision,
			},
			{ ...base, cursor: "opaque-older", mode: "older" as const },
			{ ...base, cursor: "opaque-newer", mode: "newer" as const },
		];

		for (const request of requests) {
			expect(SessionDetailWindowRequestSchema.parse(request)).toEqual(request);
		}
		expect(
			SessionDetailWindowRequestSchema.safeParse({
				...base,
				cursor: "not-allowed",
				mode: "initial",
			}).success,
		).toBe(false);
		expect(
			SessionDetailWindowRequestSchema.safeParse({
				mode: "initial",
				sessionId: "session-1",
			}).success,
		).toBe(false);
		expect(
			SessionDetailWindowRequestSchema.safeParse({
				...base,
				anchorTurnId: "turn-20",
				mode: "anchor",
			}).success,
		).toBe(false);
		expect(SESSION_DETAIL_WINDOW_ERRORS.STALE_REVISION.status).toBe(409);
		expect(SESSION_DETAIL_WINDOW_ERRORS.ANCHOR_NOT_FOUND.status).toBe(404);
		expect(contract.analytics.sessions.detailWindow).toBe(
			sessionDetailProcedureContracts.detailWindow,
		);
	});

	test("validates a bounded overview without transcript bodies", () => {
		const overview = {
			activityTotals: {
				edit: 1,
				error: 1,
				read: 1,
				signal: 1,
				signalScanVersion: 1,
				skill: 1,
				subagent: 1,
				write: 0,
			},
			context: {
				errors: [{ count: 1, label: "Bash" }],
				files: [
					{ operation: "read", path: "src/a.ts" },
					{ operation: "edited", path: "src/b.ts" },
				],
			},
			revision: "2026-08-16T08:30:00.123Z",
			session: {
				durationMinutes: 1,
				estimatedCost: 0.42,
				gitBranch: "main",
				gitSha: null,
				inputTokens: 120,
				lastInteractionDate: "2026-08-16T08:31:00.123Z",
				modelUsed: "claude-sonnet-4-5",
				outputTokens: 30,
				projectPath: "/repo",
				repository: "owner/repo",
				sessionDate: "2026-08-16T08:30:00.123Z",
				sessionId: "session-1",
				skills: ["testing-bun"],
				slashCommands: [],
				source: "claude_code",
				totalTokens: 150,
				userId: "user-1",
			},
			subagents: [
				{
					estimatedCost: 0.12,
					hasTranscript: true,
					inputTokens: 400,
					model: "claude-fable-5",
					outputTokens: 50,
					subagentId: "agent-1",
					totalTokens: 450,
				},
			],
			turnPage: {
				items: [
					{
						activityResolution: "exact",
						durationSeconds: 60,
						editedFiles: ["src/a.ts"],
						endedAt: "2026-08-16T08:31:00.123Z",
						errorCount: 1,
						errorEvents: [
							{
								at: "2026-08-16T08:30:25.123Z",
								content: "Error: command failed",
							},
						],
						estimatedCost: 0.42,
						hasBody: true,
						index: 0,
						inputTokens: 120,
						outputTokens: 30,
						responsePreview: "Done",
						modelSignalCount: 1,
						signalCount: 1,
						signalOccurrences: [{ category: "apology", matchedText: "Sorry" }],
						signalOccurrencesOmittedCount: 0,
						signalOccurrencesTruncated: false,
						skills: ["testing-bun"],
						skillCount: 1,
						skillEvents: [
							{
								at: "2026-08-16T08:30:30.123Z",
								skill: "testing-bun",
							},
						],
						slashCommands: [],
						startedAt: "2026-08-16T08:30:00.123Z",
						subagentEvents: [
							{
								at: "2026-08-16T08:30:22.123Z",
								count: 1,
								eventId: "delegation-1",
								subagentId: "agent-1",
							},
						],
						toolCallCount: 1,
						turnId: "turn-1",
						usageCalls: [
							{
								at: "2026-08-16T08:30:20.123Z",
								cacheCreationInputTokens: 10,
								cacheReadInputTokens: 20,
								contextWindow: 200_000,
								freshInputTokens: 90,
								model: "claude-sonnet-4-5",
								outputTokens: 30,
							},
						],
						userCharacterCount: 16,
						userPreview: "Please change it",
					},
				],
				nextCursor: null,
				total: 1,
			},
		};

		const parsedOverview = SessionDetailOverviewSchema.parse(overview);
		expect(parsedOverview.activityTotals.signalScanVersion).toBe(1);
		expect(parsedOverview.context.errors[0]?.label).toBe("Bash");
		expect(parsedOverview.context.files[0]?.operation).toBe("read");
		expect(parsedOverview.revision).toBe(overview.revision);
		expect(parsedOverview.subagents[0]?.inputTokens).toBe(400);
		expect(parsedOverview.turnPage.items[0]?.errorEvents[0]?.content).toBe(
			"Error: command failed",
		);
		expect(
			parsedOverview.turnPage.items[0]?.subagentEvents?.[0]?.subagentId,
		).toBe("agent-1");
		expect(parsedOverview.turnPage.items[0]?.userCharacterCount).toBe(16);
		expect(parsedOverview.turnPage.items[0]?.usageCalls).toHaveLength(1);
		expect(parsedOverview.turnPage.items[0]?.modelSignalCount).toBe(1);
		expect(parsedOverview.turnPage.items[0]?.signalOccurrences).toEqual([
			{ category: "apology", matchedText: "Sorry" },
		]);
		expect(
			SessionDetailOverviewSchema.safeParse({
				...overview,
				activityTotals: undefined,
			}).success,
		).toBe(false);
		expect(
			SessionDetailOverviewSchema.safeParse({
				...overview,
				session: { ...overview.session, totalInteractions: 1 },
			}).success,
		).toBe(false);
		expect(
			SessionDetailOverviewSchema.safeParse({
				...overview,
				turnPage: {
					...overview.turnPage,
					items: [
						{
							...overview.turnPage.items[0],
							userPreview: "🙂".repeat(141),
						},
					],
				},
			}).success,
		).toBe(false);
	});

	test("validates normalized turn items and a revision-keyed subagent body", () => {
		const revision = "2026-08-16T08:30:00.123Z";
		const turn = {
			responseItems: [
				{
					agentName: "/root/reviewer",
					events: [
						{
							id: "reasoning-1",
							kind: "reasoning",
							text: "Think",
							timestamp: "2026-08-16T08:30:01.123Z",
						},
						{
							id: "tool-1",
							input: { description: "Run the tests" },
							kind: "tool",
							result: {
								content: "ok",
								isError: false,
								subagentId: "agent-nested",
							},
							timestamp: "2026-08-16T08:30:02.123Z",
							toolName: "Agent",
						},
					],
					executionMode: "default",
					id: "agent-1",
					kind: "agent",
					timestamp: "2026-08-16T08:30:01.123Z",
				},
			],
			revision,
			turnId: "turn-1",
			userItems: [
				{
					content: "Run the tests",
					id: "user-1",
					kind: "user",
					timestamp: "2026-08-16T08:30:00.123Z",
				},
			],
		};

		const parsedTurn = SessionDetailTurnSchema.parse(turn);
		expect(parsedTurn.turnId).toBe(turn.turnId);
		expect(parsedTurn.responseItems[0]?.kind).toBe("agent");
		const parsedAgent = parsedTurn.responseItems[0];
		assert(parsedAgent?.kind === "agent");
		expect(parsedAgent.agentName).toBe("/root/reviewer");
		const parsedDelegation = parsedAgent.events[1];
		assert(parsedDelegation?.kind === "tool");
		expect(parsedDelegation.result?.subagentId).toBe("agent-nested");
		expect(
			SessionDetailTurnSchema.safeParse({
				...turn,
				responseItems: [
					...turn.responseItems,
					{
						id: "summary-1",
						kind: "summary",
						text: "Compacted context",
						timestamp: undefined,
					},
				],
			}).success,
		).toBe(true);
		expect(
			SessionDetailTurnSchema.safeParse({
				...turn,
				responseItems: [{ kind: "unbounded", value: { anything: true } }],
			}).success,
		).toBe(false);
		expect(
			SessionDetailSubagentSchema.parse({
				content: '{"type":"assistant"}',
				revision,
				subagentId: "agent-1",
			}),
		).toEqual({
			content: '{"type":"assistant"}',
			revision,
			subagentId: "agent-1",
		});
	});

	test("validates window summaries with complete, pending, and oversized bodies", () => {
		const summary = {
			activityResolution: "exact" as const,
			durationSeconds: 60,
			editedFiles: ["src/a.ts"],
			endedAt: "2026-08-16T08:31:00.123Z",
			errorCount: 0,
			errorEvents: [],
			estimatedCost: 0.42,
			hasBody: true,
			index: 0,
			inputTokens: 120,
			modelSignalCount: 0,
			outputTokens: 30,
			responsePreview: "Done",
			signalCount: 0,
			signalOccurrences: [],
			signalOccurrencesOmittedCount: 0,
			signalOccurrencesTruncated: false,
			skills: [],
			skillCount: 0,
			skillEvents: [],
			slashCommands: [],
			startedAt: "2026-08-16T08:30:00.123Z",
			toolCallCount: 1,
			turnId: "turn-1",
			usageCalls: [],
			userPreview: "Please change it",
		};
		const parsed = SessionDetailWindowSchema.parse({
			newerCursor: "next",
			olderCursor: null,
			revision: "2026-08-16T08:30:00.123Z",
			total: 3,
			turns: [
				{
					...summary,
					body: { responseItems: [], userItems: [] },
					bodyOmitted: null,
				},
				{
					...summary,
					body: null,
					bodyOmitted: null,
					index: 1,
					turnId: "turn-2",
				},
				{
					...summary,
					body: null,
					bodyOmitted: "oversized",
					index: 2,
					turnId: "turn-3",
				},
			],
		});

		expect(parsed.turns[0]?.body).toEqual({
			responseItems: [],
			userItems: [],
		});
		expect(parsed.turns[2]?.bodyOmitted).toBe("oversized");
	});
});
