import type { WrappedRepoPulseMetrics } from "../types";

interface RepoPulseStageModel {
	disclosure: string;
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
				availableSessions: 84,
				entries: [
					{
						id: "repo-preview-rudel",
						repoName: "rudel",
						sessionCountLabel: "84 sessions",
						totalHoursLabel: "42h total",
						totalSpendLabel: "$118 estimated share",
					},
				],
				isTruncated: false,
				leadRepoName: "rudel",
				sampledSessions: 84,
				totalRepos: 1,
				totalSessions: 84,
			} satisfies WrappedRepoPulseMetrics;
		case "split-across":
			return {
				availableSessions: 108,
				entries: [
					{
						id: "repo-preview-rudel",
						repoName: "rudel",
						sessionCountLabel: "61 sessions",
						totalHoursLabel: "31h total",
						totalSpendLabel: "$86 estimated share",
					},
					{
						id: "repo-preview-rudel-web",
						repoName: "rudel-web",
						sessionCountLabel: "28 sessions",
						totalHoursLabel: "17h total",
						totalSpendLabel: "$44 estimated share",
					},
					{
						id: "repo-preview-api-routes",
						repoName: "api-routes",
						sessionCountLabel: "19 sessions",
						totalHoursLabel: "14h total",
						totalSpendLabel: "$31 estimated share",
					},
				],
				isTruncated: false,
				leadRepoName: "rudel",
				sampledSessions: 108,
				totalRepos: 6,
				totalSessions: 108,
			} satisfies WrappedRepoPulseMetrics;
		case "quiet":
			return {
				availableSessions: 0,
				entries: [],
				isTruncated: false,
				leadRepoName: null,
				sampledSessions: 0,
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
	const disclosure = input.isTruncated
		? `Estimated cost shares use the latest ${input.sampledSessions.toLocaleString()} of ${input.availableSessions.toLocaleString()} sessions in the last 365 days.`
		: "Estimated cost shares use server-priced sessions from the last 365 days.";

	if (input.entries.length === 0) {
		return {
			disclosure,
			entries: [],
			headline: "Your repo pulse is still landing",
			hiddenRepoCount: 0,
		};
	}

	if (input.totalRepos === 1) {
		return {
			disclosure,
			entries: input.entries,
			headline: "... and you only worked on this repo",
			hiddenRepoCount,
		};
	}

	return {
		disclosure,
		entries: input.entries,
		headline: "... and these were the repos you worked on",
		hiddenRepoCount,
	};
}
