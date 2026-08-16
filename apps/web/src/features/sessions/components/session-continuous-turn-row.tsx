import { memo, type ReactNode } from "react";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import type { TraceCallDisplayMode } from "@/components/conversation/ConversationTrace";
import { cn } from "@/lib/utils";
import {
	type SessionContinuousTurnViewportStore,
	useSessionContinuousTurnActiveSpeaker,
} from "./session-continuous-turn-viewport-store";
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

		return (
			<ContinuousTurnActivityFrame
				className={className}
				continuesThread={continuesThread}
				estimatedSize={estimatedSize}
				index={index}
				sectionLabel={sectionLabel}
				viewportStore={viewportStore}
			>
				<ContinuousTurnStaticBody
					bodyState={bodyState}
					continuesThread={continuesThread}
					estimatedSize={estimatedSize}
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
	estimatedSize,
	index,
	sectionLabel,
	viewportStore,
}: {
	children: ReactNode;
	className?: string;
	continuesThread: boolean;
	estimatedSize: number;
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

	return (
		<section
			aria-current={activeSpeaker ? "step" : undefined}
			aria-label={sectionLabel}
			className={cn("scroll-mt-0", className)}
			data-active-rail-position={activeModelPosition}
			data-active-speaker={activeSpeaker}
			data-continuous-turn-index={index}
			style={{
				containIntrinsicSize: `auto ${estimatedSize}px`,
				contentVisibility: "auto",
			}}
		>
			{children}
		</section>
	);
});

const ContinuousTurnStaticBody = memo(function ContinuousTurnStaticBody({
	bodyState,
	className,
	continuesThread,
	estimatedSize,
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
	estimatedSize: number;
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
					<div
						aria-busy="true"
						className="grid gap-3 p-4"
						style={{ minHeight: estimatedSize }}
					>
						<output className="sr-only">Loading turn</output>
						<Skeleton className="h-16 w-full rounded-md" />
						<Skeleton className="h-32 w-full rounded-md" />
					</div>
				)}
			</section>
		</div>
	);
});
