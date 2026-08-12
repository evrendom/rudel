import { ChevronDown } from "lucide-react";
import {
	Fragment,
	type RefObject,
	useEffectEvent,
	useMemo,
	useRef,
} from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type {
	ConversationTraceSpeakerLayout,
	TraceCallVariant,
} from "@/components/conversation/ConversationTrace";
import { userContentText } from "@/components/conversation/conversation-trace";
import { cn } from "@/lib/utils";
import { getContinuousTurnViewport } from "./session-continuous-turn-focus";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	type SelectedTurnOption,
	SelectedTurnResponseTrace,
	SessionMemberRow,
} from "./session-selected-turn";
import {
	type SessionThreadSegment,
	summarizeHiddenTurns,
} from "./session-thread-visibility";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import {
	SessionTurnCharacterCountTag,
	type SessionTurnMetadataTagKind,
	SessionTurnMetadataTags,
} from "./session-turn-metadata-tags";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const ACTIVE_TURN_MAX_FOCUS_OFFSET_PX = 160;
const ACTIVE_TURN_FOCUS_RATIO = 0.3;
const TRANSCRIPT_METADATA_TAGS: readonly SessionTurnMetadataTagKind[] = [
	"input",
	"output",
	"errors",
	"tools",
	"files",
	"skills",
];

export function SessionContinuousTurnThread({
	activeIndex,
	collapsedEpisodeKeys,
	episodes,
	onActiveIndexChange,
	onToggleHiddenSegment,
	onToggleEpisode,
	onViewportChange,
	options,
	responseTraceLayout = "table-row",
	scrollContainerRef,
	segments,
	showTurnMetadataTags = false,
	traceCallVariant = "v1",
	userImageUrl,
	viewModel,
}: {
	activeIndex: number;
	collapsedEpisodeKeys?: ReadonlySet<string>;
	episodes?: readonly SessionTurnEpisode[];
	onActiveIndexChange: (index: number) => void;
	onToggleHiddenSegment?: (key: string) => void;
	onToggleEpisode?: (key: string) => void;
	onViewportChange?: (
		activeIndex: number,
		visibleRange: readonly [number, number],
	) => void;
	options: readonly SelectedTurnOption[];
	responseTraceLayout?: ConversationTraceSpeakerLayout;
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	segments?: readonly SessionThreadSegment[];
	showTurnMetadataTags?: boolean;
	traceCallVariant?: TraceCallVariant;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const threadElementRef = useRef<HTMLDivElement>(null);
	const lastViewportRef = useRef("");
	const resolvedSegments = useMemo(
		() =>
			segments ??
			options.map(
				(_, index): SessionThreadSegment => ({
					dimmed: false,
					index,
					type: "turn",
				}),
			),
		[options, segments],
	);
	const episodeByStartIndex = useMemo(
		() => new Map(episodes?.map((episode) => [episode.startIndex, episode])),
		[episodes],
	);
	const episodeByTurnIndex = useMemo(() => {
		const entries = episodes?.flatMap((episode) =>
			episode.indices.map((index) => [index, episode] as const),
		);
		return new Map(entries);
	}, [episodes]);
	const syncActiveTurn = useEffectEvent(() => {
		const scrollContainer = scrollContainerRef.current;
		const threadElement = threadElementRef.current;
		if (!scrollContainer || !threadElement) {
			return;
		}

		const turnElements = threadElement.querySelectorAll<HTMLElement>(
			"[data-continuous-turn-index]",
		);
		if (turnElements.length === 0) {
			return;
		}

		const containerBounds = scrollContainer.getBoundingClientRect();
		const focusOffset = Math.min(
			scrollContainer.clientHeight * ACTIVE_TURN_FOCUS_RATIO,
			ACTIVE_TURN_MAX_FOCUS_OFFSET_PX,
		);
		const sectionTops = Array.from(
			turnElements,
			(element) => element.getBoundingClientRect().top,
		);
		const sectionIndices = Array.from(turnElements, (element) =>
			Number(element.dataset.continuousTurnIndex),
		);
		const viewport = getContinuousTurnViewport({
			focusLine: containerBounds.top + focusOffset,
			isAtScrollEnd:
				scrollContainer.scrollHeight -
					scrollContainer.clientHeight -
					scrollContainer.scrollTop <=
				2,
			isAtScrollStart: scrollContainer.scrollTop <= 2,
			sectionIndices,
			sectionTops,
			viewportBottom: containerBounds.bottom,
			viewportTop: containerBounds.top,
		});

		if (viewport.activeIndex !== activeIndex) {
			onActiveIndexChange(viewport.activeIndex);
		}
		const viewportKey = `${viewport.activeIndex}:${viewport.visibleRange[0]}:${viewport.visibleRange[1]}`;
		if (viewportKey !== lastViewportRef.current) {
			lastViewportRef.current = viewportKey;
			onViewportChange?.(viewport.activeIndex, viewport.visibleRange);
		}
	});

	useMountEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		const threadElement = threadElementRef.current;
		if (!scrollContainer || !threadElement) {
			return;
		}

		let animationFrame: number | undefined;
		const scheduleSync = () => {
			if (animationFrame !== undefined) {
				return;
			}

			animationFrame = window.requestAnimationFrame(() => {
				animationFrame = undefined;
				syncActiveTurn();
			});
		};

		scrollContainer.addEventListener("scroll", scheduleSync, {
			passive: true,
		});
		const resizeObserver =
			typeof ResizeObserver === "function"
				? new ResizeObserver(scheduleSync)
				: undefined;
		resizeObserver?.observe(scrollContainer);
		resizeObserver?.observe(threadElement);
		scheduleSync();

		return () => {
			scrollContainer.removeEventListener("scroll", scheduleSync);
			resizeObserver?.disconnect();
			if (animationFrame !== undefined) {
				window.cancelAnimationFrame(animationFrame);
			}
		};
	});

	if (options.length === 0) {
		return (
			<div className="flex min-h-60 items-center justify-center border-b border-(--session-overview-border) p-8 text-center text-sm text-(--session-overview-muted)">
				No conversation data available
			</div>
		);
	}

	return (
		<div ref={threadElementRef} className="min-w-0">
			{resolvedSegments.map((segment) => {
				if (segment.type === "hidden") {
					return (
						<button
							key={segment.key}
							type="button"
							aria-expanded="false"
							className="group flex min-h-11 w-full items-center justify-center gap-2 border-y border-(--session-overview-border) bg-[color-mix(in_srgb,var(--session-overview-hover)_60%,transparent)] px-4 text-xs font-medium text-(--session-overview-muted) outline-none hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)"
							onClick={() => onToggleHiddenSegment?.(segment.key)}
						>
							{summarizeHiddenTurns(segment.indices, options)}
							<ChevronDown aria-hidden="true" className="size-3.5" />
						</button>
					);
				}

				const option = options[segment.index];
				const episode = episodeByStartIndex.get(segment.index);
				const containingEpisode = episodeByTurnIndex.get(segment.index);
				const episodeCollapsed =
					containingEpisode !== undefined &&
					collapsedEpisodeKeys?.has(containingEpisode.key);
				return option ? (
					<Fragment key={option.key}>
						{episode ? (
							<button
								type="button"
								aria-expanded={!episodeCollapsed}
								className="sticky top-0 z-10 flex min-h-9 w-full items-center gap-2 border-y border-(--session-overview-border) bg-[color-mix(in_srgb,var(--session-overview-hover)_84%,var(--session-overview-surface))] px-4 text-left text-xs font-medium text-(--session-overview-text) outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)"
								onClick={() => onToggleEpisode?.(episode.key)}
							>
								<ChevronDown
									aria-hidden="true"
									className={cn(
										"size-3.5 transition-transform",
										episodeCollapsed && "-rotate-90",
									)}
								/>
								<span className="min-w-0 flex-1 truncate">{episode.label}</span>
								<span className="shrink-0 font-normal text-(--session-overview-muted) tabular-nums">
									{episode.indices.length} turns · {episode.stats.tools} tools
								</span>
							</button>
						) : null}
						{episodeCollapsed ? null : (
							<ContinuousTurnSection
								active={segment.index === activeIndex}
								dimmed={segment.dimmed}
								index={segment.index}
								option={option}
								responseTraceLayout={responseTraceLayout}
								showTurnMetadataTags={showTurnMetadataTags}
								traceCallVariant={traceCallVariant}
								userImageUrl={userImageUrl}
								viewModel={viewModel}
							/>
						)}
					</Fragment>
				) : null;
			})}
		</div>
	);
}

