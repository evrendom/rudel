import { type ReactNode, useId, useState } from "react";
import {
	type ConversationTraceSpeakerLayout,
	ConversationTraceTreeItem,
	TraceTextDisclosureIcon,
} from "@/components/conversation/ConversationTrace";
import {
	compactPreview,
	type UserContent,
	userContentText,
} from "@/components/conversation/conversation-trace";
import {
	conversationTraceProsePreviewClassName,
	conversationTraceStickyOnlyFillClassName,
} from "@/components/conversation/conversation-trace-class-names";
import { UserTraceAvatar } from "@/components/conversation/conversation-trace-icons";
import { cn } from "@/lib/utils";
import type { SessionTurn } from "./session-turns";

function UserPrompt({ content }: { content: UserContent }) {
	return (
		<p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-6 text-(--session-overview-text)">
			{userContentText(content)}
		</p>
	);
}

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
	const [promptExpanded, setPromptExpanded] = useState(false);

	if (speakerLayout === "trace-tree") {
		const promptPreviewText = items
			.flatMap((item) =>
				item.kind === "user" ? [userContentText(item.content)] : [],
			)
			.join(" ");
		const promptRows = (
			<div
				id={promptPanelId}
				className="grid min-w-0 divide-y divide-(--session-overview-border)"
			>
				{promptExpanded ? (
					items.map((item) =>
						item.kind === "user" ? (
							<div key={item.id} className="min-w-0 py-2 pr-3 pl-[3.25rem]">
								<UserPrompt content={item.content} />
							</div>
						) : null,
					)
				) : (
					<div className="min-w-0 py-2 pr-3 pl-[3.25rem]">
						<p
							className={conversationTraceProsePreviewClassName}
							data-trace-preview
						>
							{compactPreview(promptPreviewText, Number.POSITIVE_INFINITY)}
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
					rowHeight={headerHeight}
					sticky={stickyHeader}
					subtree={promptRows}
				>
					<div
						className="flex min-h-10 w-full min-w-0 items-center gap-2 pr-3 text-left"
						data-transcript-user-header-source="row"
						data-trace-hover-row
						style={headerHeight ? { minHeight: headerHeight } : undefined}
					>
						<UserTraceAvatar
							expanded={false}
							expandable={false}
							imageUrl={userImageUrl}
						/>
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
