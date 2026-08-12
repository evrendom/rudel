import {
	ChevronDown,
	ChevronUp,
	CircleDollarSign,
	Clock3,
	Gauge,
	Info,
	type LucideIcon,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { Skeleton } from "@/app/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import type { SessionNavigation } from "@/features/sessions/session-navigation";
import { formatRoundedDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionInteractionCounts } from "./session-interaction-counts";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

type SessionDetailHeaderProps = {
	avatarMap: Record<string, string>;
	headerRef: (element: HTMLElement | null) => void;
	hideMetrics: boolean;
	isLoading: boolean;
	navigation: SessionNavigation;
	onReturn: () => void;
	portalHost: HTMLElement | null;
	position: number | undefined;
	sessionId: string;
	totalSessions: number;
	viewModel: SessionDetailViewModel | undefined;
};

const sessionInfoButtonClassName =
	"dashboardy-action-button relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-heading)] shadow-none outline-none hover:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:outline-none focus-visible:ring-0";

const sessionInfoTouchTargetClassName =
	"absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden";

const sessionHeaderNavigationButtonClassName =
	"group relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-muted)] outline-none transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)] hover:text-[color:var(--dashboardy-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[color:var(--dashboardy-muted)]";

const sessionHeaderCloseButtonClassName =
	"group relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[color:var(--dashboardy-muted)] outline-none transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)] hover:text-[color:var(--dashboardy-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)]";

const sessionMetricsGroupClassName =
	"flex w-fit min-w-0 max-w-full items-center divide-x divide-[color:var(--dashboardy-divider)] overflow-x-auto";

const sessionMetricItemClassName =
	"flex shrink-0 items-start gap-2 px-3 first:pl-0 last:pr-0";

const sessionIdentitySkeletonClassName = "flex shrink-0 items-start gap-2";

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

function SessionHeaderNavigationButton({
	className = sessionHeaderNavigationButtonClassName,
	disabled = false,
	icon,
	label,
	onClick,
}: {
	className?: string;
	disabled?: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			className={className}
			disabled={disabled}
			onClick={onClick}
		>
			{icon}
			<span aria-hidden="true" className={sessionInfoTouchTargetClassName} />
		</button>
	);
}

function SessionRecordNavigation({
	navigation,
	onReturn,
	position,
	totalSessions,
}: {
	navigation: SessionNavigation;
	onReturn: () => void;
	position: number | undefined;
	totalSessions: number;
}) {
	const positionLabel =
		position === undefined || totalSessions === 0
			? "Session in All Sessions"
			: `${position} of ${totalSessions} in All Sessions`;

	return (
		<nav
			aria-label="Session navigation"
			className="flex min-h-12 min-w-0 items-center gap-3 sm:min-h-0"
		>
			<SessionHeaderNavigationButton
				className={sessionHeaderCloseButtonClassName}
				icon={
					<X
						aria-hidden="true"
						className="size-3.5 shrink-0 transition-transform duration-150 group-active:scale-90 motion-reduce:transition-none"
						strokeWidth={1.75}
					/>
				}
				label="Close session"
				onClick={onReturn}
			/>
			<div className="flex shrink-0 items-center gap-1">
				<SessionHeaderNavigationButton
					disabled={!navigation.hasPreviousSession}
					icon={
						<ChevronUp
							aria-hidden="true"
							className="size-3.5 shrink-0 transition-transform duration-150 group-hover:-translate-y-px group-active:translate-y-0 group-disabled:translate-y-0 motion-reduce:transition-none"
							strokeWidth={1.75}
						/>
					}
					label="Previous session"
					onClick={navigation.onPreviousSession}
				/>
				<SessionHeaderNavigationButton
					disabled={!navigation.hasNextSession}
					icon={
						<ChevronDown
							aria-hidden="true"
							className="size-3.5 shrink-0 transition-transform duration-150 group-hover:translate-y-px group-active:translate-y-0 group-disabled:translate-y-0 motion-reduce:transition-none"
							strokeWidth={1.75}
						/>
					}
					label="Next session"
					onClick={navigation.onNextSession}
				/>
			</div>
			<p
				aria-live="polite"
				className="min-w-0 truncate text-base font-medium whitespace-nowrap text-[color:var(--dashboardy-muted)] tabular-nums sm:text-sm"
				title={positionLabel}
			>
				{positionLabel}
			</p>
		</nav>
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
			<SessionInteractionCounts
				className={cn(sessionMetricItemClassName, "gap-3")}
				model={safeModelUsed}
				modelMessageCount={conversationSummary?.assistantMessages}
				userDisplayName={safeUserDisplayName}
				userImageUrl={avatarMap[safeUserId]}
				userMessageCount={conversationSummary?.userMessages}
			/>
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
				<div className={sessionIdentitySkeletonClassName}>
					<Skeleton className="size-4 shrink-0 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
					<Skeleton className="h-4 w-4 shrink-0 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
				</div>
				<div className={sessionIdentitySkeletonClassName}>
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
	hideMetrics,
	isLoading,
	navigation,
	onReturn,
	portalHost,
	position,
	sessionId,
	totalSessions,
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
				<SessionRecordNavigation
					navigation={navigation}
					onReturn={onReturn}
					position={position}
					totalSessions={totalSessions}
				/>
			</div>
			{hideMetrics ? null : (
				<div className="hidden min-w-0 justify-end overflow-hidden lg:flex">
					{isLoading ? <SessionMetricsSkeleton /> : null}
					{!isLoading && viewModel ? (
						<SessionMetrics avatarMap={avatarMap} viewModel={viewModel} />
					) : null}
				</div>
			)}
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
