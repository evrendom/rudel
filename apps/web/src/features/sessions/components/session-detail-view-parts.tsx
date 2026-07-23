import {
	FolderGit2,
	GitBranch,
	type LucideIcon,
	MessageSquare,
} from "lucide-react";
import { Component, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { parseConversations } from "@/lib/conversation-schema";
import { cn } from "@/lib/utils";

export const sessionArchetypeStyles: Record<
	string,
	{ bg: string; text: string; label: string }
> = {
	quick_win: {
		bg: "bg-[color:var(--dashboardy-success-surface)]",
		text: "text-[color:var(--dashboardy-success-foreground)]",
		label: "Quick Win",
	},
	deep_work: {
		bg: "bg-[color:var(--dashboardy-chip-surface)]",
		text: "text-[color:var(--dashboardy-chip-foreground)]",
		label: "Deep Work",
	},
	struggle: {
		bg: "bg-[color:var(--dashboardy-danger-surface)]",
		text: "text-[color:var(--dashboardy-danger-foreground)]",
		label: "Struggle",
	},
	exploration: {
		bg: "bg-[color:var(--dashboardy-subsurface-strong)]",
		text: "text-[color:var(--dashboardy-heading)]",
		label: "Exploration",
	},
	abandoned: {
		bg: "bg-[color:var(--dashboardy-subsurface)]",
		text: "text-[color:var(--dashboardy-muted)]",
		label: "Abandoned",
	},
	standard: {
		bg: "bg-[color:var(--dashboardy-subsurface-strong)]",
		text: "text-[color:var(--dashboardy-muted)]",
		label: "Standard",
	},
};

export function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return fallback;
}

export function toStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

export function toOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function toContentString(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (value === null || value === undefined) {
		return "";
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return "";
	}
}

export function toSubagentMap(value: unknown): Record<string, string> {
	if (Array.isArray(value)) {
		return Object.fromEntries(
			value.filter(
				(item): item is [string, string] =>
					Array.isArray(item) &&
					item.length >= 2 &&
					typeof item[0] === "string" &&
					typeof item[1] === "string",
			),
		);
	}

	if (!value || typeof value !== "object") {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value).filter(
			([key, entryValue]) =>
				typeof key === "string" && typeof entryValue === "string",
		),
	);
}

export function getConversationSummary(content: string) {
	if (content.trim() === "") {
		return null;
	}

	try {
		const parsed = parseConversations(content);
		if (parsed.length === 0) {
			return null;
		}

		const summary = {
			totalMessages: 0,
			userMessages: 0,
			assistantMessages: 0,
			systemMessages: 0,
		};

		for (const entry of parsed) {
			if (entry.type === "user") {
				summary.userMessages += 1;
				summary.totalMessages += 1;
				continue;
			}

			if (entry.type === "assistant") {
				summary.assistantMessages += 1;
				summary.totalMessages += 1;
				continue;
			}

			if (entry.type === "system") {
				summary.systemMessages += 1;
				summary.totalMessages += 1;
			}
		}

		return summary;
	} catch {
		return null;
	}
}

export function shortenLabelFromLeft(label: string, maxLength: number) {
	if (label.length <= maxLength) {
		return label;
	}

	const slashSegments = label.split("/").filter(Boolean);
	const trailingPair = slashSegments.slice(-2).join("/");

	if (trailingPair.length > 0 && trailingPair.length + 4 <= maxLength) {
		return `.../${trailingPair}`;
	}

	const trailingSegment = slashSegments.at(-1);

	if (trailingSegment && trailingSegment.length + 4 <= maxLength) {
		return `.../${trailingSegment}`;
	}

	return `...${label.slice(-(maxLength - 3))}`;
}

export function SessionTranscriptSummaryTab({
	totalMessages,
	userMessages,
	assistantMessages,
	systemMessages,
}: {
	totalMessages: number;
	userMessages: number;
	assistantMessages: number;
	systemMessages: number;
}) {
	const segments = [
		{
			id: "user",
			count: userMessages,
			className: "bg-[color:var(--dashboardy-chat-user-segment)]",
		},
		{
			id: "assistant",
			count: assistantMessages,
			className: "bg-[color:var(--dashboardy-accent)]",
		},
		{
			id: "system",
			count: systemMessages,
			className: "bg-[color:var(--dashboardy-warning-foreground)]",
		},
	].filter((segment) => segment.count > 0);

	return (
		<div className="dashboardy-meter-badge inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5">
			<MessageSquare className="size-4 shrink-0 text-[color:var(--dashboardy-heading)]" />
			<div className="text-[0.8125rem] font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
				{totalMessages}
			</div>
			<div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-[color:var(--dashboardy-divider)]/55">
				{segments.map((segment) => (
					<div
						key={segment.id}
						className={segment.className}
						style={{ flexGrow: segment.count }}
					/>
				))}
			</div>
		</div>
	);
}

export function SessionDetailMetric({
	label,
	value,
	className,
	title,
	valueClassName,
}: {
	label: string;
	value: ReactNode;
	className?: string;
	title?: string;
	valueClassName?: string;
}) {
	const valueTitle =
		title ??
		(typeof value === "string" || typeof value === "number"
			? String(value)
			: undefined);

	return (
		<div className={cn("grid min-w-0 gap-1", className)}>
			<p className="dashboardy-label truncate">{label}</p>
			<div
				className={cn(
					"min-w-0 text-[0.95rem]/6 font-semibold tabular-nums text-[color:var(--dashboardy-heading)]",
					valueClassName ?? "truncate",
				)}
				title={valueTitle}
			>
				{value}
			</div>
		</div>
	);
}

export function SessionDetailHoverTooltip({
	children,
	text,
}: {
	children: ReactNode;
	text: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}

type SessionMetadataBadge = {
	displayLabel: string;
	icon: LucideIcon;
	label: string;
	tooltip: string;
};

export function createSessionMetadataBadges({
	gitBranch,
	repository,
}: {
	gitBranch: string | null;
	repository: string | null;
}): SessionMetadataBadge[] {
	const metadataBadges: SessionMetadataBadge[] = [];

	if (repository) {
		metadataBadges.push({
			displayLabel: shortenLabelFromLeft(repository, 30),
			icon: FolderGit2,
			label: repository,
			tooltip: "Worktree",
		});
	}

	if (gitBranch) {
		metadataBadges.push({
			displayLabel: shortenLabelFromLeft(gitBranch, 26),
			icon: GitBranch,
			label: gitBranch,
			tooltip: "Branch",
		});
	}

	return metadataBadges;
}

type SessionDetailErrorBoundaryProps = {
	children: ReactNode;
};

type SessionDetailErrorBoundaryState = {
	hasError: boolean;
};

export class SessionDetailErrorBoundary extends Component<
	SessionDetailErrorBoundaryProps,
	SessionDetailErrorBoundaryState
> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override componentDidCatch(error: unknown) {
		console.error("[SessionDetailView] Failed to render session detail", error);
	}

	override render() {
		if (this.state.hasError) {
			return (
				<div className="flex h-full items-center justify-center px-6 py-10">
					<div className="dashboardy-card max-w-md rounded-[1.5rem] border px-6 py-5 text-center shadow-none">
						<p className="text-lg font-semibold text-[color:var(--dashboardy-heading)]">
							Unable to render this session
						</p>
						<p className="mt-2 text-sm text-[color:var(--dashboardy-muted)]">
							The transcript payload for this session uses an unexpected shape.
						</p>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
