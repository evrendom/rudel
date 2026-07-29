import { useQuery } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	CircleDollarSign,
	Clock3,
	Gauge,
	Info,
	type LucideIcon,
	User,
	X,
} from "lucide-react";
import { useRef } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { Skeleton } from "@/app/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { ConversationView } from "@/components/conversation/ConversationView";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { DashboardModelIdentity } from "@/features/dashboard/components/DashboardModelBadges";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { DashboardHeader } from "@/features/shell/components/dashboard-header";
import { shellPressMotionClassName } from "@/features/shell/components/shell-press-motion";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionDetailErrorBoundary } from "./session-detail-view-parts";
import type { SessionDetailNavigation } from "./session-detail-view-types";
import { isForbiddenError } from "./session-detail-view-utils";

type SessionDetailViewProps = {
	sessionId: string;
	trackView?: boolean;
	navigation?: SessionDetailNavigation;
	onClose?: () => void;
};

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const sessionNavButtonClassName = cn(
	"relative inline-flex size-8 shrink-0 items-center justify-center rounded-(--session-controls-inner-radius) border border-black/10 bg-white text-neutral-950 shadow-none outline-none hover:bg-white focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:active:scale-100",
	shellPressMotionClassName,
);

const sessionInfoButtonClassName =
	"dashboardy-action-button relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-heading)] shadow-none outline-none hover:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:outline-none focus-visible:ring-0";

const sessionNavTouchTargetClassName =
	"absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden";

const sessionLoadingCapabilityRows = [
	{ id: "skills", labelWidth: "w-14", tagWidth: "w-24" },
	{ id: "commands", labelWidth: "w-20", tagWidth: "w-20" },
	{ id: "subagents", labelWidth: "w-16", tagWidth: "w-28" },
] as const;

/**
 * Steps through the session list behind the sheet, in the order the table
 * renders it: up is the newer neighbour, down the older one.
 */
function SessionDetailNavButtons({
	navigation,
}: {
	navigation: SessionDetailNavigation | undefined;
}) {
	if (!navigation) {
		return null;
	}

	return (
		<div className="flex shrink-0 items-center gap-1.5 rounded-(--session-controls-radius) border border-[color:var(--dashboardy-border)] p-(--session-controls-padding) [--session-controls-border-width:1px] [--session-controls-padding:--spacing(0.5)] [--session-controls-radius:calc(var(--session-controls-inner-radius)+var(--session-controls-padding)+var(--session-controls-border-width))]">
			<button
				type="button"
				aria-label="Previous session"
				className={sessionNavButtonClassName}
				disabled={!navigation.hasPreviousSession}
				onClick={navigation.onPreviousSession}
			>
				<ArrowUp className="size-4" />
				<span className={sessionNavTouchTargetClassName} aria-hidden="true" />
			</button>
			<button
				type="button"
				aria-label="Next session"
				className={sessionNavButtonClassName}
				disabled={!navigation.hasNextSession}
				onClick={navigation.onNextSession}
			>
				<ArrowDown className="size-4" />
				<span className={sessionNavTouchTargetClassName} aria-hidden="true" />
			</button>
		</div>
	);
}

