import { describe, expect, test } from "bun:test";
import {
	contract,
	SESSION_DETAIL_REVISION_ERRORS,
	SessionDetailOverviewInputSchema,
	SessionDetailOverviewSchema,
	SessionDetailStaleRevisionDataSchema,
	SessionDetailSubagentInputSchema,
	SessionDetailSubagentSchema,
	SessionDetailTurnInputSchema,
	SessionDetailTurnSchema,
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
		expect(contract.analytics.sessions.detailSubagent).toBe(
			sessionDetailProcedureContracts.detailSubagent,
		);
		expect(contract.analytics.sessions.detailTurn).toBe(
			sessionDetailProcedureContracts.detailTurn,
		);
	});

	test("validates a bounded overview without transcript bodies", () => {
		const overview = {
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
				totalInteractions: 1,
				totalTokens: 150,
				userId: "user-1",
			},
			subagents: [],
			turnPage: {
				items: [
					{
						activityResolution: "exact",
						durationSeconds: 60,
						editedFiles: ["src/a.ts"],
						endedAt: "2026-08-16T08:31:00.123Z",
						errorCount: 0,
						errorEvents: [],
						estimatedCost: 0.42,
						hasBody: true,
						index: 0,
						inputTokens: 120,
						outputTokens: 30,
						responsePreview: "Done",
						skills: ["testing-bun"],
						skillEvents: [
							{
								at: "2026-08-16T08:30:30.123Z",
								skill: "testing-bun",
							},
						],
						slashCommands: [],
						startedAt: "2026-08-16T08:30:00.123Z",
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
						userPreview: "Please change it",
					},
				],
				nextCursor: null,
				total: 1,
			},
		};

		const parsedOverview = SessionDetailOverviewSchema.parse(overview);
		expect(parsedOverview.revision).toBe(overview.revision);
		expect(parsedOverview.turnPage.items[0]?.usageCalls).toHaveLength(1);
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
					events: [
						{
							id: "reasoning-1",
							kind: "reasoning",
							text: "Think",
							timestamp: "2026-08-16T08:30:01.123Z",
						},
						{
							id: "tool-1",
							input: { command: "bun test" },
							kind: "tool",
							result: { content: "ok", isError: false },
							timestamp: "2026-08-16T08:30:02.123Z",
							toolName: "Bash",
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
});
