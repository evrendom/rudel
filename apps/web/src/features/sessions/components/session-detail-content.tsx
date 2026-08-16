import { type RefObject, useMemo, useRef, useState } from "react";
import {
	buildConversationTrace,
	formatClockTime,
	type TraceItem,
} from "@/components/conversation/conversation-trace";
import { parseConversations } from "@/lib/conversation-schema";
import { parseSlashCommand } from "@/lib/parse-slash-command";
import { getSessionEstimatedCost } from "../session-cost";
import {
	assignCompactionsBeforeTurns,
	extractSessionCompactionMetadata,
	type SessionCompaction,
} from "./session-compactions";
import { shouldSyncContinuousTurnFocus } from "./session-continuous-turn-focus";
import { SessionDetailLayout } from "./session-detail-layout";
import {
	type buildSessionDetailViewModel,
	formatSessionCost,
} from "./session-detail-view-model";
import {
	extractSessionTurnMetrics,
	extractTranscriptUsageMetrics,
	type SessionTurnMetrics,
} from "./session-turn-metadata";
import type { SessionTurnOption } from "./session-turn-option";
import type { SessionTurnSelection } from "./session-turn-table-selection";
import {
	getSessionTurnMemberPreview,
	getSessionTurnMemberText,
	getSessionTurnPreview,
	getSessionTurnTiming,
	groupTraceIntoTurns,
	type SessionTurn,
} from "./session-turns";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

type SessionDetailContentProps = {
	responseScrollRef: RefObject<HTMLDivElement | null>;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
};

interface TurnOption extends SessionTurnOption {
	memberText: string;
}

const EMPTY_TURN_METRICS: SessionTurnMetrics = {
	editedFiles: [],
	errorCount: 0,
	errorEvents: [],
	estimatedCost: undefined,
	inputTokens: undefined,
	outputTokens: undefined,
	skills: [],
	skillEvents: [],
	usageEvents: [],
};

const columnBottomPaddingClassName =
	"pb-[calc(5rem+env(safe-area-inset-bottom))]";

function countToolCalls(items: TraceItem[]) {
	let count = 0;

	for (const item of items) {
		if (item.kind !== "agent") {
			continue;
		}

		count += item.events.filter((event) => event.kind === "tool").length;
	}

	return count;
}

function getTurnSlashCommands(turn: SessionTurn) {
	return turn.userItems.flatMap((item) => {
		if (item.kind !== "user") {
			return [];
		}

		const slashCommand = parseSlashCommand(item.content);
		return slashCommand?.commandName ? [slashCommand.commandName] : [];
	});
}

export function buildTurnOptions(
	turns: SessionTurn[],
	metrics: readonly SessionTurnMetrics[],
	compactions: readonly SessionCompaction[],
): TurnOption[] {
	let userTurnNumber = 0;
	const turnTimings = turns.map((turn) => getSessionTurnTiming(turn));
	const compactionsByTurn = assignCompactionsBeforeTurns(
		compactions,
		turnTimings.map((timing) => timing.startTimestamp),
	);

	return turns.map((turn, index) => {
		const isSessionStart = turn.userItems.length === 0;
		if (!isSessionStart) {
			userTurnNumber += 1;
		}

		const firstItem = turn.userItems.at(0) ?? turn.responseItems.at(0);
		const timing = turnTimings[index] ?? getSessionTurnTiming(turn);

		return {
			compactionsBefore: compactionsByTurn[index] ?? [],
			key: firstItem?.id ?? `turn-${index}`,
			memberText: getSessionTurnMemberText(turn),
			memberPreview: getSessionTurnMemberPreview(turn),
			metrics: metrics[index] ?? EMPTY_TURN_METRICS,
			preview: getSessionTurnPreview(turn),
			slashCommands: getTurnSlashCommands(turn),
			timing: {
				durationLabel: timing.durationLabel,
				durationSeconds: timing.durationSeconds,
				endTime: formatClockTime(timing.endTimestamp),
				endTimestamp: timing.endTimestamp,
				startTime: formatClockTime(timing.startTimestamp),
				startTimestamp: timing.startTimestamp,
			},
			toolCallCount: countToolCalls(turn.responseItems),
			turn,
			turnNumber: isSessionStart ? undefined : userTurnNumber,
		};
	});
}

