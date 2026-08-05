import type { ProjectInvestment } from "@rudel/api-routes";
import { Skeleton } from "@/app/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { formatExactDateTime, formatRelativeTime } from "@/lib/time-utils";

function getRepositoryLabel(project: ProjectInvestment) {
	return project.repository?.trim() || project.project_path.trim() || "Unknown";
}

function RepositoryUploadStatusSkeleton() {
	const skeletonKeys = [
		"repository-upload-skeleton-a",
		"repository-upload-skeleton-b",
		"repository-upload-skeleton-c",
		"repository-upload-skeleton-d",
		"repository-upload-skeleton-e",
	];

	return (
		<div className="grid divide-y divide-[color:var(--dashboardy-border)]">
			{skeletonKeys.map((key) => (
				<div key={key} className="px-4 py-3">
					<div className="flex min-h-5 items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-2">
							<Skeleton className="h-4 w-28 max-w-full rounded" />
							<Skeleton className="h-4 w-7 shrink-0 rounded" />
						</div>
						<Skeleton className="h-4 w-28 max-w-full rounded" />
					</div>
				</div>
			))}
		</div>
	);
}

export function DashboardRepositoryUploadStatus({
	isPending,
	projects,
}: {
	isPending: boolean;
	projects: ProjectInvestment[];
}) {
	const sortedProjects = [...projects].sort(
		(left, right) =>
			right.automated_sessions - left.automated_sessions ||
			right.sessions - left.sessions ||
			getRepositoryLabel(left).localeCompare(getRepositoryLabel(right)),
	);
	const automaticCount = sortedProjects.filter(
		(project) => project.automated_sessions > 0,
	).length;
	const sessionDataOnlyCount = sortedProjects.length - automaticCount;

	return (
		<aside className="@container/repository-uploads dashboardy-card flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border @5xl/dashboard-page:h-full @5xl/dashboard-page:min-h-0">
			<header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--dashboardy-border)] px-4 py-3.5">
				<h2 className="min-w-0 truncate text-base font-semibold tracking-[-0.015em] text-[color:var(--dashboardy-heading)]">
					Repo uploads
				</h2>
				<p className="flex shrink-0 items-center gap-2 text-base text-[color:var(--dashboardy-muted)] @sm/repository-uploads:text-sm">
					<span className="font-mono font-semibold tabular-nums text-[color:var(--dashboardy-heading)]">
						{isPending ? "—" : formatNumber(automaticCount)}
					</span>{" "}
					auto
					<span aria-hidden="true">·</span>
					<span className="font-mono font-semibold tabular-nums text-[color:var(--dashboardy-heading)]">
						{isPending ? "—" : formatNumber(sessionDataOnlyCount)}
					</span>{" "}
					manual
				</p>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
				{isPending ? (
					<RepositoryUploadStatusSkeleton />
				) : sortedProjects.length > 0 ? (
					<ul className="grid list-none divide-y divide-[color:var(--dashboardy-border)]">
						{sortedProjects.map((project) => {
							const isAutomatic = project.automated_sessions > 0;
							const repositoryLabel = getRepositoryLabel(project);

							return (
								<li
									key={project.git_remote || project.project_path}
									className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5"
								>
									<div className="flex min-w-0 items-baseline gap-2">
										<p
											className="min-w-0 truncate text-base font-medium text-[color:var(--dashboardy-heading)] @sm/repository-uploads:text-sm"
											title={repositoryLabel}
										>
											{repositoryLabel}
										</p>
										<p className="shrink-0 font-mono text-base font-semibold tabular-nums text-[color:var(--dashboardy-muted)] @sm/repository-uploads:text-sm">
											<span aria-hidden="true">
												{formatNumber(project.sessions)}
											</span>
											<span className="sr-only">
												{formatNumber(project.sessions)}{" "}
												{project.sessions === 1 ? "session" : "sessions"}
											</span>
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-1.5">
										<span
											className={
												isAutomatic
													? "size-1.5 shrink-0 rounded-full bg-[color:var(--dashboardy-success-foreground)]"
													: "size-1.5 shrink-0 rounded-full bg-[color:var(--dashboardy-warning-foreground)]"
											}
											aria-hidden="true"
										/>
										<p
											className={
												isAutomatic
													? "whitespace-nowrap text-base font-medium text-[color:var(--dashboardy-success-foreground)] @sm/repository-uploads:text-sm"
													: "whitespace-nowrap text-base font-medium text-[color:var(--dashboardy-warning-foreground)] @sm/repository-uploads:text-sm"
											}
										>
											<span className="sr-only">
												{isAutomatic ? "Automatic" : "Manual"} upload. Last
												upload{" "}
											</span>
											<time
												dateTime={project.last_session_at}
												title={formatExactDateTime(project.last_session_at)}
											>
												{formatRelativeTime(project.last_session_at)}
											</time>
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<div className="flex min-h-72 items-center justify-center px-5">
						<div className="max-w-xs text-center">
							<p className="text-sm font-medium text-[color:var(--dashboardy-heading)]">
								No repositories yet
							</p>
							<p className="mt-1 text-[13px] leading-5 text-[color:var(--dashboardy-muted)]">
								Repositories appear here after their first session upload.
							</p>
						</div>
					</div>
				)}
			</div>
		</aside>
	);
}
