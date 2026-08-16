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
		<div className="grid divide-y divide-[color:var(--dashboardy-border)]">
			{REPOSITORY_UPLOAD_SKELETON_KEYS.map((key) => (
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
	const repositoryRows = buildRepositoryUploadRows(projects);
	const automaticCount = repositoryRows.filter(
		(row) => row.automatedSessions > 0,
	).length;
	const sessionDataOnlyCount = repositoryRows.length - automaticCount;

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
				) : repositoryRows.length > 0 ? (
					<ul className="grid list-none divide-y divide-[color:var(--dashboardy-border)]">
						{repositoryRows.map((row) => {
							const isAutomatic = row.automatedSessions > 0;

							return (
								<li
									key={row.key}
									className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5"
								>
									<div className="flex min-w-0 items-baseline gap-2">
										<p
											className="min-w-0 truncate text-base font-medium text-[color:var(--dashboardy-heading)] @sm/repository-uploads:text-sm"
											title={row.label}
										>
											{row.label}
										</p>
										<p className="shrink-0 font-mono text-base font-semibold tabular-nums text-[color:var(--dashboardy-muted)] @sm/repository-uploads:text-sm">
											<span aria-hidden="true">
												{formatNumber(row.sessions)}
											</span>
											<span className="sr-only">
												{formatNumber(row.sessions)}{" "}
												{row.sessions === 1 ? "session" : "sessions"}
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
												dateTime={row.lastSessionAt}
												title={formatExactDateTime(row.lastSessionAt)}
											>
												{formatRelativeTime(row.lastSessionAt)}
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
