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
import { TeamMembersCardGrid } from "@/features/team/components/TeamMembersCardGrid";
import {
	type TeamPageDiagnostics,
	useTeamPageData,
} from "@/features/team/use-team-page-data";

const teamBoardCardSkeletonKeys = [
	"card-alpha",
	"card-bravo",
	"card-charlie",
	"card-delta",
	"card-echo",
	"card-foxtrot",
] as const;

const teamBoardMetricSkeletonKeys = [
	"sessions",
	"days",
	"avg",
	"last",
	"cost",
	"in-out",
] as const;

function TeamPageSkeleton() {
	return (
		<div className="team-lineup-surface-scope">
			<ul className="grid justify-center gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(233px,233px))]">
				{teamBoardCardSkeletonKeys.map((cardKey) => (
					<li key={cardKey} className="list-none">
						<div className="team-lineup-featured-card relative isolate flex h-[358px] w-[233px] flex-col overflow-hidden rounded-[18px] border border-[#ECECEC] bg-[linear-gradient(180deg,#fbfcfe_0%,#f0f3f7_100%)] px-[14px] pt-[15px] pb-[10px] shadow-[0_0_10.1px_rgba(0,0,0,0.08)]">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-[6px]">
									<Skeleton className="h-[17px] w-[56px] rounded-full" />
									<Skeleton className="h-[10px] w-[34px] rounded-full" />
								</div>
								<Skeleton className="h-[12px] w-[52px] rounded-full" />
							</div>

							<div className="mt-[12px] h-[158px] w-full rounded-[14px] border border-black/8 bg-white/86 p-[10px]">
								<div className="relative h-full w-full overflow-hidden rounded-[10px] bg-muted/50">
									<Skeleton className="h-full w-full rounded-[10px]" />
									<Skeleton className="absolute right-[10px] bottom-[10px] h-[22px] w-[88px] rounded-full" />
								</div>
							</div>

							<div className="mt-[16px] px-[3px] text-center">
								<div className="flex justify-center">
									<Skeleton className="h-[19px] w-[124px] rounded-full" />
								</div>
								<div className="mt-[8px] flex justify-center">
									<Skeleton className="h-[16px] w-[132px] rounded-full" />
								</div>
							</div>

							<div className="mt-auto grid grid-cols-3 gap-[6px]">
								{teamBoardMetricSkeletonKeys.map((metricKey) => (
									<div
										key={`${cardKey}-${metricKey}`}
										className="rounded-[10px] border border-black/8 bg-white/74 px-[8px] py-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
									>
										<Skeleton className="h-[11px] w-[52px] rounded-full" />
										<Skeleton className="mt-[4px] h-[8px] w-[32px] rounded-full" />
									</div>
								))}
							</div>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return "We couldn't load the team cards for this workspace.";
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
	const debugValue = getErrorDebugValue(error);
	const message = getErrorMessage(error);

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
					Add teammates to this workspace to populate the team cards.
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
		<div className="mb-4 flex justify-end">
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
		currentUserId,
		diagnostics,
		error,
		isInviteLinkPending,
		isError,
		isPending,
		teamMemberRows,
		refetch,
		teamInviteLink,
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
		<TeamMembersCardGrid
			canInviteTeamMembers={canInviteTeamMembers}
			currentUserId={currentUserId}
			isInviteLinkPending={isInviteLinkPending}
			rows={teamMemberRows}
			teamInviteLink={teamInviteLink}
		/>
	);

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
		<div className="px-4 lg:px-6">
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
