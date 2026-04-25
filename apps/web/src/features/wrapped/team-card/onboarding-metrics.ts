import type {
	DeveloperDetails,
	DeveloperFeatureUsage,
	DeveloperProject,
	DeveloperSession,
	DimensionAnalysisDataPoint,
	WrappedV1,
} from "@rudel/api-routes";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { formatCompactCurrency } from "@/lib/format";

interface BuildWrappedOnboardingMetricsParams {
	commitBreakdown: readonly DimensionAnalysisDataPoint[] | undefined;
	developerDetails: DeveloperDetails | undefined;
	developerFeatures: DeveloperFeatureUsage | undefined;
	developerProjects: readonly DeveloperProject[] | undefined;
	developerSessions: readonly DeveloperSession[] | undefined;
	wrappedMetrics: WrappedV1["metrics"] | undefined;
}

export function buildWrappedOnboardingMetrics(
	input: BuildWrappedOnboardingMetricsParams,
): WrappedOnboardingMetrics {
	const {
		commitBreakdown,
		developerDetails,
		developerFeatures,
		developerProjects,
		developerSessions,
		wrappedMetrics,
	} = input;
	const totalSessions = developerDetails?.total_sessions ?? 0;
	const commitSessions = findBooleanDimensionCount(commitBreakdown, true);
	const topProject = findTopProject(developerProjects);
	const estimatedCostTokenBasis = Math.max(
		0,
		developerDetails?.total_tokens ?? wrappedMetrics?.total_tokens ?? 0,
	);
	const estimatedCostUsdRaw = Math.max(0, developerDetails?.cost ?? 0);
	const estimatedCostUsd = Math.round(estimatedCostUsdRaw);
	const repoPulse = buildRepoPulse(developerSessions, {
		baseCostTokenBasis: estimatedCostTokenBasis,
		baseCostUsd: estimatedCostUsdRaw,
	});

	return {
		activeDays:
			wrappedMetrics?.active_days ?? developerDetails?.active_days ?? 0,
		avgSessionMin: developerDetails?.avg_session_duration_min ?? null,
		commitRate:
			totalSessions > 0 ? (commitSessions / totalSessions) * 100 : null,
		commitSessions,
		daysSinceFirst: wrappedMetrics?.days_since_first_session ?? 0,
		estimatedCostTokenBasis,
		estimatedCostUsd,
		favoriteModel: formatWrappedLabel(
			wrappedMetrics?.favorite_model ??
				developerDetails?.favorite_model ??
				undefined,
		),
		longestSessionMin: wrappedMetrics?.longest_session_min ?? null,
		modelByMonth: wrappedMetrics?.model_by_month ?? [],
		sourceSplit: wrappedMetrics?.source_split ?? [],
		repoPulse,
		skillsAdoptionRate: developerFeatures?.skills_adoption_rate ?? null,
		slashCommandsAdoptionRate:
			developerFeatures?.slash_commands_adoption_rate ?? null,
		subagentsAdoptionRate: developerFeatures?.subagents_adoption_rate ?? null,
		successRate: developerDetails?.success_rate ?? null,
		topProjectName: getProjectDisplayName(topProject),
		topProjectSessions: topProject?.sessions ?? 0,
		topProjectTokens: topProject?.total_tokens ?? 0,
		topSkills:
			developerFeatures?.top_skills
				.map((skill) => ({
					count: skill.count,
					name: formatWrappedLabel(skill.name),
				}))
				.filter(
					(
						skill,
					): skill is {
						count: number;
						name: string;
					} => Boolean(skill.name),
				) ?? [],
		topSlashCommand: formatWrappedLabel(
			developerFeatures?.top_slash_commands[0]?.name,
		),
		topSlashCommands:
			developerFeatures?.top_slash_commands
				.map((command) => ({
					count: command.count,
					name: formatWrappedLabel(command.name),
				}))
				.filter(
					(
						command,
					): command is {
						count: number;
						name: string;
					} => Boolean(command.name),
				) ?? [],
		topSlashCommandCount:
			developerFeatures?.top_slash_commands[0]?.count ?? null,
		topSubagent: formatWrappedLabel(developerFeatures?.top_subagents[0]?.name),
		topSubagents:
			developerFeatures?.top_subagents
				.map((subagent) => ({
					count: subagent.count,
					name: formatWrappedLabel(subagent.name),
				}))
				.filter(
					(
						subagent,
					): subagent is {
						count: number;
						name: string;
					} => Boolean(subagent.name),
				) ?? [],
		topSubagentCount: developerFeatures?.top_subagents[0]?.count ?? null,
		totalSessions,
		totalTokens:
			wrappedMetrics?.total_tokens ?? developerDetails?.total_tokens ?? 0,
	};
}

