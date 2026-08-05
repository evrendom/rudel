import type {
	HistoricalSkillDetail,
	HistoricalSkillVersion,
} from "@rudel/api-routes";
import { CircleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/app/ui/sheet";
import { Skeleton } from "@/app/ui/skeleton";
import { MarkdownContent } from "@/components/MarkdownContent";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { formatFullDateLabel } from "@/lib/format";
import { orpc } from "@/lib/orpc";

export function HistoricalSkillDetailSheet({
	skillName,
	onOpenChange,
}: {
	skillName: string | null;
	onOpenChange: (open: boolean) => void;
}) {
	const detailQuery = useAnalyticsQuery({
		...orpc.analytics.skills.detail.queryOptions({
			input: { name: skillName ?? "" },
		}),
		enabled: skillName !== null,
	});

	return (
		<Sheet open={skillName !== null} onOpenChange={onOpenChange}>
			<SheetContent
				className="dashboardy-page max-w-none overflow-hidden border-0 bg-[color:var(--dashboardy-surface)] p-0 text-[color:var(--dashboardy-heading)] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.22)] data-[side=right]:w-full data-[side=right]:border-0 data-[side=right]:sm:w-[42rem] data-[side=right]:sm:max-w-[42rem] data-[side=right]:md:inset-y-[var(--dashboard-01-window-inset)] data-[side=right]:md:right-[var(--dashboard-01-window-inset)] data-[side=right]:md:h-auto data-[side=right]:md:rounded-[var(--dashboard-01-window-radius)]"
				overlayClassName="backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"
			>
				<SheetHeader className="border-b border-[color:var(--dashboardy-border)] px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-16">
					<SheetTitle className="break-words text-lg">
						{skillName ?? "Skill details"}
					</SheetTitle>
					<SheetDescription className="text-base sm:text-sm">
						Historical content recovered from Codex sessions.
					</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
					<HistoricalSkillDetailContent
						detail={detailQuery.data}
						isError={detailQuery.isError}
						isPending={detailQuery.isPending}
						onRetry={() => {
							void detailQuery.refetch();
						}}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}

export function HistoricalSkillDetailContent({
	detail,
	isError,
	isPending,
	onRetry,
}: {
	detail: HistoricalSkillDetail | undefined;
	isError: boolean;
	isPending: boolean;
	onRetry: () => void;
}) {
	const [selectedVersionHash, setSelectedVersionHash] = useState<string | null>(
		null,
	);

	if (isPending) {
		return <SkillDetailSkeleton />;
	}

	if (isError || !detail) {
		return (
			<div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
				<CircleAlertIcon
					aria-hidden="true"
					className="size-5 text-[color:var(--dashboardy-muted)]"
				/>
				<div className="flex max-w-sm flex-col gap-1">
					<h3 className="text-base font-medium">Skill details couldn’t load</h3>
					<p className="text-base leading-7 text-[color:var(--dashboardy-muted)] sm:text-sm sm:leading-6">
						Try loading the recovered content again.
					</p>
				</div>
				<Button type="button" variant="outline" onClick={onRetry}>
					Try again
				</Button>
			</div>
		);
	}

	const selectedVersion =
		detail.versions.find(
			(version) => version.contentSha256 === selectedVersionHash,
		) ?? detail.versions[0];

	return (
		<div className="flex min-w-0 flex-col gap-6">
			<div className="flex flex-col gap-1 text-base text-[color:var(--dashboardy-muted)] sm:text-sm">
				<p>{formatSessionCount(detail.sessionCount)}</p>
				<p>
					{detail.versions.length}{" "}
					{detail.versions.length === 1
						? "content version"
						: "content versions"}{" "}
					recovered
				</p>
			</div>

			{detail.unavailableSessionCount > 0 ? (
				<UnavailableContentNotice count={detail.unavailableSessionCount} />
			) : null}

			{selectedVersion ? (
				<>
					{detail.versions.length > 1 ? (
						<div className="flex min-w-0 flex-col gap-2">
							<label
								htmlFor="historical-skill-version"
								className="text-base font-medium sm:text-sm"
							>
								Version
							</label>
							<Select
								value={selectedVersion.contentSha256}
								onValueChange={setSelectedVersionHash}
							>
								<SelectTrigger
									id="historical-skill-version"
									className="h-11 w-full max-w-full rounded-xl border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="start">
									{detail.versions.map((version, index) => (
										<SelectItem
											key={version.contentSha256}
											value={version.contentSha256}
										>
											{formatVersionLabel(
												version,
												index,
												detail.versions.length,
											)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}

					<div className="flex min-w-0 flex-col gap-4">
						<div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[color:var(--dashboardy-border)] pb-4 text-base text-[color:var(--dashboardy-muted)] sm:text-sm">
							<span>{formatSessionCount(selectedVersion.sessionCount)}</span>
							<span>
								First used {formatFullDateLabel(selectedVersion.firstUsedAt)}
							</span>
							<span>
								Last used {formatFullDateLabel(selectedVersion.lastUsedAt)}
							</span>
						</div>
						<MarkdownContent
							content={selectedVersion.content}
							className="min-w-0 break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto"
						/>
					</div>
				</>
			) : (
				<div className="border-y border-[color:var(--dashboardy-border)] py-10 text-center">
					<h3 className="text-base font-medium">
						No complete content was recovered
					</h3>
					<p className="mx-auto mt-1 max-w-md text-base leading-7 text-[color:var(--dashboardy-muted)] sm:text-sm sm:leading-6">
						The skill remains in this list because Codex recorded its use, but
						none of the historical reads proved that the full SKILL.md was
						returned.
					</p>
				</div>
			)}
		</div>
	);
}

function UnavailableContentNotice({ count }: { count: number }) {
	return (
		<div className="flex gap-3 border-y border-[color:var(--dashboardy-border)] py-4 text-base leading-7 sm:text-sm sm:leading-6">
			<CircleAlertIcon
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0 text-[color:var(--dashboardy-muted)]"
			/>
			<p>
				A provably complete SKILL.md couldn’t be recovered from {count}{" "}
				{count === 1 ? "session" : "sessions"}. Those sessions remain in the
				usage total, but their content isn’t shown.
			</p>
		</div>
	);
}

function SkillDetailSkeleton() {
	return (
		<div aria-busy="true" className="space-y-5">
			<output className="sr-only">Loading skill details</output>
			<div className="space-y-2">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="h-4 w-44" />
			</div>
			<Skeleton className="h-11 w-full" />
			<div className="space-y-3 border-t border-[color:var(--dashboardy-border)] pt-5">
				<Skeleton className="h-6 w-52" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-[88%]" />
				<Skeleton className="h-4 w-[72%]" />
			</div>
		</div>
	);
}

function formatVersionLabel(
	version: HistoricalSkillVersion,
	index: number,
	versionCount: number,
): string {
	const ordinal = versionCount - index;
	return `Version ${ordinal} · ${formatSessionCount(version.sessionCount)} · Last used ${formatFullDateLabel(version.lastUsedAt)}`;
}

function formatSessionCount(sessionCount: number): string {
	return `Used in ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`;
}
