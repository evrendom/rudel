import {
	SessionDetailOverviewSchema,
	SessionDetailSpineSchema,
	type SessionDetailWindowRequest,
	SessionDetailWindowSchema,
} from "@rudel/api-routes";

export const SESSION_DETAIL_INTEGRATION_SESSION_ID =
	"session-detail-window-integration";
export const SESSION_DETAIL_INTEGRATION_REVISION = "2026-08-17T10:00:00.000Z";
export const SESSION_DETAIL_INTEGRATION_TURN_COUNT = 100;
const OVERVIEW_FIRST_PAGE_TURN_COUNT = 80;
const WINDOW_TURN_COUNT = 20;

export function getSessionDetailIntegrationTurnId(index: number) {
	return `integration-turn-${index.toString().padStart(3, "0")}`;
}

export function buildSessionDetailFastIntegrationOverview() {
	return {
		...buildSessionDetailFastIntegrationOverviewPage(0),
		activityTotalsScope: "session" as const,
	};
}

export function buildSessionDetailFastIntegrationRemainingOverviewPage() {
	return buildSessionDetailFastIntegrationOverviewPage(
		OVERVIEW_FIRST_PAGE_TURN_COUNT,
	);
}

function buildSessionDetailFastIntegrationOverviewPage(startIndex: number) {
	const endIndex =
		startIndex === 0
			? OVERVIEW_FIRST_PAGE_TURN_COUNT
			: SESSION_DETAIL_INTEGRATION_TURN_COUNT;
	return SessionDetailOverviewSchema.parse({
		activityTotals: {
			edit: 0,
			error: 0,
			read: 0,
			signal: 1,
			signalScanVersion: 1,
			skill: 20,
			subagent: 0,
			write: 0,
		},
		revision: SESSION_DETAIL_INTEGRATION_REVISION,
		session: {
			durationMinutes: SESSION_DETAIL_INTEGRATION_TURN_COUNT * 2,
			estimatedCost: 12.34,
			gitBranch: "main",
			gitSha: "13458e65",
			inputTokens: 1_200_000,
			lastInteractionDate: timestamp(SESSION_DETAIL_INTEGRATION_TURN_COUNT, 59),
			modelUsed: "claude-fable-5",
			outputTokens: 180_000,
			projectPath: "/workspace/rudel",
			repository: "rudel",
			sessionDate: timestamp(0),
			sessionId: SESSION_DETAIL_INTEGRATION_SESSION_ID,
			skills: ["testing-bun"],
			slashCommands: [],
			source: "claude_code",
			totalTokens: 1_380_000,
			userId: "integration-user",
		},
		subagents: [],
		turnPage: {
			items: Array.from({ length: endIndex - startIndex }, (_, offset) =>
				buildTurnSummary(startIndex + offset),
			),
			nextCursor:
				endIndex < SESSION_DETAIL_INTEGRATION_TURN_COUNT
					? `overview:${endIndex}`
					: null,
			total: SESSION_DETAIL_INTEGRATION_TURN_COUNT,
		},
	});
}

export function buildSessionDetailFastIntegrationSpine() {
	return SessionDetailSpineSchema.parse({
		revision: SESSION_DETAIL_INTEGRATION_REVISION,
		turns: Array.from(
			{ length: SESSION_DETAIL_INTEGRATION_TURN_COUNT },
			(_, index) => ({
				eventCount: 12,
				responseBytes: 4_000 + index * 100,
				turnId: getSessionDetailIntegrationTurnId(index),
			}),
		),
	});
}

export function buildSessionDetailFastIntegrationWindow(
	request: SessionDetailWindowRequest,
) {
	const indices = getWindowIndices(request);
	const firstIndex = indices[0];
	const lastIndex = indices.at(-1);
	return SessionDetailWindowSchema.parse({
		newerCursor:
			lastIndex !== undefined &&
			lastIndex < SESSION_DETAIL_INTEGRATION_TURN_COUNT - 1
				? `newer:${lastIndex}`
				: null,
		olderCursor:
			firstIndex !== undefined && firstIndex > 0 ? `older:${firstIndex}` : null,
		revision: SESSION_DETAIL_INTEGRATION_REVISION,
		total: SESSION_DETAIL_INTEGRATION_TURN_COUNT,
		turns: indices.map((index) => ({
			...buildTurnSummary(index),
			body: buildTurnBody(index),
			bodyOmitted: null,
		})),
	});
}