export function SessionDetailContent({
	responseScrollRef,
	userImageUrl,
	viewModel,
}: SessionDetailContentProps) {
	const traceItems = useMemo(
		() => buildConversationTrace(parseConversations(viewModel.safeContent)),
		[viewModel.safeContent],
	);
	const compactionMetadata = useMemo(
		() => extractSessionCompactionMetadata(viewModel.safeContent),
		[viewModel.safeContent],
	);
	const visibleTraceItems = useMemo(
		() =>
			traceItems.filter(
				(item) => !compactionMetadata.hiddenTraceItemIds.has(item.id),
			),
		[compactionMetadata.hiddenTraceItemIds, traceItems],
	);
	const turns = useMemo(
		() => groupTraceIntoTurns(visibleTraceItems),
		[visibleTraceItems],
	);
	const turnMetrics = useMemo(
		() =>
			extractSessionTurnMetrics(viewModel.safeContent, {
				fallbackModel: viewModel.safeModelUsed,
				subagents: viewModel.safeSubagents,
				turns,
			}),
		[
			turns,
			viewModel.safeContent,
			viewModel.safeModelUsed,
			viewModel.safeSubagents,
		],
	);
	const subagentUsageMetrics = useMemo(
		() =>
			Object.values(viewModel.safeSubagents).map((content) =>
				extractTranscriptUsageMetrics(content, undefined),
			),
		[viewModel.safeSubagents],
	);
	const turnOptions = useMemo(
		() => buildTurnOptions(turns, turnMetrics, compactionMetadata.compactions),
		[compactionMetadata.compactions, turnMetrics, turns],
	);
	const sessionEstimatedCost = getSessionEstimatedCost([
		...turnMetrics,
		...subagentUsageMetrics,
	]);
	const contentViewModel = useMemo(
		() => ({
			...viewModel,
			costLabel: formatSessionCost(sessionEstimatedCost),
		}),
		[sessionEstimatedCost, viewModel],
	);
	const [selection, setSelection] = useState<SessionTurnSelection>({
		index: 0,
		speaker: "model",
	});
	const programmaticScrollTargetRef = useRef<number | undefined>(undefined);
	const turnTableSectionRef = useRef<HTMLElement>(null);
	const boundedSelectedIndex = Math.min(
		selection.index,
		Math.max(turnOptions.length - 1, 0),
	);
	const boundedTurnHasMember = turnOptions[
		boundedSelectedIndex
	]?.turn.userItems.some((item) => item.kind === "user");
	const boundedSpeaker =
		selection.speaker === "member" && !boundedTurnHasMember
			? "model"
			: selection.speaker;
	const boundedSelection =
		boundedSelectedIndex === selection.index &&
		boundedSpeaker === selection.speaker
			? selection
			: { index: boundedSelectedIndex, speaker: boundedSpeaker };

	function handleTurnSelect(nextSelection: SessionTurnSelection) {
		setSelection(nextSelection);
		programmaticScrollTargetRef.current = undefined;
		const scrollContainer = responseScrollRef.current;
		const turnTarget = scrollContainer?.querySelector<HTMLElement>(
			`[data-continuous-turn-index="${nextSelection.index}"]`,
		);
		const target =
			turnTarget?.querySelector<HTMLElement>(
				`[data-session-turn-speaker="${nextSelection.speaker}"]`,
			) ?? turnTarget;
		if (scrollContainer && target) {
			const targetTop =
				target.getBoundingClientRect().top -
				scrollContainer.getBoundingClientRect().top +
				scrollContainer.scrollTop;
			const boundedTargetTop = Math.max(targetTop, 0);
			if (Math.abs(scrollContainer.scrollTop - boundedTargetTop) > 1) {
				programmaticScrollTargetRef.current = nextSelection.index;
				scrollContainer.addEventListener(
					"scrollend",
					() => {
						if (programmaticScrollTargetRef.current === nextSelection.index) {
							programmaticScrollTargetRef.current = undefined;
						}
					},
					{ once: true },
				);
			}
			scrollContainer.scrollTo({
				behavior: "smooth",
				top: boundedTargetTop,
			});
		}
	}

	function handleContinuousTurnFocus(nextIndex: number) {
		if (
			!shouldSyncContinuousTurnFocus(
				programmaticScrollTargetRef.current,
				nextIndex,
			)
		) {
			return;
		}
		programmaticScrollTargetRef.current = undefined;
		if (nextIndex === boundedSelection.index) {
			return;
		}

		setSelection((currentSelection) => ({
			...currentSelection,
			index: nextIndex,
		}));
		window.requestAnimationFrame(() => {
			const selectedSpeakerRow =
				turnTableSectionRef.current?.querySelector<HTMLElement>(
					`[data-turn-index="${nextIndex}"][data-speaker="${boundedSelection.speaker}"]`,
				);
			const selectedTurnRow =
				selectedSpeakerRow ??
				turnTableSectionRef.current?.querySelector<HTMLElement>(
					`[data-turn-index="${nextIndex}"]`,
				);
			selectedTurnRow?.scrollIntoView({
				block: "nearest",
				inline: "nearest",
			});
		});
	}

	return (
		<div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<SessionDetailLayout
				bottomPaddingClassName={columnBottomPaddingClassName}
				onContinuousTurnFocus={handleContinuousTurnFocus}
				onSelect={handleTurnSelect}
				options={turnOptions}
				responseScrollRef={responseScrollRef}
				selection={boundedSelection}
				turnTableSectionRef={turnTableSectionRef}
				userImageUrl={userImageUrl}
				viewModel={contentViewModel}
			/>
		</div>
	);
}
