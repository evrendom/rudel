import type { RefObject } from "react";
import type {
	ConversationTraceSpeakerLayout,
	TraceCallVariant,
} from "@/components/conversation/ConversationTrace";
import { cn } from "@/lib/utils";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	type SelectedTurnOption,
	SessionSelectedTurn,
	type SessionThreadTransitionDirection,
} from "./session-selected-turn";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export function SessionTurnResponsePane({
	activeIndex,
	bottomPaddingClassName,
	followingOption,
	nextOption,
	onContinuousTurnFocus,
	onContinuousTurnViewportChange,
	options,
	responseTraceLayout = "table-row",
	responseScrollRef,
	selectedOption,
	showTurnMetadataTags = false,
	traceCallVariant = "v1",
	transitionDirection,
	userImageUrl,
	variant,
	viewModel,
}: {
	activeIndex: number;
	bottomPaddingClassName: string;
	followingOption: SelectedTurnOption | undefined;
	nextOption: SelectedTurnOption | undefined;
	onContinuousTurnFocus: (index: number) => void;
	onContinuousTurnViewportChange?: (
		activeIndex: number,
		visibleRange: readonly [number, number],
	) => void;
	options: readonly SelectedTurnOption[];
	responseTraceLayout?: ConversationTraceSpeakerLayout;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	selectedOption: SelectedTurnOption | undefined;
	showTurnMetadataTags?: boolean;
	traceCallVariant?: TraceCallVariant;
	transitionDirection: SessionThreadTransitionDirection;
	userImageUrl: string | undefined;
	variant: "table" | "thread";
	viewModel: SessionDetailViewModel;
}) {
	return (
		<section
			ref={responseScrollRef}
			aria-label={
				variant === "thread" ? "Conversation thread" : "Selected turn response"
			}
			className={cn(
				"h-full min-h-0 min-w-0 overflow-y-auto",
				variant === "thread" ? "overscroll-contain" : "overscroll-none",
				bottomPaddingClassName,
			)}
		>
			{variant === "thread" ? (
				<SessionContinuousTurnThread
					activeIndex={activeIndex}
					onActiveIndexChange={onContinuousTurnFocus}
					onViewportChange={onContinuousTurnViewportChange}
					options={options}
					responseTraceLayout={responseTraceLayout}
					scrollContainerRef={responseScrollRef}
					showTurnMetadataTags={showTurnMetadataTags}
					traceCallVariant={traceCallVariant}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			) : (
				<SessionSelectedTurn
					followingOption={followingOption}
					nextOption={nextOption}
					option={selectedOption}
					tableExperiment
					transitionDirection={transitionDirection}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			)}
		</section>
	);
}
