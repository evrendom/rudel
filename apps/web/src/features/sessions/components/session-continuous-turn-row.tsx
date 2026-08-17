import { memo, type ReactNode, type RefObject, useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import type { TraceCallDisplayMode } from "@/components/conversation/ConversationTrace";
import { cn } from "@/lib/utils";
import { SessionContinuousTurnSkeleton } from "./session-continuous-turn-skeleton";
import {
	type SessionContinuousTurnViewportStore,
	useSessionContinuousTurnActiveSpeaker,
} from "./session-continuous-turn-viewport-store";
import {
	getSessionDetailSkeletonTurnPolicy,
	type SessionDetailSkeletonDebugMode,
} from "./session-detail-skeleton-debug";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionMemberRow } from "./session-member-row";
import { SessionTurnResponseTrace } from "./session-turn-response-trace";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export type SessionContinuousTurnBodyState = "error" | "loading";

export const SessionContinuousTurnSection = memo(
	function SessionContinuousTurnSection({
		bodyState,
		className,
		continuesThread,
		debugMode,
		estimatedSize,
		index,
		onRetryTurnBody,
		option,
		startsTrace,
		traceCallDisplayMode,
		userImageUrl,
		viewModel,
		viewportStore,
	}: {
		bodyState: SessionContinuousTurnBodyState | undefined;
		className?: string;
		continuesThread: boolean;
		debugMode: SessionDetailSkeletonDebugMode;
		estimatedSize: number;
		index: number;
		onRetryTurnBody: ((index: number) => void) | undefined;
		option: SessionTurnTablePaneOption;
		startsTrace: boolean;
		traceCallDisplayMode: TraceCallDisplayMode;
		userImageUrl: string | undefined;
		viewModel: SessionDetailViewModel;
		viewportStore: SessionContinuousTurnViewportStore;
	}) {
		const sectionLabel =
			option.turnNumber === undefined
				? "Session start"
				: `Turn ${option.turnNumber}`;
		const debugState = option.turn
			? "full"
			: bodyState === "loading"
				? "hydrating"
				: "skeleton";
		const forceSkeleton = !getSessionDetailSkeletonTurnPolicy(debugMode, index)
			.hydrate;

		return (
			<ContinuousTurnActivityFrame
				className={className}
				continuesThread={continuesThread}
				debugMode={debugMode}
				debugState={debugState}
				estimatedSize={estimatedSize}
				hydrated={Boolean(option.turn)}
				index={index}
				sectionLabel={sectionLabel}
				viewportStore={viewportStore}
			>
				<ContinuousTurnStaticBody
					bodyState={bodyState}
					continuesThread={continuesThread}
					forceSkeleton={forceSkeleton}
					index={index}
					onRetryTurnBody={onRetryTurnBody}
					option={option}
					startsTrace={startsTrace}
					traceCallDisplayMode={traceCallDisplayMode}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			</ContinuousTurnActivityFrame>
		);
	},
);

const ContinuousTurnActivityFrame = memo(function ContinuousTurnActivityFrame({
	children,
	className,
	continuesThread,
	debugMode,
	debugState,
	estimatedSize,
	hydrated,
	index,
	sectionLabel,
	viewportStore,
}: {
	children: ReactNode;
	className?: string;
	continuesThread: boolean;
	debugMode: SessionDetailSkeletonDebugMode;
	debugState: "full" | "hydrating" | "skeleton";
	estimatedSize: number;
	hydrated: boolean;
	index: number;
	sectionLabel: string;
	viewportStore: SessionContinuousTurnViewportStore;
}) {
	const activeSpeaker = useSessionContinuousTurnActiveSpeaker(
		viewportStore,
		index,
	);
	const activeModelPosition =
		activeSpeaker === "model"
			? index === 0
				? "first"
				: continuesThread
					? "middle"
					: "last"
			: undefined;
	const sectionRef = useRef<HTMLElement>(null);

	return (
		<section
			ref={sectionRef}
			aria-current={activeSpeaker ? "step" : undefined}
			aria-label={sectionLabel}
			className={cn("relative scroll-mt-0", className)}
			data-active-rail-position={activeModelPosition}
			data-active-speaker={activeSpeaker}
			data-continuous-turn-index={index}
			// Skeleton sections stay in normal rendering so their placeholder
			// always paints; only hydrated turns are heavy enough to skip
			// offscreen, and `auto` keeps their real measured size once painted.
			style={
				hydrated
					? {
							containIntrinsicSize: `auto ${estimatedSize}px`,
							contentVisibility: "auto",
						}
					: undefined
			}
		>
			{children}
			{debugMode.kind === "off" ? null : (
				<SessionTurnSkeletonDebugBadge
					estimatedHeight={estimatedSize}
					sectionRef={sectionRef}
					state={debugState}
				/>
			)}
		</section>
	);
});

