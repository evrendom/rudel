import { type ProjectInvestment, resolveRepoIdentity } from "@rudel/api-routes";
import { Skeleton } from "@/app/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { formatExactDateTime, formatRelativeTime } from "@/lib/time-utils";

type RepositoryUploadRow = {
	automatedSessions: number;
	key: string;
	label: string;
	lastSessionAt: string;
	sessions: number;
};

const REPOSITORY_UPLOAD_SKELETON_KEYS: readonly string[] = [
	"repository-upload-skeleton-a",
	"repository-upload-skeleton-b",
	"repository-upload-skeleton-c",
	"repository-upload-skeleton-d",
	"repository-upload-skeleton-e",
];

function buildRepositoryUploadRows(
	projects: readonly ProjectInvestment[],
): RepositoryUploadRow[] {
	const rowsByRepository = new Map<string, RepositoryUploadRow>();

	for (const project of projects) {
		const projectPath = project.project_path.trim();
		const storedRepository = project.repository?.trim() || null;
		const identity = resolveRepoIdentity({
			gitRemote: project.git_remote?.trim() || null,
			packageName:
				storedRepository && storedRepository !== projectPath
					? storedRepository
					: null,
			projectPath,
		});
		const existingRow = rowsByRepository.get(identity.repoKey);

		rowsByRepository.set(identity.repoKey, {
			automatedSessions:
				(existingRow?.automatedSessions ?? 0) + project.automated_sessions,
			key: identity.repoKey,
			label: identity.repoLabel,
			lastSessionAt:
				existingRow && existingRow.lastSessionAt > project.last_session_at
					? existingRow.lastSessionAt
					: project.last_session_at,
			sessions: (existingRow?.sessions ?? 0) + project.sessions,
		});
	}

	return [...rowsByRepository.values()].sort(
		(left, right) =>
			right.automatedSessions - left.automatedSessions ||
			right.sessions - left.sessions ||
			left.label.localeCompare(right.label),
	);
}

function RepositoryUploadStatusSkeleton() {
	return (
		<div className="grid">
			{REPOSITORY_UPLOAD_SKELETON_KEYS.map((key) => (
				<div key={key} className="px-4 py-2.5">
					<div className="flex min-h-8 items-center justify-between gap-3">
						<div className="flex min-w-0 flex-1 items-center gap-1.5">
							<Skeleton className="h-3.5 w-28 max-w-full rounded" />
							<Skeleton className="h-3 w-6 shrink-0 rounded" />
						</div>
						<div className="flex w-32 shrink-0 items-center justify-end gap-2">
							<Skeleton className="h-3 w-12 rounded" />
							<Skeleton className="h-3 w-12 rounded" />
						</div>
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
	const repositoryRows = buildRepositoryUploadRows(projects);
	const automaticCount = repositoryRows.filter(
		(row) => row.automatedSessions > 0,
	).length;
	const sessionDataOnlyCount = repositoryRows.length - automaticCount;

	return (
		<aside className="@container/repository-uploads flex min-h-[32rem] min-w-0 flex-col overflow-hidden border-t border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface-opaque)] @5xl/dashboard-page:h-full @5xl/dashboard-page:min-h-0 @5xl/dashboard-page:border-l @5xl/dashboard-page:border-t-0">
			<header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--dashboardy-border)] px-4 py-2.5">
				<h2 className="min-w-0 truncate text-[0.8125rem] font-[500] tracking-[-0.01em] text-[color:var(--dashboardy-heading)] [font-family:var(--app-font-heading)]">
					Repo uploads
				</h2>
				<p className="flex shrink-0 items-center gap-1.5 text-[0.75rem]/4 font-[450] tracking-[-0.01em] text-[color:var(--dashboardy-muted)]">
					<span className="font-mono font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
						{isPending ? "—" : formatNumber(automaticCount)}
					</span>{" "}
					auto
					<span aria-hidden="true">·</span>
					<span className="font-mono font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
						{isPending ? "—" : formatNumber(sessionDataOnlyCount)}
					</span>{" "}
					manual
				</p>
			</header>

			<div className="min-h-0 flex-1 overflow-hidden">
				{isPending ? (
					<RepositoryUploadStatusSkeleton />
				) : repositoryRows.length > 0 ? (
					<ul className="flex h-full min-h-0 list-none flex-col">
						{repositoryRows.map((row) => {
							const isAutomatic = row.automatedSessions > 0;

							return (
								<li
									key={row.key}
									className="flex h-10 min-h-0 shrink items-center justify-between gap-3 overflow-hidden px-4"
								>
									<div className="flex min-w-0 flex-1 items-baseline gap-1.5">
										<p
											className="min-w-0 flex-1 truncate text-[0.8125rem]/5 font-[450] tracking-[-0.01em] text-[color:var(--dashboardy-heading)]"
											title={row.label}
										>
											{row.label}
										</p>
										<p className="shrink-0 font-mono text-[0.75rem]/4 font-medium tabular-nums text-[color:var(--dashboardy-muted)]">
											<span aria-hidden="true">
												{formatNumber(row.sessions)}
											</span>
											<span className="sr-only">
												{formatNumber(row.sessions)}{" "}
												{row.sessions === 1 ? "session" : "sessions"}
											</span>
										</p>
									</div>
									<div className="flex w-32 shrink-0 items-center justify-end gap-2 overflow-hidden">
										<p className="min-w-0 flex-1 truncate text-right text-[0.75rem]/4 tracking-[-0.01em] tabular-nums text-[color:var(--dashboardy-muted)]">
											<span className="sr-only">Last upload </span>
											<time
												dateTime={row.lastSessionAt}
												title={formatExactDateTime(row.lastSessionAt)}
											>
												{formatRelativeTime(row.lastSessionAt)}
											</time>
										</p>
										<p
											className={
												isAutomatic
													? "flex w-16 shrink-0 items-center justify-end gap-1.5 text-[0.6875rem]/4 font-semibold tracking-[0.04em] text-[color:var(--dashboardy-success-foreground)]"
													: "flex w-16 shrink-0 items-center justify-end gap-1.5 text-[0.6875rem]/4 font-semibold tracking-[0.04em] text-[color:var(--dashboardy-warning-foreground)]"
											}
										>
											<span
												className={
													isAutomatic
														? "size-1.5 shrink-0 rounded-full bg-[color:var(--dashboardy-success-foreground)]"
														: "size-1.5 shrink-0 rounded-full bg-[color:var(--dashboardy-warning-foreground)]"
												}
												aria-hidden="true"
											/>
											<span className="sr-only">
												{isAutomatic ? "Automatic" : "Manual"} upload
											</span>
											<span aria-hidden="true">
												{isAutomatic ? "AUTO" : "MANUAL"}
											</span>
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<div className="flex h-full min-h-0 items-center justify-center px-4">
						<div className="flex max-w-xs flex-col gap-1 text-center">
							<p className="text-[0.8125rem]/5 font-[500] tracking-[-0.01em] text-[color:var(--dashboardy-heading)]">
								No repositories yet
							</p>
							<p className="text-[0.75rem]/4 tracking-[-0.01em] text-pretty text-[color:var(--dashboardy-muted)]">
								Repositories appear here after their first session upload.
							</p>
						</div>
					</div>
				)}
			</div>
		</aside>
	);
}
