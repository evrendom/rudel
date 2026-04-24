import type {
	DeveloperDetails,
	DeveloperFeatureUsage,
	DeveloperProject,
	DeveloperSession,
	DimensionAnalysisDataPoint,
	WrappedV1,
} from "@rudel/api-routes";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { formatCompactWholeNumber } from "@/lib/format";

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
	const repoPulse = buildRepoPulse(developerSessions);

	return {
		activeDays:
			wrappedMetrics?.active_days ?? developerDetails?.active_days ?? 0,
		avgSessionMin: developerDetails?.avg_session_duration_min ?? null,
		commitRate:
			totalSessions > 0 ? (commitSessions / totalSessions) * 100 : null,
		commitSessions,
		daysSinceFirst: wrappedMetrics?.days_since_first_session ?? 0,
		estimatedCostTokenBasis: Math.max(
			0,
			developerDetails?.total_tokens ?? wrappedMetrics?.total_tokens ?? 0,
		),
		estimatedCostUsd: Math.max(0, Math.round(developerDetails?.cost ?? 0)),
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
): WrappedOnboardingMetrics["repoPulse"] {
	const repoStats = new Map<
		string,
		{
			errorSessions: number;
			repoName: string;
			sessionCount: number;
			skillSessions: number;
			slashSessions: number;
			subagentSessions: number;
			successSessions: number;
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
			errorSessions:
				(existingStats?.errorSessions ?? 0) + Number(session.has_errors),
			repoName: repoLabel,
			sessionCount: (existingStats?.sessionCount ?? 0) + 1,
			skillSessions:
				(existingStats?.skillSessions ?? 0) + Number(session.has_skills),
			slashSessions:
				(existingStats?.slashSessions ?? 0) +
				Number(session.has_slash_commands),
			subagentSessions:
				(existingStats?.subagentSessions ?? 0) + Number(session.has_subagents),
			successSessions:
				(existingStats?.successSessions ?? 0) + Number(session.likely_success),
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
			rightEntry[1].totalTokens - leftEntry[1].totalTokens ||
			rightEntry[1].totalDurationMin - leftEntry[1].totalDurationMin ||
			leftEntry[1].repoName.localeCompare(rightEntry[1].repoName),
	);
	const entries = rankedRepos.slice(0, 3).map(([repoKey, stats]) => {
		const workType = resolveRepoPulseWorkType(stats);

		return {
			id: `repo-pulse-${repoKey}`,
			meta: buildRepoPulseMeta(stats),
			proof: workType.proof,
			repoName: stats.repoName,
			workType: workType.label,
		};
	});
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

function resolveRepoPulseWorkType(stats: {
	errorSessions: number;
	sessionCount: number;
	skillSessions: number;
	slashSessions: number;
	subagentSessions: number;
	successSessions: number;
	totalDurationMin: number;
	totalTokens: number;
}) {
	const avgDurationMin = stats.totalDurationMin / stats.sessionCount;
	const avgTokens = stats.totalTokens / stats.sessionCount;
	const skillRate = (stats.skillSessions / stats.sessionCount) * 100;
	const slashRate = (stats.slashSessions / stats.sessionCount) * 100;
	const subagentRate = (stats.subagentSessions / stats.sessionCount) * 100;
	const successRate = (stats.successSessions / stats.sessionCount) * 100;

	if (subagentRate >= 25) {
		return {
			label: "Delegating",
			proof: `${Math.round(subagentRate)}% used subagents`,
		};
	}

	if (skillRate >= 28) {
		return {
			label: "Skills-heavy",
			proof: `${Math.round(skillRate)}% used skills`,
		};
	}

	if (slashRate >= 28) {
		return {
			label: "Command-heavy",
			proof: `${Math.round(slashRate)}% used slash commands`,
		};
	}

	if (avgDurationMin >= 45) {
		return {
			label: "Deep work",
			proof: `${formatDurationMinutesShort(avgDurationMin)} avg session`,
		};
	}

	if (avgTokens >= 45_000) {
		return {
			label: "Heavy lift",
			proof: `${formatCompactWholeNumber(Math.round(avgTokens))} tokens / session`,
		};
	}

	if (successRate >= 78) {
		return {
			label: "Shipping lane",
			proof: `${Math.round(successRate)}% likely successful`,
		};
	}

	return {
		label: avgDurationMin <= 18 ? "Quick passes" : "Steady work",
		proof:
			avgDurationMin <= 18
				? `${formatDurationMinutesShort(avgDurationMin)} avg session`
				: `${Math.round(successRate)}% likely successful`,
	};
}

function buildRepoPulseMeta(stats: {
	sessionCount: number;
	totalDurationMin: number;
	totalTokens: number;
}) {
	return `${stats.sessionCount.toLocaleString()} sessions · ${formatDurationMinutesShort(stats.totalDurationMin)} total`;
}

function formatDurationMinutesShort(totalDurationMin: number) {
	if (totalDurationMin < 60) {
		return `${Math.round(totalDurationMin)}m`;
	}

	const hours = Math.floor(totalDurationMin / 60);
	const minutes = Math.round(totalDurationMin - hours * 60);

	if (minutes === 0) {
		return `${hours}h`;
	}

	return `${hours}h ${minutes}m`;
}
