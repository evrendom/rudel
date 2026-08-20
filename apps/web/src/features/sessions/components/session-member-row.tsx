import { scanMemberLanguageSignals } from "@rudel/language-signals";
import { type ReactNode, useId } from "react";
import {
	type ConversationTraceSpeakerLayout,
	ConversationTraceTreeItem,
	TraceTextDisclosureIcon,
} from "@/components/conversation/ConversationTrace";
import {
	type UserContent,
	userContentText,
} from "@/components/conversation/conversation-trace";
import {
	conversationTraceSignalAwarePreviewClassName,
	conversationTraceStickyOnlyFillClassName,
} from "@/components/conversation/conversation-trace-class-names";
import { UserTraceAvatar } from "@/components/conversation/conversation-trace-icons";
import {
	isTraceTextCollapsible,
	TraceTextCollapsedPreview,
} from "@/components/conversation/conversation-trace-text-disclosure";
import { useTraceExpansionState } from "@/components/conversation/expandable-trace-row";
import { SignalText } from "@/components/signal-text";
import { cn } from "@/lib/utils";
import type { SessionTurn } from "./session-turns";

function UserPrompt({ content }: { content: UserContent }) {
	return (
		<p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-6 text-(--session-overview-text)">
			<SignalText
				scanSignals={scanMemberLanguageSignals}
				text={userContentText(content)}
			/>
		</p>
	);
}

const userPromptRowClassName = "min-w-0 pt-0 pr-3 pb-2 pl-[1.8125rem]";

export function SessionMemberRow({
	active,
	continues = true,
	headerHeight,
	headerTrailing,
	headingId,
	items,
	speakerLayout,
	startsTrace,
	stickyHeader = true,
	terminal = false,
	userImageUrl,
	userLabel,
}: {
	active: boolean;
	continues?: boolean;
	headerHeight?: number;
	headerTrailing?: ReactNode;
	headingId: string;
	items: SessionTurn["userItems"];
	speakerLayout: ConversationTraceSpeakerLayout;
	startsTrace: boolean;
	stickyHeader?: boolean;
	terminal?: boolean;
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	const promptPanelId = useId();
	const { open: promptExpanded, setOpen: setPromptExpanded } =
		useTraceExpansionState(headingId);

	if (speakerLayout === "trace-tree") {
		const promptPreviewParts = items
			.flatMap((item) =>
				item.kind === "user"
					? [
							{
								text: userContentText(item.content),
							},
						]
					: [],
			)
			.filter(({ text }) => text.length > 0);
		const promptCollapsible = isTraceTextCollapsible(
			promptPreviewParts.map(({ text }) => text).join(""),
		);
		const showFullPrompt = !promptCollapsible || promptExpanded;
		const promptRows = (
			<div
				id={promptPanelId}
				className="grid min-w-0 divide-y divide-(--session-overview-border)"
			>
				{showFullPrompt ? (
					items.map((item) =>
						item.kind === "user" ? (
							<div key={item.id} className={userPromptRowClassName}>
								<UserPrompt content={item.content} />
							</div>
						) : null,
					)
				) : (
					<div className={userPromptRowClassName}>
						<p
							className={conversationTraceSignalAwarePreviewClassName}
							data-trace-preview
						>
							<TraceTextCollapsedPreview
								scanSignals={scanMemberLanguageSignals}
								text={promptPreviewParts.map(({ text }) => text)}
							/>
						</p>
					</div>
				)}
			</div>
		);

		return (
			<section
				aria-labelledby={headingId}
				className={cn("min-w-0", conversationTraceStickyOnlyFillClassName)}
				data-active-member={active ? "true" : undefined}
				data-session-turn-speaker="member"
				data-transcript-member-terminal={terminal || undefined}
				data-trace-start-node={startsTrace ? "true" : undefined}
			>
				<ConversationTraceTreeItem
					continues={continues}
					continuesThroughSubtree
					depth={1}
					hideIncomingRail={startsTrace}
					rowHeight={headerHeight}
					sticky={stickyHeader}
					subtree={promptRows}
				>
					<div
						className="flex min-h-10 w-full min-w-0 items-center gap-2 pr-3 text-left"
						data-transcript-user-header-source="row"
						data-trace-hover-row={promptCollapsible || undefined}
						style={headerHeight ? { minHeight: headerHeight } : undefined}
					>
						<UserTraceAvatar
							expanded={false}
							expandable={false}
							imageUrl={userImageUrl}
						/>
						{promptCollapsible ? (
							<button
								type="button"
								aria-controls={promptPanelId}
								aria-expanded={promptExpanded}
								className="group flex min-w-0 items-center gap-0 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)"
								data-trace-content-disclosure
								onClick={() => setPromptExpanded((current) => !current)}
							>
								<h3
									id={headingId}
									className="min-w-0 shrink-0 truncate text-xs font-medium text-(--session-overview-text)"
								>
									{userLabel}
								</h3>
								<TraceTextDisclosureIcon expanded={promptExpanded} />
							</button>
						) : (
							<h3
								id={headingId}
								className="min-w-0 shrink-0 truncate text-xs font-medium text-(--session-overview-text)"
							>
								{userLabel}
							</h3>
						)}
						{headerTrailing ? (
							<div className="ml-auto min-w-0">{headerTrailing}</div>
						) : null}
					</div>
				</ConversationTraceTreeItem>
			</section>
		);
	}

	if (speakerLayout === "table-row") {
		return (
			<section
				aria-labelledby={headingId}
				className="min-w-0 border-b border-(--session-overview-border) bg-(--session-overview-surface)"
			>
				<div className="sticky top-0 z-20 flex min-h-9 min-w-0 items-center gap-2 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3 py-2">
					<UserTraceAvatar
						expanded={false}
						expandable={false}
						imageUrl={userImageUrl}
					/>
					<h3
						id={headingId}
						className="min-w-0 truncate text-xs font-medium text-(--session-overview-muted)"
					>
						{userLabel}
					</h3>
					{headerTrailing ? (
						<div className="ml-auto min-w-0">{headerTrailing}</div>
					) : null}
				</div>
				<div className="grid min-w-0 divide-y divide-(--session-overview-border)">
					{items.map((item) =>
						item.kind === "user" ? (
							<div key={item.id} className="min-w-0 py-2 pr-3 pl-10">
								<UserPrompt content={item.content} />
							</div>
						) : null,
					)}
				</div>
			</section>
		);
	}

	return (
		<section
			aria-labelledby={headingId}
			className="flex min-w-0 items-start gap-2 py-5"
		>
			<UserTraceAvatar
				expanded={false}
				expandable={false}
				imageUrl={userImageUrl}
			/>
			<div className="grid min-w-0 flex-1 gap-2">
				<h3
					id={headingId}
					className="text-xs font-medium text-(--session-overview-subtle)"
				>
					{userLabel}
				</h3>
				{items.map((item) =>
					item.kind === "user" ? (
						<UserPrompt key={item.id} content={item.content} />
					) : null,
				)}
			</div>
		</section>
	);
}
