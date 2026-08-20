import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { TeamMemberOverviewTable } from "@/features/team/components/TeamMemberOverviewTable";
import {
	type TeamPageDiagnostics,
	useTeamPageData,
} from "@/features/team/use-team-page-data";

const teamTableRowSkeletonKeys = [
	"row-alpha",
	"row-bravo",
	"row-charlie",
	"row-delta",
	"row-echo",
	"row-foxtrot",
] as const;

const teamTableHeaderSkeletons = [
	{ key: "teammate", widthClass: "w-20" },
	{ key: "models", widthClass: "w-28" },
	{ key: "activity", widthClass: "w-16" },
	{ key: "sessions", widthClass: "w-16" },
	{ key: "tokens", widthClass: "w-20" },
	{ key: "cost", widthClass: "w-16" },
	{ key: "active", widthClass: "w-20" },
] as const;

function TeamPageSkeleton() {
	return (
		<div className="-mx-4 -my-2 overflow-hidden lg:-mx-6">
			<div className="min-w-272 px-16 py-2">
				<div className="grid h-10 grid-cols-[24fr_21fr_16fr_9fr_10fr_9fr_11fr] items-center border-b border-black/10 dark:border-white/10">
					{teamTableHeaderSkeletons.map((skeleton, index) => (
						<div key={skeleton.key} className={index === 0 ? "pr-3" : "px-3"}>
							<Skeleton className={`h-3 rounded-sm ${skeleton.widthClass}`} />
						</div>
					))}
				</div>
				{teamTableRowSkeletonKeys.map((rowKey) => (
					<div
						key={rowKey}
						className="grid h-16 grid-cols-[24fr_21fr_16fr_9fr_10fr_9fr_11fr] items-center border-b border-black/5 dark:border-white/5"
					>
						<div className="flex items-center gap-3 pr-3">
							<Skeleton className="size-10 shrink-0 rounded-full" />
							<div className="grid gap-1.5">
								<Skeleton className="h-3.5 w-28 rounded-sm" />
								<Skeleton className="h-3 w-16 rounded-sm" />
							</div>
						</div>
						<div className="flex gap-1.5 px-3">
							<Skeleton className="h-6 w-20 rounded-md" />
							<Skeleton className="h-6 w-16 rounded-md" />
						</div>
						<div className="px-3">
							<Skeleton className="h-7 w-32 rounded-sm" />
						</div>
						<div className="flex justify-end px-3">
							<Skeleton className="h-3.5 w-14 rounded-sm" />
						</div>
						<div className="flex justify-end px-3">
							<Skeleton className="h-3.5 w-12 rounded-sm" />
						</div>
						<div className="flex justify-end px-3">
							<Skeleton className="h-3.5 w-12 rounded-sm" />
						</div>
						<div className="flex justify-end pl-3">
							<Skeleton className="h-3.5 w-20 rounded-sm" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return "We couldn't load the team roster for this workspace.";
}

const PRODUCTION_ERROR_MESSAGE =
	"We couldn't load the team roster for this workspace. Try again, or contact support if the problem continues.";

function getErrorRequestId(error: unknown) {
	if (
		typeof error !== "object" ||
		error === null ||
		!("data" in error) ||
		typeof error.data !== "object" ||
		error.data === null ||
		!("requestId" in error.data) ||
		typeof error.data.requestId !== "string"
	) {
		return null;
	}

	return error.data.requestId;
}

function getErrorDebugValue(error: unknown) {
	if (error instanceof Error) {
		return JSON.stringify(
			{
				name: error.name,
				message: error.message,
				stack: error.stack,
			},
			null,
			2,
		);
	}

	if (error === null || error === undefined) {
		return null;
	}

	try {
		return JSON.stringify(error, null, 2);
	} catch {
		return String(error);
	}
}

function TeamPageError({
	diagnostics,
	error,
	onRetry,
}: {
	diagnostics: TeamPageDiagnostics;
	error: unknown;
	onRetry: () => Promise<unknown>;
}) {
	const isDevelopment = import.meta.env.DEV;
	const debugValue = isDevelopment ? getErrorDebugValue(error) : null;
	const message = isDevelopment
		? getErrorMessage(error)
		: PRODUCTION_ERROR_MESSAGE;
	const requestId = getErrorRequestId(error);

	return (
		<Card
			size="sm"
			className="mx-auto max-w-2xl bg-card/95 shadow-none ring-1 ring-border/60"
		>
			<CardHeader className="gap-3">
				<div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
					<AlertCircleIcon className="size-5" />
				</div>
				<div className="flex flex-col gap-1">
					<CardTitle>Team roster unavailable</CardTitle>
					<CardDescription>{message}</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{requestId ? (
					<p className="text-sm text-muted-foreground">
						Support reference:{" "}
						<code className="font-mono text-xs text-foreground">
							{requestId}
						</code>
					</p>
				) : null}
				{isDevelopment ? (
					<Card
						size="sm"
						className="bg-muted/20 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="grid gap-2 text-sm">
							<div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
								<span className="text-muted-foreground">Endpoint</span>
								<span className="font-medium text-foreground">
									{diagnostics.endpoint}
								</span>
							</div>
							<div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
								<span className="text-muted-foreground">Workspace</span>
								<span className="font-medium text-foreground">
									{diagnostics.organizationName ?? "No active workspace"}
								</span>
							</div>
							<div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
								<span className="text-muted-foreground">Org ID</span>
								<span className="break-all font-mono text-[12px] text-foreground/80">
									{diagnostics.organizationId ?? "None"}
								</span>
							</div>
							<div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
								<span className="text-muted-foreground">Date range</span>
								<span className="font-medium text-foreground">
									{diagnostics.startDate} {"->"} {diagnostics.endDate}
								</span>
							</div>
							<div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
								<span className="text-muted-foreground">Computed days</span>
								<span className="font-medium text-foreground">
									{diagnostics.days}
									{diagnostics.requestedDays !== diagnostics.days
										? ` (query uses ${diagnostics.requestedDays})`
										: ""}
								</span>
							</div>
						</CardContent>
					</Card>
				) : null}
				<div className="flex items-center gap-3">
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							void onRetry();
						}}
					>
						Retry query
					</Button>
				</div>
				{debugValue ? (
					<details className="rounded-xl bg-muted/20 p-4 ring-1 ring-border/60">
						<summary className="cursor-pointer text-sm font-medium text-foreground">
							Raw error details
						</summary>
						<pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] bg-muted/60 p-3 font-mono text-[12px] text-foreground/85">
							{debugValue}
						</pre>
					</details>
				) : null}
			</CardContent>
		</Card>
	);
}

function TeamPageEmpty() {
	return (
		<Card
			size="sm"
			className="mx-auto max-w-xl bg-card/95 shadow-none ring-1 ring-border/60"
		>
			<CardContent className="px-6 py-10 text-center">
				<h2 className="text-base font-semibold text-foreground">
					No team members available
				</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					Add teammates to this workspace to populate the team roster.
				</p>
			</CardContent>
		</Card>
	);
}

function TeamPageRefreshButton({
	isRefreshing,
	onRefresh,
}: {
	isRefreshing: boolean;
	onRefresh: () => void;
}) {
	return (
		<div className="flex justify-end">
			<Button
				size="sm"
				variant="outline"
				disabled={isRefreshing}
				onClick={onRefresh}
			>
				<RefreshCwIcon
					data-icon="inline-start"
					className={isRefreshing ? "animate-spin" : undefined}
				/>
				{isRefreshing ? "Refreshing" : "Refresh"}
			</Button>
		</div>
	);
}

export function TeamPage() {
	const {
		canInviteTeamMembers,
		diagnostics,
		error,
		isError,
		isPending,
		teamMemberRows,
		refetch,
		teamCards,
	} = useTeamPageData();
	const [isRefreshing, setIsRefreshing] = useState(false);

	async function handleRefresh() {
		if (isRefreshing) {
			return;
		}

		setIsRefreshing(true);
		try {
			await refetch();
		} catch {
			// The query state renders the error panel; keep the button usable.
		} finally {
			setIsRefreshing(false);
		}
	}

	let content = (
		<TeamMemberOverviewTable
			canInviteTeamMembers={canInviteTeamMembers}
			organizationId={diagnostics.organizationId}
			rows={teamMemberRows}
		/>
	);
	/*
	 * Legacy agent-card overview retained for rollback:
	 * <TeamMembersCardGrid
	 *   canInviteTeamMembers={canInviteTeamMembers}
	 *   currentUserId={currentUserId}
	 *   organizationId={diagnostics.organizationId}
	 *   rows={teamMemberRows}
	 * />
	 */

	if (isPending) {
		content = <TeamPageSkeleton />;
	} else if (isError) {
		content = (
			<TeamPageError
				diagnostics={diagnostics}
				error={error}
				onRetry={refetch}
			/>
		);
	} else if (
		!canInviteTeamMembers &&
		teamMemberRows.length === 0 &&
		(teamCards?.length ?? 0) === 0
	) {
		content = <TeamPageEmpty />;
	}

	return (
		<div className="flex flex-col gap-6 px-4 lg:px-6">
			<TeamPageRefreshButton
				isRefreshing={isRefreshing}
				onRefresh={() => {
					void handleRefresh();
				}}
			/>
			{content}
		</div>
	);
}