function SessionInfoPopover({
	gitSha,
	metadataBadges,
	sessionId,
}: {
	gitSha: string | null;
	metadataBadges: ReturnType<
		typeof buildSessionDetailViewModel
	>["metadataBadges"];
	sessionId: string;
}) {
	const informationRows = [
		...metadataBadges.map((item) => ({
			label: item.tooltip,
			value: item.label,
		})),
		...(gitSha ? [{ label: "Commit", value: gitSha }] : []),
		{ label: "Session ID", value: sessionId },
	];

	return (
		<Popover>
			<PopoverTrigger
				type="button"
				aria-label="Session information"
				className={sessionInfoButtonClassName}
			>
				<Info className="size-4" />
				<span className={sessionNavTouchTargetClassName} aria-hidden="true" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				sideOffset={8}
				className="w-[32rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-2xl p-0"
			>
				<dl className="divide-y divide-border/60 px-4 py-1">
					{informationRows.map((row) => (
						<div
							key={row.label}
							className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 py-2.5"
						>
							<dt className="text-sm font-medium text-foreground">
								{row.label}
							</dt>
							<dd className="min-w-0 break-words font-mono text-sm text-muted-foreground">
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

function SessionUserIdentity({
	displayName,
	imageUrl,
	messageCount,
}: {
	displayName: string;
	imageUrl: string | undefined;
	messageCount: number | undefined;
}) {
	const safeMessageCount = messageCount ?? 0;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn(sessionIdentityCounterClassName, "cursor-help")}>
					{imageUrl ? (
						<img
							src={imageUrl}
							alt=""
							width={16}
							height={16}
							className="size-4 shrink-0 rounded-full object-cover outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
						/>
					) : (
						<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--dashboardy-subsurface-strong)] outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10">
							<User className="size-3 shrink-0" />
						</span>
					)}
					<div className="shrink-0 font-mono text-base font-semibold tracking-normal text-[color:var(--dashboardy-heading)] tabular-nums sm:text-[0.8125rem]">
						{safeMessageCount}
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent>
				{displayName}: {safeMessageCount} messages
			</TooltipContent>
		</Tooltip>
	);
}

const sessionMetricsGroupClassName =
	"flex w-fit min-w-0 max-w-full items-center divide-x divide-[color:var(--dashboardy-divider)] overflow-x-auto";

const sessionMetricItemClassName =
	"flex shrink-0 items-start gap-2 px-3 first:pl-0 last:pr-0";

const sessionIdentityCounterClassName = "flex shrink-0 items-start gap-2";

const sessionCapabilityTagClassName =
	"inline-flex max-w-full items-center rounded-full bg-[color:var(--dashboardy-subsurface-strong)] px-2 py-0.5 text-base font-medium text-[color:var(--dashboardy-heading)] sm:text-[0.75rem]";

type SessionCapabilityItem =
	| {
			id: string;
			label: string;
			type: "label";
	  }
	| {
			id: string;
			model: string | undefined;
			number: number;
			totalTokens: number | undefined;
			type: "subagent";
	  };

type SessionCapabilityRow = {
	id: string;
	items: readonly SessionCapabilityItem[];
	label: string;
};

function SessionCapabilityTag({ item }: { item: SessionCapabilityItem }) {
	if (item.type === "label") {
		return (
			<li
				className={cn(sessionCapabilityTagClassName, "font-mono")}
				title={item.label}
			>
				<div className="min-w-0 truncate">{item.label}</div>
			</li>
		);
	}

	const modelLabel = item.model
		? formatModelDisplayLabel(item.model)
		: "Model unavailable";
	const tokenLabel =
		item.totalTokens === undefined
			? "Tokens unavailable"
			: `${formatRoundedTokenCount(item.totalTokens)} tokens`;

	return (
		<li
			className={cn(sessionCapabilityTagClassName, "min-w-0 gap-2")}
			title={`${modelLabel}, ${tokenLabel}`}
		>
			<div className="shrink-0 font-mono text-[color:var(--dashboardy-muted)] tabular-nums">
				{String(item.number).padStart(2, "0")}
			</div>
			<div className="min-w-0 truncate">{modelLabel}</div>
			<div className="shrink-0 font-mono text-[color:var(--dashboardy-muted)] tabular-nums">
				{tokenLabel}
			</div>
		</li>
	);
}

function SessionCapabilitiesTable({
	rows,
}: {
	rows: readonly SessionCapabilityRow[];
}) {
	return (
		<table className="w-full table-fixed">
			<caption className="sr-only">Session capabilities</caption>
			<colgroup>
				<col className="w-40" />
				<col />
			</colgroup>
			<thead className="sr-only">
				<tr>
					<th scope="col">Capability</th>
					<th scope="col">Usage</th>
				</tr>
			</thead>
			<tbody className="divide-y divide-[color:var(--dashboardy-divider)]">
				{rows.map((row) => (
					<tr key={row.id}>
						<th
							scope="row"
							className="py-2 pr-4 text-left align-top text-base font-medium whitespace-nowrap text-[color:var(--dashboardy-muted)] sm:text-[0.8125rem]"
						>
							{row.label}
						</th>
						<td className="py-2 align-top">
							<ul className="flex min-w-0 list-none flex-wrap justify-end gap-1">
								{row.items.length > 0 ? (
									row.items.map((item) => (
										<SessionCapabilityTag key={item.id} item={item} />
									))
								) : (
									<li
										className={cn(
											sessionCapabilityTagClassName,
											"bg-[color:var(--dashboardy-subsurface)] text-[color:var(--dashboardy-muted)]",
										)}
									>
										Not used
									</li>
								)}
							</ul>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function SessionMetric({
	icon: Icon,
	label,
	value,
	mono = false,
}: {
	icon: LucideIcon;
	label: string;
	value: string | number;
	mono?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn(sessionMetricItemClassName, "cursor-help")}>
					<Icon
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-[color:var(--dashboardy-heading)]"
					/>
					<div className="min-w-0 flex-1">
						<div
							className={cn(
								"whitespace-nowrap text-base font-semibold text-[color:var(--dashboardy-heading)] tabular-nums sm:text-[0.8125rem]",
								mono && "font-mono",
							)}
						>
							<span className="sr-only">{label}: </span>
							{value}
						</div>
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function SessionMetricSkeleton({ valueClassName }: { valueClassName: string }) {
	return (
		<div className={sessionMetricItemClassName}>
			<Skeleton className="size-4 shrink-0 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
			<div className="min-w-0 flex-1">
				<Skeleton
					className={cn(
						"h-4 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]",
						valueClassName,
					)}
				/>
			</div>
		</div>
	);
}

function formatRoundedTokenCount(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}

	return `${Math.round(value / 1_000)}k`;
}

function formatRoundedDuration(minutes: number | undefined) {
	if (minutes === undefined) {
		return "—";
	}

	const safeMinutes = Math.max(0, minutes);
	if (safeMinutes < 1) {
		return `${Math.round(safeMinutes * 60)}s`;
	}

	if (safeMinutes > 10 * 60) {
		return `${Math.round(safeMinutes / 60)}h`;
	}

	const roundedMinutes = Math.round(safeMinutes);
	const hours = Math.floor(roundedMinutes / 60);
	const remainingMinutes = roundedMinutes % 60;

	if (hours === 0) {
		return `${roundedMinutes}m`;
	}

	if (remainingMinutes === 0) {
		return `${hours}h`;
	}

	return `${hours}h ${remainingMinutes}m`;
}

function SessionMetrics({
	avatarMap,
	viewModel,
}: {
	avatarMap: Record<string, string>;
	viewModel: SessionDetailViewModel;
}) {
	const {
		conversationSummary,
		costLabel,
		safeDurationMin,
		safeInputTokens,
		safeModelUsed,
		safeOutputTokens,
		safeUserDisplayName,
		safeUserId,
	} = viewModel;
	const tokenUsageLabel = `${formatRoundedTokenCount(
		safeInputTokens,
	)} / ${formatRoundedTokenCount(safeOutputTokens)}`;

	return (
		<div className={sessionMetricsGroupClassName}>
			<div className={cn(sessionMetricItemClassName, "gap-3")}>
				{safeModelUsed ? (
					<DashboardModelIdentity
						className={sessionIdentityCounterClassName}
						model={safeModelUsed}
						messageCount={conversationSummary?.assistantMessages}
					/>
				) : null}
				<SessionUserIdentity
					displayName={safeUserDisplayName}
					imageUrl={avatarMap[safeUserId]}
					messageCount={conversationSummary?.userMessages}
				/>
			</div>
			<SessionMetric
				icon={Clock3}
				label="Duration"
				value={formatRoundedDuration(safeDurationMin)}
			/>
			<SessionMetric icon={Gauge} label="Tokens" value={tokenUsageLabel} mono />
			<SessionMetric
				icon={CircleDollarSign}
				label="Cost"
				value={costLabel}
				mono
			/>
		</div>
	);
}

function SessionMetricsSkeleton() {
	return (
		<div className={sessionMetricsGroupClassName}>
			<div className={cn(sessionMetricItemClassName, "gap-3")}>
				<div className={sessionIdentityCounterClassName}>
					<Skeleton className="size-4 shrink-0 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
					<Skeleton className="h-4 w-4 shrink-0 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
				</div>
				<div className={sessionIdentityCounterClassName}>
					<Skeleton className="size-4 shrink-0 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
					<Skeleton className="h-4 w-4 shrink-0 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
				</div>
			</div>
			<SessionMetricSkeleton valueClassName="w-14" />
			<SessionMetricSkeleton valueClassName="w-20" />
			<SessionMetricSkeleton valueClassName="w-16" />
		</div>
	);
}

function SessionDetailContentLoadingView() {
	return (
		<div aria-busy="true" aria-live="polite" className="min-h-full">
			<div className="px-6 py-5">
				<div className="grid gap-5">
					<div className="divide-y divide-[color:var(--dashboardy-divider)]">
						{sessionLoadingCapabilityRows.map((row) => (
							<div
								key={row.id}
								className="grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-4 py-2"
							>
								<Skeleton
									className={cn(
										"h-4 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]",
										row.labelWidth,
									)}
								/>
								<div className="flex justify-end">
									<Skeleton
										className={cn(
											"h-5 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]",
											row.tagWidth,
										)}
									/>
								</div>
							</div>
						))}
					</div>

					<div className="grid gap-3.5">
						<Skeleton className="h-20 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
						<Skeleton className="h-24 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
						<Skeleton className="h-20 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
					</div>
				</div>
			</div>
		</div>
	);
}

function SessionDetailStateMessage({
	description,
	title,
}: {
	description: string | undefined;
	title: string;
}) {
	return (
		<div className="flex h-full items-center justify-center px-6 py-12">
			<div className="dashboardy-card rounded-[1.5rem] border px-8 py-10 text-center shadow-none">
				<p className="mb-2 text-lg font-semibold text-[color:var(--dashboardy-heading)]">
					{title}
				</p>
				{description ? (
					<p className="text-sm text-[color:var(--dashboardy-muted)]">
						{description}
					</p>
				) : null}
			</div>
		</div>
	);
}

function SessionDetailLoadedContent({
	userImageUrl,
	viewModel,
}: {
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const {
		safeContent,
		safeModelUsed,
		safeSkills,
		safeSlashCommands,
		safeUserDisplayName,
		subagentSummaries,
	} = viewModel;
	const capabilityRows: SessionCapabilityRow[] = [
		{
			id: "skills",
			items: [...new Set(safeSkills)].map((skill) => ({
				id: skill,
				label: skill,
				type: "label",
			})),
			label: "Skills",
		},
		{
			id: "commands",
			items: [...new Set(safeSlashCommands)].map((command) =>
				command.startsWith("/")
					? { id: command, label: command, type: "label" }
					: { id: command, label: `/${command}`, type: "label" },
			),
			label: "Slash commands",
		},
		{
			id: "subagents",
			items: subagentSummaries.map((subagent, index) => ({
				id: subagent.id,
				model: subagent.model,
				number: index + 1,
				totalTokens: subagent.totalTokens,
				type: "subagent",
			})),
			label: "Subagents",
		},
	];

	return (
		<div className="px-6 py-5">
			<div className="grid gap-5">
				<SessionCapabilitiesTable rows={capabilityRows} />

				<ConversationView
					content={safeContent}
					userLabel={safeUserDisplayName}
					userImageUrl={userImageUrl}
					agentLabel={
						safeModelUsed ? formatModelDisplayLabel(safeModelUsed) : undefined
					}
					agentModel={safeModelUsed}
				/>
			</div>
		</div>
	);
}

export function SessionDetailView({
	sessionId,
	trackView = true,
	navigation,
	onClose,
}: SessionDetailViewProps) {
	const headerRef = useRef<HTMLElement>(null);
	const transcriptScrollRef = useRef<HTMLDivElement>(null);
	const { userMap, avatarMap } = useUserMap();
	const {
		data: session,
		error,
		isLoading,
	} = useQuery({
		...orpc.analytics.sessions.detail.queryOptions({
			input: { sessionId },
		}),
		enabled: sessionId.length > 0,
	});

	useTrackProductPageView({
		isLoading: trackView ? isLoading : true,
		isError: trackView ? Boolean(error) : false,
		hasData: Boolean(session),
	});

	const viewModel = session
		? buildSessionDetailViewModel(session, userMap)
		: undefined;

	useMountEffect(() => {
		const header = headerRef.current;
		if (!header) {
			return;
		}

		const handleHeaderWheel = (event: WheelEvent) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const transcriptScroll = transcriptScrollRef.current;
			if (transcriptScroll) {
				transcriptScroll.scrollTop += event.deltaY;
			}
		};

		header.addEventListener("wheel", handleHeaderWheel, { passive: false });

		return () => {
			header.removeEventListener("wheel", handleHeaderWheel);
		};
	});

	return (
		<SessionDetailErrorBoundary>
			<div className="dashboardy-page flex h-full min-h-0 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]">
				<DashboardHeader
					ref={headerRef}
					showDivider={false}
					className="gap-4 overflow-hidden pr-6 [--dashboard-header-inset:1px] [padding-left:calc((var(--dashboard-01-header-height)-var(--dashboard-header-inset)-2.375rem)/2)]"
				>
					<div className="flex shrink-0 items-center gap-1.5 [--session-controls-inner-radius:var(--radius-2xl)]">
						{onClose ? (
							<button
								type="button"
								aria-label="Close session details"
								className={sessionNavButtonClassName}
								onClick={onClose}
							>
								<X className="size-4" />
								<span
									className={sessionNavTouchTargetClassName}
									aria-hidden="true"
								/>
							</button>
						) : null}
						<SessionDetailNavButtons navigation={navigation} />
						<SessionInfoPopover
							gitSha={viewModel?.safeGitSha ?? null}
							metadataBadges={viewModel?.metadataBadges ?? []}
							sessionId={viewModel?.safeSessionId ?? sessionId}
						/>
					</div>
					<div className="flex min-w-0 flex-1 justify-end overflow-hidden">
						{isLoading ? <SessionMetricsSkeleton /> : null}
						{!isLoading && viewModel ? (
							<SessionMetrics avatarMap={avatarMap} viewModel={viewModel} />
						) : null}
					</div>
				</DashboardHeader>

				<div
					ref={transcriptScrollRef}
					className="min-h-0 flex-1 overflow-y-auto overscroll-none"
				>
					{isLoading ? <SessionDetailContentLoadingView /> : null}
					{!isLoading && isForbiddenError(error) ? (
						<SessionDetailStateMessage
							description="You can only view your own session transcripts."
							title="Access Denied"
						/>
					) : null}
					{!isLoading && !isForbiddenError(error) && viewModel ? (
						<SessionDetailLoadedContent
							key={viewModel.safeSessionId}
							userImageUrl={avatarMap[viewModel.safeUserId]}
							viewModel={viewModel}
						/>
					) : null}
					{!isLoading && !isForbiddenError(error) && !viewModel ? (
						<SessionDetailStateMessage
							description={undefined}
							title="Session Not Found"
						/>
					) : null}
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
