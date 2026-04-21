import type { MonthlyModelUsage, WrappedSourceSplit } from "@rudel/api-routes";

export interface WalkInRepoPulseEntry {
	id: string;
	meta: string;
	proof: string;
	repoName: string;
	workType: string;
}

export interface WalkInRepoPulseMetrics {
	entries: readonly WalkInRepoPulseEntry[];
	leadRepoName: string | null;
	totalRepos: number;
	totalSessions: number;
}

export interface WalkInSkillUsageItem {
	count: number;
	name: string;
}

export interface WalkInOnboardingMetrics {
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
	repoPulse: WalkInRepoPulseMetrics;
	topProjectName: string | null;
	topProjectSessions: number;
	topProjectTokens: number;
	topSkills: readonly WalkInSkillUsageItem[];
	topSlashCommand: string | null;
	topSlashCommands: readonly WalkInSkillUsageItem[];
	topSlashCommandCount: number | null;
	topSubagent: string | null;
	topSubagents: readonly WalkInSkillUsageItem[];
	topSubagentCount: number | null;
	totalSessions: number;
	totalTokens: number;
}
