import { type RefObject, useId, useMemo, useRef, useState } from "react";
import {
	buildConversationTrace,
	formatClockTime,
	type TraceItem,
} from "@/components/conversation/conversation-trace";
import { HorizontalResizeHandle } from "@/components/ui/horizontal-resize-handle";
import { parseConversations } from "@/lib/conversation-schema";
import { parseSlashCommand } from "@/lib/parse-slash-command";
import { cn } from "@/lib/utils";
import { SessionAdalineLayout } from "./session-adaline-layout";
import {
	assignCompactionsBeforeTurns,
	extractSessionCompactionMetadata,
	type SessionCompaction,
} from "./session-compactions";
import { useSessionTriptychPaneSizing } from "./session-detail-triptych-layout";
import {
	SessionFactsVisibilityButton,
	TurnRail,
} from "./session-detail-triptych-navigation";
import {
	TriptychCapabilitiesPanel,
	TriptychContextPanel,
	TriptychOutcomePanel,
} from "./session-detail-triptych-panels";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	SessionSelectedTurn,
	type SessionThreadTransitionDirection,
} from "./session-selected-turn";
import { SessionThreadWaterfallLayout } from "./session-thread-waterfall-layout";
import {
	extractSessionTurnMetrics,
	type SessionTurnMetrics,
} from "./session-turn-metadata";
import { SessionTurnStrip } from "./session-turn-strip";
import { SessionTurnTableExperimentLayout } from "./session-turn-table-experiment-layout";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import { SessionTurnV2Layout } from "./session-turn-v2-layout";
import {
	getSessionTurnMemberPreview,
	getSessionTurnMemberText,
	getSessionTurnPreview,
	getSessionTurnTiming,
	groupTraceIntoTurns,
	type SessionTurn,
} from "./session-turns";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

type SessionDetailTriptychViewProps = {
	responseScrollRef: RefObject<HTMLDivElement | null>;
	turnRailVariant:
		| "focus"
		| "adaline"
		| "overview"
		| "table"
		| "thread"
		| "thread-collapsible"
		| "thread-waterfall"
		| "thread-v2";
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
};

interface TurnOption extends SessionTurnTablePaneOption {
	memberText: string;
	turn: SessionTurn;
}

const EMPTY_TURN_METRICS: SessionTurnMetrics = {
	editedFiles: [],
	errorCount: 0,
	estimatedCost: undefined,
	inputTokens: undefined,
	outputTokens: undefined,
	skills: [],
	usageEvents: [],
};

export {
	TRIPTYCH_SESSION_IDS,
	useTriptychDesktopLayout,
} from "./session-detail-triptych-layout";

const columnBottomPaddingClassName =
	"pb-[calc(5rem+env(safe-area-inset-bottom))]";

function getTurnTransitionDirection(
	currentIndex: number,
	nextIndex: number,
): SessionThreadTransitionDirection {
	if (nextIndex === currentIndex) {
		return 0;
	}

	return nextIndex > currentIndex ? 1 : -1;
}

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

