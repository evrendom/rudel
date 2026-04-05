import { AlertCircleIcon } from "lucide-react";
import { TeamRosterGallery } from "@/features/team/components/TeamRosterGallery";
import {
	type TeamPageDiagnostics,
	useTeamPageData,
} from "@/features/team/use-team-page-data";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";

function TeamPageSkeleton() {
	return (
		<div className="grid gap-y-4 sm:grid-cols-2 sm:gap-x-5 2xl:grid-cols-3 2xl:gap-x-4">
			{Array.from({ length: 3 }, (_, index) => (
				<Card key={index} size="sm" className="h-[358px] p-0 shadow-none ring-1 ring-border/60">
					<CardContent className="flex h-full flex-col gap-4 px-[14px] pt-[15px] pb-[10px]">
						<div className="flex items-center justify-between">
							<Skeleton className="h-8 w-20 rounded-md" />
							<Skeleton className="h-6 w-24 rounded-md" />
						</div>
						<Skeleton className="h-[158px] rounded-[14px]" />
						<div className="flex flex-col items-center gap-3 py-2">
							<Skeleton className="h-8 w-36 rounded-md" />
							<Skeleton className="h-7 w-28 rounded-md" />
						</div>
						<Skeleton className="mt-auto h-[75px] rounded-[14px]" />
					</CardContent>
				</Card>
			))}
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
		<Card size="sm" className="mx-auto max-w-2xl bg-card/95 shadow-none ring-1 ring-border/60">
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
				<Card size="sm" className="bg-muted/20 shadow-none ring-1 ring-border/60">
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
		<Card size="sm" className="mx-auto max-w-xl bg-card/95 shadow-none ring-1 ring-border/60">
			<CardContent className="px-6 py-10 text-center">
				<h2 className="text-base font-semibold text-foreground">
					No team activity in this range
				</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					Try expanding the date range to pull in more developers.
				</p>
			</CardContent>
		</Card>
	);
}

export function TeamPage() {
	const {
		diagnostics,
		error,
		isError,
		isPending,
		teamPlayers,
		refetch,
		teamCards,
	} = useTeamPageData();

	let content = (
		<div className="flex justify-center">
			<TeamRosterGallery players={teamPlayers} />
		</div>
	);

	if (isPending) {
		content = <TeamPageSkeleton />;
	} else if (isError) {
		content = <TeamPageError diagnostics={diagnostics} error={error} onRetry={refetch} />;
	} else if (teamPlayers.length === 0 && (teamCards?.length ?? 0) === 0) {
		content = <TeamPageEmpty />;
	}

	return (
		<>
			<div className="px-4 lg:px-6">
				<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
					<CardHeader>
						<CardTitle>Team</CardTitle>
						<CardDescription>
							Browse the roster cards in a dedicated view.
						</CardDescription>
						<div className="pt-1">
							<Badge variant="outline">Roster</Badge>
						</div>
					</CardHeader>
				</Card>
			</div>

			<div className="px-4 lg:px-6">{content}</div>
		</>
	);
}
