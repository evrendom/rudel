import {
	ChevronDown,
	ChevronUp,
	CircleDollarSign,
	Clock3,
	Gauge,
	type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
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
	portalHost: HTMLElement | null;
	position: number | undefined;
	sessionId: string;
	totalSessions: number;
	viewModel: SessionDetailViewModel | undefined;
};

const sessionInfoTouchTargetClassName =
	"absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden";

const sessionHeaderNavigationButtonClassName =
	"group relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-muted)] outline-none transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)] hover:text-[color:var(--dashboardy-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[color:var(--dashboardy-muted)]";

const sessionMetricsGroupClassName =
	"flex w-fit min-w-0 max-w-full items-center divide-x divide-[color:var(--dashboardy-divider)] overflow-x-auto";

const sessionMetricItemClassName =
	"flex shrink-0 items-start gap-2 px-3 first:pl-0 last:pr-0";

const sessionIdentitySkeletonClassName = "flex shrink-0 items-start gap-2";

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

function getRepositoryLabel(viewModel: SessionDetailViewModel | undefined) {
	if (viewModel?.safeRepository) {
		return viewModel.safeRepository;
	}
	if (!viewModel?.safeProjectPath) {
		return "Unknown repository";
	}
	return (
		viewModel.safeProjectPath.replaceAll("\\", "/").split("/").at(-1) ??
		viewModel.safeProjectPath
	);
}

function SessionIdentityBreadcrumb({
	isLoading,
	sessionId,
	viewModel,
}: {
	isLoading: boolean;
	sessionId: string;
	viewModel: SessionDetailViewModel | undefined;
}) {
	if (isLoading && !viewModel) {
		return (
			<nav aria-label="Session breadcrumb" className="min-w-0 flex-1">
				<ol className="flex min-w-0 items-center gap-2 overflow-hidden">
					{["repo", "branch", "commit", "session"].map((item, index) => (
						<li key={item} className="flex shrink-0 items-center gap-2">
							<Skeleton className="h-4 w-20 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
							{index < 3 ? (
								<span
									aria-hidden="true"
									className="font-[450] text-[color:var(--dashboardy-subtle)]"
								>
									›
								</span>
							) : null}
						</li>
					))}
				</ol>
			</nav>
		);
	}

	const items = [
		{ label: "Repo", value: getRepositoryLabel(viewModel) },
		{ label: "Branch", value: viewModel?.safeGitBranch ?? "No branch" },
		{
			label: "Commit",
			mono: true,
			title: viewModel?.safeGitSha ?? "No commit",
			value: viewModel?.safeGitSha?.slice(0, 8) ?? "No commit",
		},
		{
			label: "Session",
			mono: true,
			title: viewModel?.safeSessionId ?? sessionId,
			value: viewModel?.safeSessionId ?? sessionId,
		},
	];

	return (
		<nav
			aria-label="Session breadcrumb"
			className="min-w-0 flex-1 overflow-hidden"
		>
			<ol className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain whitespace-nowrap">
				{items.map((item, index) => (
					<li
						key={item.label}
						className="flex min-w-0 shrink-0 items-center gap-2 text-[0.8125rem]/5 font-[450] tracking-normal text-[color:var(--dashboardy-heading)]"
						title={`${item.label}: ${item.title ?? item.value}`}
					>
						<span
							className={cn(
								"max-w-80 truncate",
								item.mono && "font-mono tabular-nums",
							)}
						>
							{item.value}
						</span>
						{index < items.length - 1 ? (
							<span
								aria-hidden="true"
								className="shrink-0 text-[color:var(--dashboardy-subtle)]"
							>
								›
							</span>
						) : null}
					</li>
				))}
			</ol>
		</nav>
	);
}

function SessionRecordNavigation({
	navigation,
	position,
	totalSessions,
}: {
	navigation: SessionNavigation;
	position: number | undefined;
	totalSessions: number;
}) {
	const positionTitle =
		position === undefined || totalSessions === 0
			? "Session in All Sessions"
			: `${position} of ${totalSessions} in All Sessions`;
	const positionLabel =
		position === undefined || totalSessions === 0
			? "— / —"
			: `${position} / ${totalSessions}`;

	return (
		<nav
			aria-label="Session navigation"
			className="flex min-w-0 shrink-0 items-center gap-2.5"
		>
			<p
				aria-live="polite"
				className="min-w-0 truncate whitespace-nowrap text-[0.6875rem]/4 font-[450] text-[color:var(--dashboardy-muted)] tabular-nums"
				title={positionTitle}
			>
				{positionLabel}
			</p>
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
	portalHost,
	position,
	sessionId,
	totalSessions,
	viewModel,
}: SessionDetailHeaderProps) {
	if (!portalHost) {
		return null;
	}

	return createPortal(
		<div
			ref={headerRef}
			className="dashboardy-page flex min-w-0 flex-1 items-center gap-6 overflow-hidden"
		>
			<SessionIdentityBreadcrumb
				isLoading={isLoading}
				sessionId={sessionId}
				viewModel={viewModel}
			/>
			{hideMetrics ? null : (
				<div className="hidden min-w-0 justify-end overflow-hidden lg:flex">
					{isLoading ? <SessionMetricsSkeleton /> : null}
					{!isLoading && viewModel ? (
						<SessionMetrics avatarMap={avatarMap} viewModel={viewModel} />
					) : null}
				</div>
			)}
			<SessionRecordNavigation
				navigation={navigation}
				position={position}
				totalSessions={totalSessions}
			/>
		</div>,
		portalHost,
	);
}
