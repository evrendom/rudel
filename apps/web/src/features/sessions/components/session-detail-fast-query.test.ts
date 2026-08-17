import {
	SessionDetailOverviewSchema,
	SessionDetailWindowSchema,
} from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import {
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_OVERVIEW_STALE_TIME_MS,
	sessionDetailOverviewPageQueryKey,
	sessionDetailSubagentQueryKey,
	sessionDetailTurnQueryKey,
	sessionDetailWindowQueryKey,
	sessionDetailWindowQueryPrefix,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import {
	parseSessionDetailOverviewResponse,
	parseSessionDetailWindowResponse,
} from "./session-detail-fast-response";

const revision = "2026-08-16T08:30:00.123Z";

function overviewFixture() {
	return SessionDetailOverviewSchema.parse({
		revision,
		session: {
			durationMinutes: 90,
			estimatedCost: 470.945,
			gitBranch: "main",
			gitSha: "abc",
			inputTokens: 1_000,
			lastInteractionDate: "2026-08-16T09:30:00.123Z",
			modelUsed: "gpt-5.6-sol",
			outputTokens: 200,
			projectPath: "/src/rudel",
			repository: "rudel/rudel",
			sessionDate: "2026-08-16T08:00:00.123Z",
			sessionId: "session-1",
			skills: ["testing-bun"],
			slashCommands: [],
			source: "codex",
			totalInteractions: 56,
			totalTokens: 1_200,
			userId: "owner-1",
		},
		subagents: [],
		turnPage: {
			items: [
				{
					activityResolution: "exact",
					durationSeconds: 60,
					editedFiles: ["src/index.ts"],
					endedAt: "2026-08-16T08:01:00.123Z",
					errorCount: 0,
					errorEvents: [],
					estimatedCost: 11.6278,
					hasBody: true,
					index: 0,
					inputTokens: 900,
					outputTokens: 50,
					responsePreview: "Done",
					skills: [],
					skillEvents: [],
					slashCommands: [],
					startedAt: "2026-08-16T08:00:00.123Z",
					toolCallCount: 1,
					turnId: "codex-stable-turn",
					usageCalls: [],
					userPreview: "Do the work",
				},
			],
			nextCursor: null,
			total: 1,
		},
	});
}

describe("session detail fast-path query boundaries", () => {
	it("keeps revision and body identity in every immutable query key", () => {
		expect(
			sessionDetailOverviewPageQueryKey({
				revision,
				sessionId: "session-1",
				turnCursor: "cursor-2",
			}),
		).toEqual([
			"session-detail-v2",
			"overview",
			"session-1",
			revision,
			"cursor-2",
		]);
		expect(
			sessionDetailTurnQueryKey({
				revision,
				sessionId: "session-1",
				turnId: "turn-1",
			}),
		).toContain(revision);
		expect(
			sessionDetailSubagentQueryKey({
				revision,
				sessionId: "session-1",
				subagentId: "agent-1",
			}),
		).toContain("agent-1");
		expect(
			sessionDetailWindowQueryKey(
				{
					anchorTurnId: "turn-20",
					includeBodies: true,
					mode: "anchor",
					revision,
					sessionId: "session-1",
				},
				"skeletons:delay:100",
			),
		).toEqual([
			"session-detail-v2",
			"window",
			"session-1",
			"skeletons:delay:100",
			expect.objectContaining({
				anchorTurnId: "turn-20",
				mode: "anchor",
				revision,
			}),
		]);
		expect(SESSION_DETAIL_OVERVIEW_STALE_TIME_MS).toBe(60_000);
		expect(SESSION_DETAIL_BODY_CACHE_TIME_MS).toBe(600_000);
		expect(sessionDetailWindowQueryPrefix("session-1")).toEqual([
			"session-detail-v2",
			"window",
			"session-1",
		]);
	});

	it("retains valid bodies while recovering drifted window summary fields", () => {
		const summary = overviewFixture().turnPage.items[0];
		const fixture = SessionDetailWindowSchema.parse({
			newerCursor: null,
			olderCursor: null,
			revision,
			total: 1,
			turns: [
				{
					...summary,
					body: {
						responseItems: [
							{
								id: "summary-1",
								kind: "summary",
								text: "Finished",
							},
						],
						userItems: [],
					},
					bodyOmitted: null,
				},
			],
		});
		const parsed = parseSessionDetailWindowResponse({
			...fixture,
			turns: [{ ...fixture.turns[0], responsePreview: 42 }],
		});

		expect(parsed.window.turns[0]?.responsePreview).toBeNull();
		expect(parsed.window.turns[0]?.body?.responseItems[0]).toMatchObject({
			kind: "summary",
			text: "Finished",
		});
		expect(parsed.shapeIssueFields).toContain("turns.0.responsePreview");
	});

	it("recovers safe overview fields without retaining invalid drifted values", () => {
		const fixture = overviewFixture();
		const parsed = parseSessionDetailOverviewResponse(
			{
				...fixture,
				session: { ...fixture.session, estimatedCost: "stale-cost" },
				turnPage: {
					...fixture.turnPage,
					items: [
						{
							...fixture.turnPage.items[0],
							responsePreview: "x".repeat(200),
						},
					],
				},
			},
			"session-1",
		);

		expect(parsed.overview.session.estimatedCost).toBeNull();
		expect(parsed.overview.turnPage.items[0]?.responsePreview).toBeNull();
		expect(parsed.overview.turnPage.items[0]?.turnId).toBe("codex-stable-turn");
		expect(parsed.shapeIssueFields).toContain("session.estimatedCost");
		expect(parsed.shapeIssueFields).toContain(
			"turnPage.items.0.responsePreview",
		);
	});

	it("does not retry shape, revision, or typed stale-revision failures", () => {
		expect(
			shouldRetrySessionDetailFastQuery(0, {
				code: "STALE_REVISION",
			}),
		).toBe(false);
		expect(shouldRetrySessionDetailFastQuery(1, new Error("network"))).toBe(
			false,
		);
	});
});
