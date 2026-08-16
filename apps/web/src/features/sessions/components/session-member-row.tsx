import { Collapsible } from "@base-ui/react/collapsible";
import { type ReactNode, useId, useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	ConversationTraceCollapsiblePanel,
	type ConversationTraceSpeakerLayout,
	ConversationTraceTreeItem,
} from "@/components/conversation/ConversationTrace";
import {
	compactPreview,
	type UserContent,
	userContentText,
} from "@/components/conversation/conversation-trace";
import {
	conversationTracePreviewClassName,
	conversationTraceStickyOnlyFillClassName,
} from "@/components/conversation/conversation-trace-class-names";
import { UserTraceAvatar } from "@/components/conversation/conversation-trace-icons";
import { cn } from "@/lib/utils";
import type { SessionTurn } from "./session-turns";

const COLLAPSED_PROMPT_HEIGHT_PX = 96;

export function CollapsiblePrompt({ content }: { content: UserContent }) {
	const contentRef = useRef<HTMLParagraphElement>(null);
	const panelId = useId();
	const [expanded, setExpanded] = useState(false);
	const [truncated, setTruncated] = useState(false);
	const text = userContentText(content);

	useMountEffect(() => {
		const element = contentRef.current;
		if (!element) {
			return;
		}

		const measure = () => {
			setTruncated(element.scrollHeight > COLLAPSED_PROMPT_HEIGHT_PX + 1);
		};

		measure();
		if (typeof ResizeObserver !== "function") {
			return;
		}

		const resizeObserver = new ResizeObserver(measure);
		resizeObserver.observe(element);
		return () => resizeObserver.disconnect();
	});

	return (
		<div className="relative min-w-0">
			<div className="relative min-w-0">
				<p
					id={panelId}
					ref={contentRef}
					className={cn(
						"whitespace-pre-wrap break-words text-[0.8125rem] leading-6 text-(--session-overview-text)",
						!expanded && "max-h-24 overflow-hidden",
					)}
				>
					{text}
				</p>
			</div>
			{truncated ? (
				<button
					type="button"
					aria-controls={panelId}
					aria-expanded={expanded}
					className="mt-2 min-h-9 rounded-md px-2 text-xs font-medium text-(--session-overview-text) outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
					onClick={() => setExpanded((current) => !current)}
				>
					{expanded ? "Less" : "More"}
				</button>
			) : null}
		</div>
	);
}

export function SessionMemberRow({
	active,
	headerTrailing,
	headingId,
	items,
	speakerLayout,
	startsTrace,
	userImageUrl,
	userLabel,
}: {
	active: boolean;
	headerTrailing?: ReactNode;
	headingId: string;
	items: SessionTurn["userItems"];
	speakerLayout: ConversationTraceSpeakerLayout;
	startsTrace: boolean;
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	const promptPanelId = useId();
	const [promptExpanded, setPromptExpanded] = useState(true);

	if (speakerLayout === "trace-tree") {
		const promptPreviewText = items
			.flatMap((item) =>
				item.kind === "user" ? [userContentText(item.content)] : [],
			)
			.join(" ");
		const promptRows = (
			<ConversationTraceCollapsiblePanel id={promptPanelId}>
				<div className="grid min-w-0 divide-y divide-(--session-overview-border)">
					{items.map((item) =>
						item.kind === "user" ? (
							<div key={item.id} className="min-w-0 py-2 pr-3 pl-[3.25rem]">
								<CollapsiblePrompt content={item.content} />
							</div>
						) : null,
					)}
				</div>
			</ConversationTraceCollapsiblePanel>
		);

		return (
			<Collapsible.Root open={promptExpanded} onOpenChange={setPromptExpanded}>
				<section
					aria-labelledby={headingId}
					className={cn("min-w-0", conversationTraceStickyOnlyFillClassName)}
					data-active-member={active ? "true" : undefined}
					data-session-turn-speaker="member"
					data-trace-start-node={startsTrace ? "true" : undefined}
				>
					<ConversationTraceTreeItem
						continues
						continuesThroughSubtree
						depth={1}
						sticky
						subtree={promptRows}
					>
						<Collapsible.Trigger
							className="group flex min-h-10 w-full min-w-0 items-center gap-2 pr-3 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)"
							data-trace-hover-row
						>
							<UserTraceAvatar
								expanded={promptExpanded}
								expandable
								imageUrl={userImageUrl}
							/>
							<h3
								id={headingId}
								className="min-w-0 shrink-0 truncate text-xs font-medium text-(--session-overview-text)"
							>
								{userLabel}
							</h3>
							<p
								className={conversationTracePreviewClassName}
								data-trace-preview
							>
								{compactPreview(promptPreviewText, Number.POSITIVE_INFINITY)}
							</p>
							{headerTrailing ? (
								<div className="ml-auto min-w-0">{headerTrailing}</div>
							) : null}
						</Collapsible.Trigger>
					</ConversationTraceTreeItem>
				</section>
			</Collapsible.Root>
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
								<CollapsiblePrompt content={item.content} />
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
						<CollapsiblePrompt key={item.id} content={item.content} />
					) : null,
				)}
			</div>
		</section>
	);
}