function ContinuousTurnSection({
	active,
	dimmed,
	index,
	option,
	responseTraceLayout,
	showTurnMetadataTags,
	traceCallVariant,
	userImageUrl,
	viewModel,
}: {
	active: boolean;
	dimmed: boolean;
	index: number;
	option: SelectedTurnOption;
	responseTraceLayout: ConversationTraceSpeakerLayout;
	showTurnMetadataTags: boolean;
	traceCallVariant: TraceCallVariant;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const hasMemberMessage = option.turn.userItems.length > 0;
	const sectionLabel =
		option.turnNumber === undefined
			? "Session start"
			: `Turn ${option.turnNumber}`;
	const memberCharacterCount = option.turn.userItems.reduce(
		(characterCount, item) =>
			item.kind === "user"
				? characterCount + userContentText(item.content).length
				: characterCount,
		0,
	);
	const modelMetadataTags = showTurnMetadataTags ? (
		<SessionTurnMetadataTags
			className="mt-0 justify-end"
			maxVisibleSkills={1}
			metrics={option.metrics}
			toolCallCount={option.toolCallCount}
			visibleTags={TRANSCRIPT_METADATA_TAGS}
		/>
	) : null;
	const memberCharacterTag = showTurnMetadataTags ? (
		<SessionTurnCharacterCountTag
			characterCount={memberCharacterCount}
			className="mt-0 justify-end"
		/>
	) : null;

	return (
		<section
			aria-current={active ? "step" : undefined}
			aria-label={sectionLabel}
			className={cn(
				"scroll-mt-0 transition-opacity motion-reduce:transition-none",
				dimmed && "opacity-45",
			)}
			data-continuous-turn-index={index}
		>
			<div className="w-full min-w-0">
				{hasMemberMessage ? (
					<SessionMemberRow
						headerTrailing={memberCharacterTag}
						headingId={`continuous-member-message-${index}`}
						items={option.turn.userItems}
						speakerLayout={responseTraceLayout}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
					/>
				) : null}
				<section
					aria-label={option.turnNumber === undefined ? "Preamble" : "Response"}
					className="min-w-0"
				>
					<SelectedTurnResponseTrace
						agentHeaderTrailing={modelMetadataTags}
						agentSectionMode="expanded"
						option={option}
						speakerLayout={responseTraceLayout}
						traceCallVariant={traceCallVariant}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
					/>
				</section>
			</div>
		</section>
	);
}
