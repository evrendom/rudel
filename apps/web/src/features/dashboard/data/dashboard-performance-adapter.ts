import type { UserTokenUsageData } from "@rudel/api-routes";

export type DashboardPerformanceUserComparison = {
	commits: number;
	imageUrl?: string | null;
	label: string;
	modelsUsed: string[];
	sessions: number;
	userId: string;
};

type DashboardPerformanceMember = {
	userId: string;
	user: {
		email: string;
		image: string | null;
		name: string;
	};
};

type SortablePerformanceUser = {
	imageUrl?: string | null;
	modelsUsed: string[];
	totalCommits: number;
	totalSessions: number;
	totalTokens: number;
	userId: string;
	userLabel: string;
};

function getMemberDisplayLabel(member: DashboardPerformanceMember) {
	const trimmedName = member.user.name.trim();

	return trimmedName || member.user.email || "Unknown user";
}

export function buildDashboardPerformanceUsers(
	usersTokenUsage: UserTokenUsageData[] | undefined,
	userImageById: Map<string, string | null>,
	organizationMembers: readonly DashboardPerformanceMember[] = [],
): DashboardPerformanceUserComparison[] {
	const usageByUserId = new Map(
		(usersTokenUsage ?? []).map((user) => [user.user_id, user] as const),
	);
	const memberIds = new Set(organizationMembers.map((member) => member.userId));

	const organizationRows: SortablePerformanceUser[] = organizationMembers.map(
		(member) => {
			const usage = usageByUserId.get(member.userId);

			return {
				imageUrl: member.user.image,
				modelsUsed: usage?.models_used ?? [],
				totalCommits: usage?.total_commits ?? 0,
				totalSessions: usage?.total_sessions ?? 0,
				totalTokens: usage?.total_tokens ?? 0,
				userId: member.userId,
				userLabel: usage?.user_label || getMemberDisplayLabel(member),
			};
		},
	);

	const analyticsOnlyRows: SortablePerformanceUser[] = (usersTokenUsage ?? [])
		.filter(
			(user) => user.user_id && user.user_label && !memberIds.has(user.user_id),
		)
		.map((user) => ({
			imageUrl: userImageById.get(user.user_id) ?? null,
			modelsUsed: user.models_used ?? [],
			totalCommits: user.total_commits,
			totalSessions: user.total_sessions,
			totalTokens: user.total_tokens,
			userId: user.user_id,
			userLabel: user.user_label,
		}));

	const combinedRows = [...organizationRows, ...analyticsOnlyRows];

	if (combinedRows.length === 0) {
		return [];
	}

	return combinedRows
		.sort((left, right) => {
			if (right.totalCommits !== left.totalCommits) {
				return right.totalCommits - left.totalCommits;
			}

			if (right.totalSessions !== left.totalSessions) {
				return right.totalSessions - left.totalSessions;
			}

			if (right.totalTokens !== left.totalTokens) {
				return right.totalTokens - left.totalTokens;
			}

			return left.userLabel.localeCompare(right.userLabel);
		})
		.map((user) => ({
			commits: user.totalCommits,
			imageUrl: user.imageUrl ?? userImageById.get(user.userId) ?? null,
			label: user.userLabel,
			modelsUsed: user.modelsUsed,
			sessions: user.totalSessions,
			userId: user.userId,
		}));
}
