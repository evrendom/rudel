import type { UserTokenUsageData } from "@rudel/api-routes";

const MAX_CHART_USERS = 8;

export type DashboardPerformanceUserComparison = {
	commits: number;
	imageUrl?: string | null;
	label: string;
	sessions: number;
	userId: string;
};

export function buildDashboardPerformanceUsers(
	usersTokenUsage: UserTokenUsageData[] | undefined,
	userImageById: Map<string, string | null>,
): DashboardPerformanceUserComparison[] {
	if (!usersTokenUsage?.length) {
		return [];
	}

	return usersTokenUsage
		.filter((user) => user.user_id && user.user_label)
		.sort((left, right) => {
			if (right.total_commits !== left.total_commits) {
				return right.total_commits - left.total_commits;
			}

			if (right.total_sessions !== left.total_sessions) {
				return right.total_sessions - left.total_sessions;
			}

			if (right.total_tokens !== left.total_tokens) {
				return right.total_tokens - left.total_tokens;
			}

			return left.user_label.localeCompare(right.user_label);
		})
		.slice(0, MAX_CHART_USERS)
		.map((user) => ({
			commits: user.total_commits,
			imageUrl: userImageById.get(user.user_id) ?? null,
			label: user.user_label,
			sessions: user.total_sessions,
			userId: user.user_id,
		}));
}
