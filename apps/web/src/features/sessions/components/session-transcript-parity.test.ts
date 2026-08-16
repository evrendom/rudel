import {
	buildConversationTrace as buildSharedConversationTrace,
	extractSessionTurnMetrics as extractSharedSessionTurnMetrics,
	groupTraceIntoTurns as groupSharedTraceIntoTurns,
	parseConversations as parseSharedConversations,
} from "@rudel/api-routes";
import { describe, expect, test } from "vitest";
import { buildConversationTrace } from "@/components/conversation/conversation-trace";
import { parseConversations } from "@/lib/conversation-schema";
import { extractSessionTurnMetrics } from "./session-turn-metadata";
import { groupTraceIntoTurns } from "./session-turns";

describe("browser session transcript parity", () => {
	test("re-exports the exact shared parser and derivation functions", () => {
		expect(parseConversations).toBe(parseSharedConversations);
		expect(buildConversationTrace).toBe(buildSharedConversationTrace);
		expect(groupTraceIntoTurns).toBe(groupSharedTraceIntoTurns);
		expect(extractSessionTurnMetrics).toBe(extractSharedSessionTurnMetrics);
	});
});
