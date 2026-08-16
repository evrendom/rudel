import {
	formatClockTime,
	type SessionDetailOverview,
	type SessionDetailTurn,
} from "@rudel/api-routes";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import {
	buildSessionDetailViewModel,
	formatSessionCost,
} from "./session-detail-view-model";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

type TurnSummary = SessionDetailOverview["turnPage"]["items"][number];

export interface SessionDetailOverviewTurnOption
	extends SessionTurnTablePaneOption {
	hasBody: boolean;
	memberText: string;
	turnId: string;
}

export function buildSessionDetailOverviewViewModel(
	overview: SessionDetailOverview,
	userMap: Record<string, string>,
) {
	const session = overview.session;
	const base = buildSessionDetailViewModel(
		{
			content: "",
			duration_min: session.durationMinutes ?? undefined,
			git_branch: session.gitBranch,
			git_sha: session.gitSha,
			input_tokens: session.inputTokens,
			last_interaction_date: session.lastInteractionDate,
			model_used: session.modelUsed ?? undefined,
			output_tokens: session.outputTokens,
			project_path: session.projectPath,
			repository: session.repository,
			session_date: session.sessionDate,
			session_id: session.sessionId,
			skills: session.skills,
			slash_commands: session.slashCommands,
			source: session.source ?? undefined,
			subagents: {},
			total_interactions: session.totalInteractions ?? undefined,
			total_tokens: session.totalTokens,
			user_id: session.userId,
		},
		userMap,
	);

	return {
		...base,
		costLabel: formatSessionCost(session.estimatedCost),
		subagentNames: overview.subagents.map((subagent) => subagent.subagentId),
		subagentSummaries: overview.subagents.map((subagent) => ({
			id: subagent.subagentId,
			model: subagent.model ?? undefined,
			totalTokens: subagent.totalTokens ?? undefined,
		})),
	};
}

export function buildSessionDetailOverviewTurnOptions(
	items: readonly TurnSummary[],
): SessionDetailOverviewTurnOption[] {
	let userTurnNumber = 0;
	return items.map((item) => {
		const hasMemberMessage = item.userPreview !== null;
		if (hasMemberMessage) {
			userTurnNumber += 1;
		}
		return buildTurnOption(item, hasMemberMessage ? userTurnNumber : undefined);
	});
}

export function attachSessionDetailTurnBody(
	option: SessionDetailOverviewTurnOption,
	body: SessionDetailTurn,
) {
	return {
		...option,
		turn: {
			responseItems: normalizeTraceItems(body.responseItems),
			userItems: normalizeTraceItems(body.userItems),
		},
	};
}

function buildTurnOption(
	item: TurnSummary,
	turnNumber: number | undefined,
): SessionDetailOverviewTurnOption {
	const memberText = item.userPreview ?? "";
	return {
		compactionsBefore: [],
		hasBody: item.hasBody,
		key: item.turnId,
		memberPreview: memberText || "No member message",
		memberText,
		metrics: {
			editedFiles: item.editedFiles,
			errorCount: item.errorCount,
			errorEvents: item.errorEvents,
			estimatedCost: item.estimatedCost ?? undefined,
			inputTokens: item.inputTokens ?? undefined,
			outputTokens: item.outputTokens ?? undefined,
			skills: item.skills,
			skillEvents: item.skillEvents,
			usageEvents: item.usageCalls.map((call) => ({
				at: call.at,
				cacheCreationInputTokens: call.cacheCreationInputTokens,
				cacheReadInputTokens: call.cacheReadInputTokens,
				inputTokens: call.freshInputTokens,
				model: call.model ?? undefined,
				modelContextWindow: call.contextWindow ?? undefined,
				outputTokens: call.outputTokens,
			})),
		},
		preview: item.responsePreview ?? "No assistant message",
		slashCommands: item.slashCommands,
		timing: {
			durationLabel: formatTurnDuration(item.durationSeconds),
			durationSeconds: item.durationSeconds ?? undefined,
			endTime: formatClockTime(item.endedAt ?? undefined),
			endTimestamp: item.endedAt ?? undefined,
			startTime: formatClockTime(item.startedAt ?? undefined),
			startTimestamp: item.startedAt ?? undefined,
		},
		toolCallCount: item.toolCallCount,
		turnId: item.turnId,
		turnNumber,
	};
}

function formatTurnDuration(value: number | null) {
	if (value === null) {
		return undefined;
	}
	if (value < 60) {
		return `${Math.round(value)} sec`;
	}
	if (value < 3_600) {
		return `${Math.round(value / 60)} min`;
	}
	const roundedHours = Math.round((value / 3_600) * 10) / 10;
	return `${roundedHours.toLocaleString(undefined, {
		maximumFractionDigits: 1,
	})} hr`;
}

function normalizeTraceItems(items: SessionDetailTurn["responseItems"]) {
	return items.map((item): TraceItem => {
		if (item.kind !== "agent") {
			return item;
		}
		return {
			...item,
			events: item.events.map((event) =>
				event.kind === "tool" ? { ...event, result: event.result } : event,
			),
		};
	});
}
