import type { RefObject } from "react";
import { TabsList, TabsTrigger } from "@/app/ui/tabs";
import { ConversationView } from "@/components/conversation/ConversationView";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import { NormalSessionTurnStrip } from "./normal-session-turn-strip";
import {
	SESSION_DETAIL_EXPERIMENT_TABS,
	type SessionDetailExperimentTab,
} from "./session-detail-experiment-tabs";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const columnBottomPaddingClassName =
	"pb-[calc(5rem+env(safe-area-inset-bottom))]";

export function SessionExperimentTabBar({
	activeTab,
	jsonlRecordCount,
}: {
	activeTab: SessionDetailExperimentTab;
	jsonlRecordCount: number | undefined;
}) {
	return (
		<header className="flex h-11 shrink-0 items-center justify-between gap-5 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-5">
			<TabsList
				aria-label="Session view"
				className="h-full gap-5 rounded-none p-0"
				variant="line"
			>
				{SESSION_DETAIL_EXPERIMENT_TABS.map((tab) => (
					<TabsTrigger
						key={tab.value}
						className="h-full flex-none rounded-none px-0 text-sm font-medium tracking-[-0.01em] text-(--session-overview-muted) after:bottom-0 after:h-0.5 data-active:text-(--session-overview-text)"
						value={tab.value}
					>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
			{activeTab === "jsonl" && jsonlRecordCount !== undefined ? (
				<p className="shrink-0 text-xs text-(--session-overview-muted) tabular-nums">
					{jsonlRecordCount.toLocaleString()} records
				</p>
			) : null}
		</header>
	);
}

export function SessionExperimentConversation({
	responseScrollRef,
	userImageUrl,
	viewModel,
}: {
	responseScrollRef: RefObject<HTMLDivElement | null>;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	return (
		<div className="flex h-full min-h-0 min-w-0">
			<div
				ref={responseScrollRef}
				className={cn(
					"h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain",
					columnBottomPaddingClassName,
				)}
			>
				<div className="mx-auto w-full max-w-[62rem] px-6 py-5">
					<ConversationView
						agentLabel={
							viewModel.safeModelUsed
								? formatModelDisplayLabel(viewModel.safeModelUsed)
								: undefined
						}
						agentModel={viewModel.safeModelUsed}
						content={viewModel.safeContent}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
					/>
				</div>
			</div>
			<NormalSessionTurnStrip
				content={viewModel.safeContent}
				scrollContainerRef={responseScrollRef}
			/>
		</div>
	);
}

export function SessionExperimentRawJsonl({
	content,
	responseScrollRef,
}: {
	content: string;
	responseScrollRef: RefObject<HTMLDivElement | null>;
}) {
	return (
		<section
			ref={responseScrollRef}
			aria-label="Session JSONL"
			className={cn(
				"h-full min-h-0 min-w-0 overflow-auto overscroll-contain bg-(--session-overview-hover)",
				columnBottomPaddingClassName,
			)}
		>
			<pre className="min-h-full w-full whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-(--session-overview-text) [tab-size:2]">
				{content || "No JSONL available"}
			</pre>
		</section>
	);
}