function getWindowIndices(request: SessionDetailWindowRequest) {
	if (request.mode === "initial") {
		return range(0, WINDOW_TURN_COUNT);
	}
	if (request.mode === "anchor") {
		const anchorIndex = Number(request.anchorTurnId.split("-").at(-1));
		const start = Math.min(
			Math.max(0, anchorIndex - WINDOW_TURN_COUNT / 2),
			SESSION_DETAIL_INTEGRATION_TURN_COUNT - WINDOW_TURN_COUNT,
		);
		return range(start, WINDOW_TURN_COUNT);
	}
	const boundary = Number(request.cursor.split(":").at(-1));
	if (request.mode === "newer") {
		const start = boundary + 1;
		return range(
			start,
			Math.min(
				WINDOW_TURN_COUNT,
				SESSION_DETAIL_INTEGRATION_TURN_COUNT - start,
			),
		);
	}
	const start = Math.max(0, boundary - WINDOW_TURN_COUNT);
	return range(start, boundary - start);
}

function range(start: number, length: number) {
	return Array.from({ length }, (_, offset) => start + offset);
}

function buildTurnSummary(index: number) {
	const userPreview = `Investigate integration behavior for turn ${index + 1}`;
	const signalOccurrences =
		index === 80 ? [{ category: "positive", matchedText: "Great" }] : [];
	return {
		activityResolution: "exact" as const,
		durationSeconds: 90,
		editedFiles: [`apps/web/src/integration/${index}.tsx`],
		endedAt: timestamp(index, 90),
		errorCount: 0,
		errorEvents: [],
		estimatedCost: 0.12,
		hasBody: true,
		index,
		inputTokens: 10_000 + index * 500,
		modelSignalCount: 0,
		outputTokens: 1_000 + index * 10,
		responsePreview: `Completed integration turn ${index + 1}`,
		signalCount: signalOccurrences.length,
		signalOccurrences,
		signalOccurrencesOmittedCount: 0,
		signalOccurrencesTruncated: false,
		skills: index % 5 === 0 ? ["testing-bun"] : [],
		skillCount: index % 5 === 0 ? 1 : 0,
		skillEvents: [],
		slashCommands: [],
		startedAt: timestamp(index),
		toolCallCount: 10,
		turnId: getSessionDetailIntegrationTurnId(index),
		usageCalls: [
			{
				at: timestamp(index, 1),
				cacheCreationInputTokens: 500,
				cacheReadInputTokens: 2_000,
				contextWindow: 200_000,
				freshInputTokens: 7_500 + index * 500,
				model: "claude-fable-5",
				outputTokens: 1_000 + index * 10,
			},
		],
		userCharacterCount: userPreview.length,
		userPreview,
	};
}

function buildTurnBody(index: number) {
	const turnId = getSessionDetailIntegrationTurnId(index);
	return {
		responseItems: [
			{
				events: [
					{
						id: `${turnId}:reasoning`,
						kind: "reasoning" as const,
						text: `Inspecting the real response pane for turn ${index + 1}. `.repeat(
							24,
						),
						timestamp: timestamp(index, 2),
					},
					{
						content: `Turn ${index + 1} is complete.`,
						id: `${turnId}:message`,
						kind: "message" as const,
						text: `Turn ${index + 1} is complete.`,
						timestamp: timestamp(index, 3),
					},
					...Array.from({ length: 10 }, (_, toolIndex) => ({
						id: `${turnId}:tool:${toolIndex}`,
						input: {
							command: `bun test integration-${index}-${toolIndex}`,
						},
						kind: "tool" as const,
						result: {
							content: `line one\nline two\nline three for ${index}:${toolIndex}`,
							isError: false,
						},
						timestamp: timestamp(index, 4 + toolIndex),
						toolName: toolIndex % 2 === 0 ? "Bash" : "Read",
					})),
				],
				executionMode: "default" as const,
				id: `${turnId}:agent`,
				kind: "agent" as const,
				timestamp: timestamp(index, 1),
			},
		],
		userItems: [
			{
				content: `Investigate integration behavior for turn ${index + 1}`,
				id: `${turnId}:user`,
				kind: "user" as const,
				timestamp: timestamp(index),
			},
		],
	};
}

function timestamp(turnIndex: number, seconds = 0) {
	return new Date(
		Date.UTC(2026, 7, 17, 10, 0, 0) + turnIndex * 120_000 + seconds * 1_000,
	).toISOString();
}
