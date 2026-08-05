import type { HistoricalSkillSummary } from "@rudel/api-routes";
import { BookOpenIcon, SearchIcon, SearchXIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";

interface SkillsPageViewProps {
	skills: readonly HistoricalSkillSummary[] | undefined;
	isError: boolean;
	isPending: boolean;
	onRetry: () => void;
	onSelectSkill: (name: string) => void;
}

export function SkillsPageView({
	skills,
	isError,
	isPending,
	onRetry,
	onSelectSkill,
}: SkillsPageViewProps) {
	const [search, setSearch] = useState("");
	const filteredSkills = useMemo(() => {
		const query = search.trim().toLocaleLowerCase();
		if (!query) {
			return skills ?? [];
		}

		return (skills ?? []).filter((skill) =>
			skill.name.toLocaleLowerCase().includes(query),
		);
	}, [search, skills]);
	const skillCount = skills?.length ?? 0;

	return (
		<div className="dashboardy-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--dashboardy-surface-opaque)]">
			<section
				aria-labelledby="historical-skills-heading"
				className="flex min-h-0 min-w-0 flex-1 flex-col"
			>
				<div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-black/6 px-4 dark:border-white/8 sm:px-6">
					<div className="flex min-w-0 items-center gap-2">
						<BookOpenIcon
							aria-hidden="true"
							className="size-4 shrink-0 stroke-[color:var(--dashboardy-muted)]"
						/>
						<h2
							id="historical-skills-heading"
							className="truncate text-base font-medium text-[color:var(--dashboardy-heading)]"
						>
							Historical Codex skills
						</h2>
					</div>
				</div>

				<div className="@container/skills-controls flex min-h-14 shrink-0 items-center border-b border-black/6 px-4 dark:border-white/8 sm:min-h-12 sm:px-6">
					<div className="relative w-full @sm/skills-controls:max-w-xs">
						<label className="sr-only" htmlFor="skill-search">
							Search skills
						</label>
						<SearchIcon
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 stroke-[color:var(--dashboardy-muted)]"
						/>
						<input
							id="skill-search"
							name="skill-search"
							type="search"
							value={search}
							onChange={(event) => setSearch(event.currentTarget.value)}
							placeholder="Search skills"
							className="h-10 w-full min-w-0 rounded-lg border border-[color:var(--dashboardy-border-strong)] bg-[color:var(--dashboardy-surface-opaque)] py-1.5 pr-3 pl-9 text-base text-[color:var(--dashboardy-heading)] outline-none placeholder:text-[color:var(--dashboardy-subtle)] focus-visible:border-transparent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] @sm/skills-controls:h-7 @sm/skills-controls:text-sm"
						/>
					</div>
				</div>

				<SkillsListState
					filteredSkills={filteredSkills}
					hasSearch={search.trim().length > 0}
					isError={isError}
					isPending={isPending}
					skillCount={skillCount}
					onClearSearch={() => setSearch("")}
					onRetry={onRetry}
					onSelectSkill={onSelectSkill}
				/>
			</section>
		</div>
	);
}

function SkillsListState({
	filteredSkills,
	hasSearch,
	isError,
	isPending,
	skillCount,
	onClearSearch,
	onRetry,
	onSelectSkill,
}: {
	filteredSkills: readonly HistoricalSkillSummary[];
	hasSearch: boolean;
	isError: boolean;
	isPending: boolean;
	skillCount: number;
	onClearSearch: () => void;
	onRetry: () => void;
	onSelectSkill: (name: string) => void;
}) {
	if (isPending) {
		return <SkillsTableSkeleton />;
	}

	if (isError) {
		return (
			<SkillsStateMessage
				icon={<BookOpenIcon aria-hidden="true" />}
				title="Skills couldn’t be loaded"
				description="The historical Codex sessions are still available. Try loading this view again."
				action={
					<Button type="button" size="sm" variant="outline" onClick={onRetry}>
						Try again
					</Button>
				}
			/>
		);
	}

	if (skillCount === 0) {
		return (
			<SkillsStateMessage
				icon={<BookOpenIcon aria-hidden="true" />}
				title="No Codex skills yet"
				description="Skills will appear here when existing Codex sessions include a recorded skill read."
			/>
		);
	}

	return (
		<SkillsTable
			filteredSkills={filteredSkills}
			hasSearch={hasSearch}
			onClearSearch={onClearSearch}
			onSelectSkill={onSelectSkill}
		/>
	);
}

function SkillsTable({
	filteredSkills,
	hasSearch,
	onClearSearch,
	onSelectSkill,
}: {
	filteredSkills: readonly HistoricalSkillSummary[];
	hasSearch: boolean;
	onClearSearch: () => void;
	onSelectSkill: (name: string) => void;
}) {
	return (
		<div className="@container/skills-table min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
			<div className="flex min-h-full min-w-[46rem] flex-col">
				<div className="sticky top-0 z-20 grid h-10 shrink-0 grid-cols-[250px_215px_minmax(16rem,1fr)] border-b border-black/6 bg-[color:var(--dashboardy-surface-opaque)] dark:border-white/8">
					<div className="sticky left-0 z-20 flex min-w-0 items-center border-r border-black/6 bg-[color:var(--dashboardy-surface-opaque)] px-4 dark:border-white/8">
						<p className="truncate font-mono text-sm font-medium text-[color:var(--dashboardy-heading)]">
							Skill
						</p>
					</div>
					<div className="flex min-w-0 items-center border-r border-black/6 px-4 dark:border-white/8">
						<p className="truncate font-mono text-sm font-medium text-[color:var(--dashboardy-heading)]">
							Sessions
						</p>
					</div>
					<div aria-hidden="true" />
				</div>

				{filteredSkills.length > 0 ? (
					<ul
						aria-label="Historical Codex skills"
						className="flex-1 list-none divide-y divide-black/5 dark:divide-white/8"
					>
						{filteredSkills.map((skill) => (
							<li key={skill.name} className="min-w-0">
								<button
									type="button"
									onClick={() => onSelectSkill(skill.name)}
									className="group grid h-11 w-full min-w-0 grid-cols-[250px_215px_minmax(16rem,1fr)] text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] sm:h-9"
								>
									<div className="sticky left-0 z-10 flex min-w-0 items-center border-r border-black/6 bg-[color:var(--dashboardy-surface-opaque)] px-4 group-hover:bg-black/3 group-focus-visible:bg-black/3 dark:border-white/8 dark:group-hover:bg-white/4 dark:group-focus-visible:bg-white/4">
										<p
											className="min-w-0 truncate text-base font-medium text-[color:var(--dashboardy-heading)] sm:text-sm"
											title={skill.name}
										>
											{skill.name}
										</p>
									</div>
									<div className="flex min-w-0 items-center border-r border-black/6 bg-[color:var(--dashboardy-subsurface)] px-4 group-hover:bg-black/3 group-focus-visible:bg-black/3 dark:border-white/8 dark:group-hover:bg-white/4 dark:group-focus-visible:bg-white/4">
										<p className="min-w-0 truncate whitespace-nowrap font-mono text-base tabular-nums text-[color:var(--dashboardy-muted)] sm:text-sm">
											{formatSessionCount(skill.sessionCount)}
										</p>
									</div>
									<div className="bg-[color:var(--dashboardy-surface-opaque)] group-hover:bg-black/3 group-focus-visible:bg-black/3 dark:group-hover:bg-white/4 dark:group-focus-visible:bg-white/4" />
								</button>
							</li>
						))}
					</ul>
				) : hasSearch ? (
					<div className="flex min-h-64 flex-1">
						<SkillsStateMessage
							icon={<SearchXIcon aria-hidden="true" />}
							title="No matching skills"
							description="Try a different exact name or clear the search."
							action={
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={onClearSearch}
								>
									Clear search
								</Button>
							}
						/>
					</div>
				) : null}

				<div className="sticky bottom-0 z-20 grid h-9 shrink-0 grid-cols-[250px_215px_minmax(16rem,1fr)] border-t border-black/6 bg-[color:var(--dashboardy-surface-opaque)] dark:border-white/8">
					<div className="sticky left-0 z-20 flex min-w-0 items-center border-r border-black/6 bg-[color:var(--dashboardy-surface-opaque)] px-4 dark:border-white/8">
						<p className="font-mono text-sm tabular-nums text-[color:var(--dashboardy-muted)]">
							{filteredSkills.length.toLocaleString()} count
						</p>
					</div>
					<div className="border-r border-black/6 dark:border-white/8" />
					<div aria-hidden="true" />
				</div>
			</div>
		</div>
	);
}

function SkillsTableSkeleton() {
	return (
		<div aria-busy="true" className="min-h-0 min-w-0 flex-1 overflow-hidden">
			<output className="sr-only">Loading skills</output>
			<div className="flex min-h-full min-w-[46rem] flex-col">
				<div className="grid h-10 shrink-0 grid-cols-[250px_215px_minmax(16rem,1fr)] border-b border-black/6 dark:border-white/8">
					<div className="flex items-center border-r border-black/6 px-4 dark:border-white/8">
						<Skeleton className="h-4 w-16" />
					</div>
					<div className="flex items-center border-r border-black/6 px-4 dark:border-white/8">
						<Skeleton className="h-4 w-20" />
					</div>
					<div />
				</div>
				<div className="flex-1 divide-y divide-black/5 overflow-hidden dark:divide-white/8">
					{["first", "second", "third", "fourth", "fifth", "sixth"].map(
						(key) => (
							<div
								key={key}
								className="grid h-11 grid-cols-[250px_215px_minmax(16rem,1fr)] sm:h-9"
							>
								<div className="flex items-center border-r border-black/6 px-4 dark:border-white/8">
									<Skeleton className="h-4 w-40" />
								</div>
								<div className="flex items-center border-r border-black/6 bg-[color:var(--dashboardy-subsurface)] px-4 dark:border-white/8">
									<Skeleton className="h-4 w-28" />
								</div>
								<div />
							</div>
						),
					)}
				</div>
				<div className="grid h-9 shrink-0 grid-cols-[250px_215px_minmax(16rem,1fr)] border-t border-black/6 dark:border-white/8">
					<div className="flex items-center border-r border-black/6 px-4 dark:border-white/8">
						<Skeleton className="h-4 w-20" />
					</div>
					<div className="border-r border-black/6 dark:border-white/8" />
					<div />
				</div>
			</div>
		</div>
	);
}

function SkillsStateMessage({
	action,
	description,
	icon,
	title,
}: {
	action?: ReactNode;
	description: string;
	icon: ReactNode;
	title: string;
}) {
	return (
		<div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
			<div className="[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[color:var(--dashboardy-muted)]">
				{icon}
			</div>
			<div className="flex max-w-md flex-col gap-1">
				<h3 className="text-base font-medium text-balance text-[color:var(--dashboardy-heading)]">
					{title}
				</h3>
				<p className="text-pretty text-base text-[color:var(--dashboardy-muted)] sm:text-sm">
					{description}
				</p>
			</div>
			{action}
		</div>
	);
}

function formatSessionCount(sessionCount: number): string {
	return `Used in ${sessionCount.toLocaleString()} ${
		sessionCount === 1 ? "session" : "sessions"
	}`;
}
