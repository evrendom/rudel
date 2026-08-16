import type { TraceEvent, TraceItem } from "./conversation-trace";
import type { AgentTraceRequestUsage } from "./conversation-trace-requests";

// Deterministic fixture for /dev/trace-tree-fixture and the real-browser
// sticky boundary tests: two long turns, each with two request sections,
// structural message + tool stacks, expandable reasoning and tool bodies,
// and a terminal chain at each turn's end. Every ID, timestamp, and text is
// stable so tests can address rows precisely and compute boundaries from DOM
// geometry instead of hard-coded scroll positions.

export const CONVERSATION_TRACE_FIXTURE_MODEL = "claude-fable-5";
export const CONVERSATION_TRACE_FIXTURE_AGENT_LABEL = "Fable 5";
export const CONVERSATION_TRACE_FIXTURE_USER_LABEL = "Evren";

const FIXTURE_START_MS = Date.parse("2026-08-02T10:00:00.000Z");
const TURN_SPACING_SECONDS = 600;
const REQUEST_SPACING_SECONDS = 120;
const TOOLS_PER_MESSAGE = 12;

export type ConversationTraceFixtureTurn = {
	items: TraceItem[];
	key: string;
	requestUsage: AgentTraceRequestUsage[];
};

function fixtureTimestamp(offsetSeconds: number) {
	return new Date(FIXTURE_START_MS + offsetSeconds * 1_000).toISOString();
}

function reasoningText(turn: number, request: number) {
	return `Fixture reasoning for turn ${turn} request ${request}. `.repeat(24);
}

function messageContent(turn: number, request: number) {
	const summary = `Fixture message for turn ${turn} request ${request}: running ${TOOLS_PER_MESSAGE} deterministic tool calls.`;
	if (turn !== 1 || request !== 1) {
		return summary;
	}

	return `${summary}\n\n\`\`\`typescript\nexport function buildResetLink(userId: string) {\n  const token = sign<ResetTokenPayload>({ uid: userId });\n- const baseUrl = "https://staging.example.com";\n+ const baseUrl = "https://example.com/reset-password";\n}\n\`\`\``;
}

function toolResultContent(turn: number, request: number, tool: number) {
	return Array.from(
		{ length: 30 },
		(_, line) =>
			`turn ${turn} request ${request} tool ${tool} result line ${line + 1}`,
	).join("\n");
}

function buildRequestEvents(
	turn: number,
	request: number,
	baseOffsetSeconds: number,
): TraceEvent[] {
	const prefix = `fx-t${turn}-r${request}`;
	const events: TraceEvent[] = [
		{
			id: `${prefix}-reasoning`,
			kind: "reasoning",
			text: reasoningText(turn, request),
			timestamp: fixtureTimestamp(baseOffsetSeconds),
		},
		{
			content: messageContent(turn, request),
			id: `${prefix}-message`,
			kind: "message",
			text: messageContent(turn, request),
			timestamp: fixtureTimestamp(baseOffsetSeconds + 1),
		},
	];
	for (let tool = 1; tool <= TOOLS_PER_MESSAGE; tool += 1) {
		events.push(
			tool % 2 === 1
				? {
						id: `${prefix}-tool-${tool}`,
						input: {
							file_path: `/fixture/turn-${turn}/r${request}/${tool}.ts`,
						},
						kind: "tool",
						result: {
							content: toolResultContent(turn, request, tool),
							isError: false,
						},
						timestamp: fixtureTimestamp(baseOffsetSeconds + 1 + tool),
						toolName: "Read",
					}
				: {
						id: `${prefix}-tool-${tool}`,
						input: { command: `echo fixture-turn-${turn}-r${request}-${tool}` },
						kind: "tool",
						result: {
							content: toolResultContent(turn, request, tool),
							isError: false,
						},
						timestamp: fixtureTimestamp(baseOffsetSeconds + 1 + tool),
						toolName: "Bash",
					},
		);
	}
	return events;
}

function buildTurn(turn: number): ConversationTraceFixtureTurn {
	const baseOffsetSeconds = (turn - 1) * TURN_SPACING_SECONDS;
	const requestUsage: AgentTraceRequestUsage[] = [1, 2].map((request) => ({
		at: fixtureTimestamp(
			baseOffsetSeconds + (request - 1) * REQUEST_SPACING_SECONDS,
		),
		cacheCreationInputTokens: 2_000 * request,
		cacheReadInputTokens: 20_000 * request,
		inputTokens: 8_000 + 3_000 * request + 40_000 * (turn - 1),
		model: CONVERSATION_TRACE_FIXTURE_MODEL,
		outputTokens: 700 * request,
	}));

	return {
		items: [
			{
				content: `Fixture prompt for turn ${turn}.`,
				id: `fx-t${turn}-user`,
				kind: "user",
				timestamp: fixtureTimestamp(baseOffsetSeconds),
			},
			{
				events: [1, 2].flatMap((request) =>
					buildRequestEvents(
						turn,
						request,
						baseOffsetSeconds + (request - 1) * REQUEST_SPACING_SECONDS,
					),
				),
				id: `fx-t${turn}-agent`,
				executionMode: "unknown",
				kind: "agent",
				timestamp: fixtureTimestamp(baseOffsetSeconds + 1),
			},
		],
		key: `fixture-turn-${turn}`,
		requestUsage,
	};
}

export function buildConversationTraceFixtureTurns(): ConversationTraceFixtureTurn[] {
	return [buildTurn(1), buildTurn(2)];
}
