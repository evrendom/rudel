import type { MonthlyModelUsage, WrappedSourceSplit } from "@rudel/api-routes";

export interface WrappedRepoPulseEntry {
	id: string;
	meta: string;
	proof: string;
	repoName: string;
	workType: string;
}

export interface WrappedRepoPulseMetrics {
	entries: readonly WrappedRepoPulseEntry[];
	leadRepoName: string | null;
	totalRepos: number;
	totalSessions: number;
}

export interface WrappedSkillUsageItem {
	count: number;
	name: string;
}

export interface WrappedOnboardingMetrics {
	activeDays: number;
	avgSessionMin: number | null;
	commitRate: number | null;
	daysSinceFirst: number;
	favoriteModel: string | null;
	longestSessionMin: number | null;
	modelByMonth: readonly MonthlyModelUsage[];
	sourceSplit: readonly WrappedSourceSplit[];
	skillsAdoptionRate: number | null;
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
	successRate: number | null;
	repoPulse: WrappedRepoPulseMetrics;
	topProjectName: string | null;
	topProjectSessions: number;
	topProjectTokens: number;
	topSkills: readonly WrappedSkillUsageItem[];
	topSlashCommand: string | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
	topSlashCommandCount: number | null;
	topSubagent: string | null;
	topSubagents: readonly WrappedSkillUsageItem[];
	topSubagentCount: number | null;
	totalSessions: number;
	totalTokens: number;
}
