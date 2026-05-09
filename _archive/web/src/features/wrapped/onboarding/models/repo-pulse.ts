import type { WrappedRepoPulseMetrics } from "../types";

interface RepoPulseStageModel {
	entries: WrappedRepoPulseMetrics["entries"];
	headline: string;
	hiddenRepoCount: number;
}

export function resolveRepoPulsePreviewInput(
	input: WrappedRepoPulseMetrics,
	previewState: string,
) {
	switch (previewState) {
		case "single-home":
			return {
				entries: [
					{
						id: "repo-preview-rudel",
						repoName: "rudel",
						sessionCountLabel: "84 sessions",
						totalHoursLabel: "42h total",
						totalSpendLabel: "$118 spent",
					},
				],
				leadRepoName: "rudel",
				totalRepos: 1,
				totalSessions: 84,
			} satisfies WrappedRepoPulseMetrics;
		case "split-across":
			return {
				entries: [
					{
						id: "repo-preview-rudel",
						repoName: "rudel",
						sessionCountLabel: "61 sessions",
						totalHoursLabel: "31h total",
						totalSpendLabel: "$86 spent",
					},
					{
						id: "repo-preview-rudel-web",
						repoName: "rudel-web",
						sessionCountLabel: "28 sessions",
						totalHoursLabel: "17h total",
						totalSpendLabel: "$44 spent",
					},
					{
						id: "repo-preview-api-routes",
						repoName: "api-routes",
						sessionCountLabel: "19 sessions",
						totalHoursLabel: "14h total",
						totalSpendLabel: "$31 spent",
					},
				],
				leadRepoName: "rudel",
				totalRepos: 6,
				totalSessions: 108,
			} satisfies WrappedRepoPulseMetrics;
		case "quiet":
			return {
				entries: [],
				leadRepoName: null,
				totalRepos: 0,
				totalSessions: 0,
			} satisfies WrappedRepoPulseMetrics;
		default:
			return input;
	}
}

export function resolveRepoPulseStageModel(
	input: WrappedRepoPulseMetrics,
): RepoPulseStageModel {
	const hiddenRepoCount = Math.max(0, input.totalRepos - input.entries.length);

	if (input.entries.length === 0) {
		return {
			entries: [],
			headline: "Your repo pulse is still landing",
			hiddenRepoCount: 0,
		};
	}

	if (input.totalRepos === 1) {
		return {
			entries: input.entries,
			headline: "... and you only worked on this repo",
			hiddenRepoCount,
		};
	}

	return {
		entries: input.entries,
		headline: "... and these were the repos you worked on",
		hiddenRepoCount,
	};
}