function buildTurnOptions(
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

export function SessionDetailTriptychView({
	responseScrollRef,
	turnRailVariant,
	userImageUrl,
	viewModel,
}: SessionDetailTriptychViewProps) {
	const sessionFactsId = useId();
	const isTurnTableExperiment =
		turnRailVariant === "adaline" ||
		turnRailVariant === "table" ||
		turnRailVariant === "thread" ||
		turnRailVariant === "thread-collapsible" ||
		turnRailVariant === "thread-waterfall" ||
		turnRailVariant === "thread-v2";
	const isContinuousThreadExperiment =
		turnRailVariant === "thread" ||
		turnRailVariant === "thread-collapsible" ||
		turnRailVariant === "thread-waterfall" ||
		turnRailVariant === "thread-v2";
	const sessionFactsCollapsible =
		turnRailVariant === "thread-collapsible" || turnRailVariant === "thread-v2";
	const sessionFactsHorizontal = turnRailVariant === "thread";
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
			isTurnTableExperiment
				? traceItems.filter(
						(item) => !compactionMetadata.hiddenTraceItemIds.has(item.id),
					)
				: traceItems,
		[compactionMetadata.hiddenTraceItemIds, isTurnTableExperiment, traceItems],
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
	const turnOptions = useMemo(
		() =>
			buildTurnOptions(
				turns,
				turnMetrics,
				isTurnTableExperiment ? compactionMetadata.compactions : [],
			),
		[compactionMetadata.compactions, isTurnTableExperiment, turnMetrics, turns],
	);
	const selectableTurnOptions = useMemo(
		() =>
			turnRailVariant === "focus"
				? turnOptions.filter((option) => option.turnNumber !== undefined)
				: turnOptions,
		[turnOptions, turnRailVariant],
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [sessionFactsCollapsed, setSessionFactsCollapsed] = useState(false);
	const { containerRef, gridStyle, sessionFactsPane, turnRailPane } =
		useSessionTriptychPaneSizing(isTurnTableExperiment);
	const [turnTransitionDirection, setTurnTransitionDirection] =
		useState<SessionThreadTransitionDirection>(0);
	const turnTableSectionRef = useRef<HTMLElement>(null);
	const boundedSelectedIndex = Math.min(
		selectedIndex,
		Math.max(selectableTurnOptions.length - 1, 0),
	);
	const userTurnCount = turnOptions.filter(
		(option) => option.turnNumber !== undefined,
	).length;
	const upcomingMemberTurnOptions = selectableTurnOptions
		.slice(boundedSelectedIndex + 1)
		.filter((option) => option.turn.userItems.length > 0)
		.slice(0, 2);
	const nextMemberTurnOption = upcomingMemberTurnOptions[0];
	const followingMemberTurnOption = upcomingMemberTurnOptions[1];
	const selectedTurnOption = selectableTurnOptions[boundedSelectedIndex];
	function handleTurnSelect(nextIndex: number) {
		if (isContinuousThreadExperiment) {
			setSelectedIndex(nextIndex);
			const scrollContainer = responseScrollRef.current;
			const target = scrollContainer?.querySelector<HTMLElement>(
				`[data-continuous-turn-index="${nextIndex}"]`,
			);
			if (scrollContainer && target) {
				const targetTop =
					target.getBoundingClientRect().top -
					scrollContainer.getBoundingClientRect().top +
					scrollContainer.scrollTop;
				scrollContainer.scrollTo({
					behavior: "smooth",
					top: Math.max(targetTop, 0),
				});
			}
			return;
		}

		setTurnTransitionDirection(
			getTurnTransitionDirection(boundedSelectedIndex, nextIndex),
		);
		if (turnRailVariant === "table") {
			responseScrollRef.current?.scrollTo({ top: 0 });
		}
		setSelectedIndex(nextIndex);
	}

	function handleContinuousTurnFocus(nextIndex: number) {
		if (nextIndex === boundedSelectedIndex) {
			return;
		}

		setSelectedIndex(nextIndex);
		window.requestAnimationFrame(() => {
			turnTableSectionRef.current
				?.querySelector<HTMLElement>(`[data-turn-index="${nextIndex}"]`)
				?.scrollIntoView({ block: "nearest", inline: "nearest" });
		});
	}

	if (turnRailVariant === "adaline") {
		return (
			<SessionAdalineLayout
				options={selectableTurnOptions}
				userImageUrl={userImageUrl}
				viewModel={viewModel}
			/>
		);
	}

	if (turnRailVariant === "thread-waterfall") {
		return (
			<SessionThreadWaterfallLayout
				activeIndex={boundedSelectedIndex}
				bottomPaddingClassName={columnBottomPaddingClassName}
				onContinuousTurnFocus={handleContinuousTurnFocus}
				onSelect={handleTurnSelect}
				options={selectableTurnOptions}
				responseScrollRef={responseScrollRef}
				turnTableSectionRef={turnTableSectionRef}
				userImageUrl={userImageUrl}
				viewModel={viewModel}
			/>
		);
	}

	return (
		<div
			ref={containerRef}
			className={cn(
				"grid h-full min-h-0 min-w-0 overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]",
				sessionFactsCollapsible &&
					"transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none",
				isTurnTableExperiment
					? sessionFactsHorizontal
						? "grid-cols-[minmax(0,1fr)]"
						: sessionFactsCollapsed
							? "grid-cols-[2.5rem_0_minmax(0,1fr)]"
							: "grid-cols-[var(--session-facts-pane-width)_2px_minmax(0,1fr)]"
					: "grid-cols-[var(--session-facts-pane-width)_2px_var(--session-turn-rail-pane-width)_2px_minmax(0,1fr)]",
			)}
			style={gridStyle}
		>
			{sessionFactsHorizontal ? null : (
				<>
					<aside
						aria-label="Session facts"
						className={cn(
							"min-h-0 min-w-0 overflow-x-hidden bg-(--session-overview-surface)",
							sessionFactsCollapsed
								? "overflow-y-hidden"
								: "overflow-y-auto overscroll-contain",
						)}
					>
						{sessionFactsCollapsible ? (
							<header
								className={cn(
									"sticky top-0 z-30 flex h-10 items-center border-b border-(--session-overview-border) bg-(--session-overview-surface) px-2",
									sessionFactsCollapsed ? "justify-center" : "justify-between",
								)}
							>
								{sessionFactsCollapsed ? null : (
									<h2 className="min-w-0 truncate px-2 text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)">
										Session facts
									</h2>
								)}
								<SessionFactsVisibilityButton
									controlsId={sessionFactsId}
									expanded={!sessionFactsCollapsed}
									onClick={() =>
										setSessionFactsCollapsed((current) => !current)
									}
								/>
							</header>
						) : null}
						<div
							id={sessionFactsId}
							aria-hidden={sessionFactsCollapsed || undefined}
							inert={sessionFactsCollapsed}
							className={cn(
								"min-w-0 transition-opacity duration-150 motion-reduce:transition-none",
								columnBottomPaddingClassName,
								sessionFactsCollapsed
									? "invisible opacity-0"
									: "visible opacity-100",
							)}
						>
							<TriptychContextPanel viewModel={viewModel} />
							<TriptychOutcomePanel
								userImageUrl={userImageUrl}
								viewModel={viewModel}
							/>
							<TriptychCapabilitiesPanel viewModel={viewModel} />
						</div>
					</aside>
					<HorizontalResizeHandle
						{...sessionFactsPane}
						ariaLabel="Resize session facts panel"
						className={cn(
							sessionFactsCollapsed && "invisible pointer-events-none",
						)}
					/>
				</>
			)}

			{turnRailVariant === "thread-v2" ? (
				<SessionTurnV2Layout
					activeIndex={boundedSelectedIndex}
					bottomPaddingClassName={columnBottomPaddingClassName}
					onContinuousTurnFocus={handleContinuousTurnFocus}
					onSelect={handleTurnSelect}
					options={selectableTurnOptions}
					responseScrollRef={responseScrollRef}
					turnTableSectionRef={turnTableSectionRef}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			) : isTurnTableExperiment ? (
				<SessionTurnTableExperimentLayout
					activeIndex={boundedSelectedIndex}
					bottomPaddingClassName={columnBottomPaddingClassName}
					collapsible={turnRailVariant === "thread-collapsible"}
					followingOption={followingMemberTurnOption}
					nextOption={nextMemberTurnOption}
					onContinuousTurnFocus={handleContinuousTurnFocus}
					onSelect={handleTurnSelect}
					options={selectableTurnOptions}
					responseScrollRef={responseScrollRef}
					responseTraceLayout={
						turnRailVariant === "thread" ? "trace-tree" : "table-row"
					}
					selectedOption={selectedTurnOption}
					showThreadOverviewStrip={turnRailVariant === "thread"}
					showTurnMetadataTags={turnRailVariant === "thread"}
					thread={isContinuousThreadExperiment}
					transitionDirection={turnTransitionDirection}
					turnTableSectionRef={turnTableSectionRef}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			) : (
				<>
					<section
						aria-labelledby="turn-rail-heading"
						className={cn(
							"min-h-0 min-w-0 bg-(--session-overview-surface)",
							turnRailVariant === "overview"
								? "overflow-y-auto overscroll-contain"
								: "flex flex-col overflow-hidden",
							columnBottomPaddingClassName,
						)}
					>
						<header className="sticky top-0 z-20 flex h-10 items-center gap-1.5 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-4">
							<h2
								id="turn-rail-heading"
								className="text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)"
							>
								Turns
							</h2>
							<p className="text-sm tracking-[-0.01em] text-(--session-overview-muted) tabular-nums">
								{userTurnCount.toLocaleString()}
							</p>
						</header>
						{turnRailVariant === "focus" ? (
							<SessionTurnStrip
								activationMode="pane"
								onSelect={handleTurnSelect}
								options={selectableTurnOptions}
								selectedIndex={boundedSelectedIndex}
							/>
						) : (
							<TurnRail
								onSelect={handleTurnSelect}
								options={selectableTurnOptions}
								selectedIndex={boundedSelectedIndex}
							/>
						)}
					</section>
					<HorizontalResizeHandle
						{...turnRailPane}
						ariaLabel="Resize turns panel"
					/>

					<section
						ref={responseScrollRef}
						aria-label="Selected turn response"
						className={cn(
							"min-h-0 min-w-0 overflow-y-auto overscroll-contain",
							columnBottomPaddingClassName,
						)}
					>
						<SessionSelectedTurn
							followingOption={followingMemberTurnOption}
							nextOption={nextMemberTurnOption}
							option={selectedTurnOption}
							tableExperiment={false}
							transitionDirection={0}
							userImageUrl={userImageUrl}
							viewModel={viewModel}
						/>
					</section>
				</>
			)}
		</div>
	);
}