function formatWrappedLabel(value: string | undefined) {
	const trimmedValue = value?.trim();

	if (!trimmedValue) {
		return null;
	}

	return trimmedValue
		.replaceAll(/[_-]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim()
		.replaceAll(/\b\w/g, (character) => character.toUpperCase());
}

function getMetricValue(row: DimensionAnalysisDataPoint) {
	return Number(row.metric_value) || 0;
}

function findBooleanDimensionCount(
	rows: readonly DimensionAnalysisDataPoint[] | undefined,
	target: boolean,
) {
	const match = rows?.find((row) => {
		const normalizedValue = row.dimension_value.trim().toLowerCase();
		return target
			? normalizedValue === "true" || normalizedValue === "1"
			: normalizedValue === "false" || normalizedValue === "0";
	});

	return match ? getMetricValue(match) : 0;
}

function findTopProject(projects: readonly DeveloperProject[] | undefined) {
	return [...(projects ?? [])].sort(
		(leftRow, rightRow) =>
			rightRow.total_tokens - leftRow.total_tokens ||
			rightRow.sessions - leftRow.sessions ||
			leftRow.project_path.localeCompare(rightRow.project_path),
	)[0];
}

function buildRepoPulse(
	sessions: readonly DeveloperSession[] | undefined,
	input: {
		baseCostTokenBasis: number;
		baseCostUsd: number;
	},
): WrappedOnboardingMetrics["repoPulse"] {
	const repoStats = new Map<
		string,
		{
			repoName: string;
			sessionCount: number;
			totalDurationMin: number;
			totalTokens: number;
		}
	>();

	for (const session of sessions ?? []) {
		const repoKey = getRepoPulseProjectKey(session);
		const repoLabel = getProjectDisplayName(session);

		if (!repoLabel) {
			continue;
		}

		const existingStats = repoStats.get(repoKey);
		repoStats.set(repoKey, {
			repoName: repoLabel,
			sessionCount: (existingStats?.sessionCount ?? 0) + 1,
			totalDurationMin:
				(existingStats?.totalDurationMin ?? 0) + session.duration_min,
			totalTokens: (existingStats?.totalTokens ?? 0) + session.total_tokens,
		});
	}

	if (repoStats.size === 0) {
		return {
			entries: [],
			leadRepoName: null,
			totalRepos: 0,
			totalSessions: 0,
		};
	}

	const rankedRepos = [...repoStats.entries()].sort(
		(leftEntry, rightEntry) =>
			rightEntry[1].sessionCount - leftEntry[1].sessionCount ||
			rightEntry[1].totalDurationMin - leftEntry[1].totalDurationMin ||
			rightEntry[1].totalTokens - leftEntry[1].totalTokens ||
			leftEntry[1].repoName.localeCompare(rightEntry[1].repoName),
	);
	const entries = rankedRepos.slice(0, 3).map(([repoKey, stats]) => ({
		id: `repo-pulse-${repoKey}`,
		repoName: stats.repoName,
		sessionCountLabel: formatRepoPulseSessionCount(stats.sessionCount),
		totalHoursLabel: buildRepoPulseHoursLabel(stats.totalDurationMin),
		totalSpendLabel: buildRepoPulseSpendLabel(
			resolveRepoPulseSpendUsd({
				baseCostTokenBasis: input.baseCostTokenBasis,
				baseCostUsd: input.baseCostUsd,
				totalTokens: stats.totalTokens,
			}),
		),
	}));
	const totalSessions = rankedRepos.reduce(
		(sum, [, stats]) => sum + stats.sessionCount,
		0,
	);

	return {
		entries,
		leadRepoName: entries[0]?.repoName ?? null,
		totalRepos: rankedRepos.length,
		totalSessions,
	};
}

function getRepoPulseProjectKey(project: {
	git_remote?: string;
	package_name?: string;
	project_path: string;
}) {
	return (
		project.project_path ??
		project.git_remote ??
		getProjectDisplayName(project) ??
		"unknown-project"
	);
}

function getProjectDisplayName(
	project:
		| {
				git_remote?: string;
				package_name?: string;
				project_path: string;
		  }
		| undefined,
) {
	if (!project) {
		return null;
	}

	const packageName = project.package_name?.trim();

	if (packageName) {
		return packageName;
	}

	const remoteName = project.git_remote?.split("/").pop()?.trim();

	if (remoteName) {
		return remoteName.replace(/\.git$/i, "");
	}

	const projectPath = project.project_path?.trim();

	return projectPath || null;
}

function formatRepoPulseSessionCount(sessionCount: number) {
	return `${sessionCount.toLocaleString()} session${sessionCount === 1 ? "" : "s"}`;
}

function buildRepoPulseHoursLabel(totalDurationMin: number) {
	return `${formatDurationMinutesAsHours(totalDurationMin)} total`;
}

function buildRepoPulseSpendLabel(spendUsd: number) {
	return `${formatCompactCurrency(spendUsd)} spent`;
}

function resolveRepoPulseSpendUsd(input: {
	baseCostTokenBasis: number;
	baseCostUsd: number;
	totalTokens: number;
}) {
	if (input.baseCostTokenBasis <= 0 || input.baseCostUsd <= 0) {
		return 0;
	}

	return (input.totalTokens / input.baseCostTokenBasis) * input.baseCostUsd;
}

function formatDurationMinutesAsHours(totalDurationMin: number) {
	const totalHours = Math.round((totalDurationMin / 60) * 10) / 10;

	if (Number.isInteger(totalHours)) {
		return `${totalHours.toFixed(0)}h`;
	}

	return `${totalHours.toFixed(1)}h`;
}
