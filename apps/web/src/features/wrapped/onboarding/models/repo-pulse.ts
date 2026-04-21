import type { WrappedRepoPulseMetrics } from "../types";

interface RepoPulseStageModel {
	entries: WrappedRepoPulseMetrics["entries"];
	footnote: string;
	headline: string;
	subline: string;
	totalReposLabel: string;
	totalSessionsLabel: string;
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
						id: "repo-preview-geneva",
						meta: "84 sessions · 42h total",
						proof: "52m avg session",
						repoName: "geneva",
						workType: "Deep work",
					},
				],
				leadRepoName: "geneva",
				totalRepos: 1,
				totalSessions: 84,
			} satisfies WrappedRepoPulseMetrics;
		case "split-across":
			return {
				entries: [
					{
						id: "repo-preview-geneva",
						meta: "61 sessions · 31h total",
						proof: "48m avg session",
						repoName: "geneva",
						workType: "Deep work",
					},
					{
						id: "repo-preview-rudel-web",
						meta: "28 sessions · 17h total",
						proof: "43% used skills",
						repoName: "rudel-web",
						workType: "Skills-heavy",
					},
					{
						id: "repo-preview-api-routes",
						meta: "19 sessions · 1.8M tokens",
						proof: "94K tokens / session",
						repoName: "api-routes",
						workType: "Heavy lift",
					},
				],
				leadRepoName: "geneva",
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
	if (input.entries.length === 0) {
		return {
			entries: [],
			footnote:
				"A little more repo history and the pulse will settle into view.",
			headline: "Your repo pulse is still landing",
			subline:
				"When the work settles into projects, this view turns into repo-by-repo work types.",
			totalReposLabel: "No repo signal yet",
			totalSessionsLabel: "No sessions yet",
		};
	}

	if (input.entries.length === 1) {
		return {
			entries: input.entries,
			footnote:
				"Each label comes from the strongest signal inside that repo: tool adoption, depth, token load, or delivery.",
			headline: "One repo held onto the run",
			subline: "There was a clear home base before the final card reveal.",
			totalReposLabel: `${input.totalRepos} repo${input.totalRepos === 1 ? "" : "s"} in play`,
			totalSessionsLabel: `${input.totalSessions.toLocaleString()} sessions`,
		};
	}

	return {
		entries: input.entries,
		footnote:
			"Each label comes from the strongest signal inside that repo: tool adoption, depth, token load, or delivery.",
		headline:
			input.entries.length >= 3
				? "Each repo had its own rhythm"
				: "The work split across a couple repos",
		subline:
			input.entries.length >= 3
				? "The top repos were not interchangeable. Each one carried a different kind of work."
				: "Even the busiest repos ended up with different patterns of work.",
		totalReposLabel: `${input.totalRepos} repo${input.totalRepos === 1 ? "" : "s"} in play`,
		totalSessionsLabel: `${input.totalSessions.toLocaleString()} sessions`,
	};
}