function SessionTurnSkeletonDebugBadge({
	estimatedHeight,
	sectionRef,
	state,
}: {
	estimatedHeight: number;
	sectionRef: RefObject<HTMLElement | null>;
	state: "full" | "hydrating" | "skeleton";
}) {
	const [measuredHeight, setMeasuredHeight] = useState<number>();
	useMountEffect(() => {
		const element = sectionRef.current;
		if (!element) {
			return;
		}
		const measure = () => setMeasuredHeight(Math.round(element.offsetHeight));
		measure();
		if (typeof ResizeObserver !== "function") {
			return;
		}
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	});
	const delta =
		measuredHeight === undefined ? undefined : measuredHeight - estimatedHeight;
	return (
		<output
			className="pointer-events-none absolute top-1 right-2 z-50 rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) px-2 py-1 text-[0.6875rem] font-medium text-(--session-overview-muted) shadow-sm tabular-nums"
			data-session-skeleton-debug-state={state}
		>
			{state} · est {estimatedHeight}px · measured {measuredHeight ?? "…"}px · Δ{" "}
			{delta === undefined ? "…" : `${delta >= 0 ? "+" : ""}${delta}px`}
		</output>
	);
}

const ContinuousTurnStaticBody = memo(function ContinuousTurnStaticBody({
	bodyState,
	className,
	continuesThread,
	forceSkeleton,
	index,
	onRetryTurnBody,
	option,
	startsTrace,
	traceCallDisplayMode,
	userImageUrl,
	viewModel,
}: {
	bodyState: SessionContinuousTurnBodyState | undefined;
	className?: string;
	continuesThread: boolean;
	forceSkeleton: boolean;
	index: number;
	onRetryTurnBody: ((index: number) => void) | undefined;
	option: SessionTurnTablePaneOption;
	startsTrace: boolean;
	traceCallDisplayMode: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const turn = option.turn;
	const hasMemberMessage = turn?.userItems.length
		? true
		: option.memberPreview !== "No member message";
	const onRetry = onRetryTurnBody ? () => onRetryTurnBody(index) : undefined;

	return (
		<div className={cn("w-full min-w-0", className)}>
			{hasMemberMessage && turn ? (
				<SessionMemberRow
					active={false}
					headingId={`continuous-member-message-${index}`}
					items={turn.userItems}
					speakerLayout="trace-tree"
					startsTrace={startsTrace}
					userImageUrl={userImageUrl}
					userLabel={viewModel.safeUserDisplayName}
				/>
			) : null}
			<section
				aria-label={option.turnNumber === undefined ? "Preamble" : "Response"}
				className="min-w-0"
				data-session-turn-speaker="model"
			>
				{turn ? (
					<SessionTurnResponseTrace
						agentSectionMode="expanded"
						continuesAfter={continuesThread}
						option={{ ...option, turn }}
						speakerLayout="trace-tree"
						traceCallDisplayMode={traceCallDisplayMode}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
					/>
				) : forceSkeleton ? (
					<SessionContinuousTurnSkeleton
						continuesThread={continuesThread}
						option={option}
						userLabel={viewModel.safeUserDisplayName}
					/>
				) : option.hasBody === false ? (
					<p className="py-10 text-center text-sm text-(--session-overview-muted)">
						No response recorded
					</p>
				) : bodyState === "error" ? (
					<div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-(--session-overview-muted)">
						<p>This turn could not be loaded.</p>
						{onRetry ? (
							<Button
								onClick={onRetry}
								size="sm"
								type="button"
								variant="outline"
							>
								Retry turn
							</Button>
						) : null}
					</div>
				) : (
					<SessionContinuousTurnSkeleton
						continuesThread={continuesThread}
						option={option}
						userLabel={viewModel.safeUserDisplayName}
					/>
				)}
			</section>
		</div>
	);
});
