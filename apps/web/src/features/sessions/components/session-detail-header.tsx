import {
	ChevronRight,
	CircleDollarSign,
	Clock3,
	Gauge,
	Info,
	type LucideIcon,
	User,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { Skeleton } from "@/app/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { DashboardModelIdentity } from "@/features/dashboard/components/DashboardModelBadges";
import { formatRoundedDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

type SessionDetailHeaderProps = {
	avatarMap: Record<string, string>;
	headerRef: (element: HTMLElement | null) => void;
	isLoading: boolean;
	onReturn: () => void;
	portalHost: HTMLElement | null;
	sessionId: string;
	viewModel: SessionDetailViewModel | undefined;
};

const sessionInfoButtonClassName =
	"dashboardy-action-button relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-heading)] shadow-none outline-none hover:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:outline-none focus-visible:ring-0";

const sessionInfoTouchTargetClassName =
	"absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden";

const sessionMetricsGroupClassName =
	"flex w-fit min-w-0 max-w-full items-center divide-x divide-[color:var(--dashboardy-divider)] overflow-x-auto";

const sessionMetricItemClassName =
	"flex shrink-0 items-start gap-2 px-3 first:pl-0 last:pr-0";

const sessionIdentityCounterClassName = "flex shrink-0 items-start gap-2";

function SessionInfoPopover({
	gitSha,
	metadataBadges,
	sessionId,
}: {
	gitSha: string | null;
	metadataBadges: SessionDetailViewModel["metadataBadges"];
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
				<Info className="size-4 shrink-0" />
				<span className={sessionInfoTouchTargetClassName} aria-hidden="true" />
			</PopoverTrigger>
			<PopoverContent
				align="end"
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
							<dt className="text-base font-medium text-foreground sm:text-sm">
								{row.label}
							</dt>
							<dd className="min-w-0 break-words font-mono text-base text-muted-foreground sm:text-sm">
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

function getSessionIdentifier(sessionId: string) {
	return sessionId.split("-")[0]?.slice(0, 8) || sessionId.slice(0, 8);
}

function SessionPageBreadcrumb({
	onReturn,
	sessionId,
}: {
	onReturn: () => void;
	sessionId: string;
}) {
	return (
		<nav aria-label="Breadcrumb" className="min-w-0">
			<ol className="flex min-h-12 min-w-0 list-none items-center gap-2 sm:min-h-0">
				<li className="shrink-0 text-base font-medium text-balance [font-family:var(--app-font-heading)]">
					<button
						type="button"
						className="inline-flex min-h-12 items-center rounded-md text-foreground outline-none hover:text-[color:var(--dashboardy-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] sm:min-h-0"
						onClick={onReturn}
					>
						Sessions
					</button>
				</li>
				<li aria-hidden="true" className="flex shrink-0 items-center">
					<ChevronRight className="size-4 shrink-0 stroke-[color:var(--dashboardy-subtle)]" />
				</li>
				<li className="min-w-0">
					<p
						aria-current="page"
						className="truncate font-mono text-base font-medium tabular-nums text-[color:var(--dashboardy-heading)] sm:text-sm"
						title={sessionId}
					>
						Session {getSessionIdentifier(sessionId)}
					</p>
				</li>
			</ol>
		</nav>
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

export function SessionDetailHeader({
	avatarMap,
	headerRef,
	isLoading,
	onReturn,
	portalHost,
	sessionId,
	viewModel,
}: SessionDetailHeaderProps) {
	const safeSessionId = viewModel?.safeSessionId ?? sessionId;

	if (!portalHost) {
		return null;
	}

	return createPortal(
		<div
			ref={headerRef}
			className="dashboardy-page flex min-w-0 flex-1 items-center gap-4 overflow-hidden"
		>
			<div className="min-w-0 flex-1">
				<SessionPageBreadcrumb onReturn={onReturn} sessionId={safeSessionId} />
			</div>
			<div className="hidden min-w-0 justify-end overflow-hidden lg:flex">
				{isLoading ? <SessionMetricsSkeleton /> : null}
				{!isLoading && viewModel ? (
					<SessionMetrics avatarMap={avatarMap} viewModel={viewModel} />
				) : null}
			</div>
			<div className="flex shrink-0 items-center">
				<SessionInfoPopover
					gitSha={viewModel?.safeGitSha ?? null}
					metadataBadges={viewModel?.metadataBadges ?? []}
					sessionId={safeSessionId}
				/>
			</div>
		</div>,
		portalHost,
	);
}
