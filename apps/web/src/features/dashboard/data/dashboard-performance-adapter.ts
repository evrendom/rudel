import type { UserDailyTrendData, UserTokenUsageData } from "@rudel/api-routes";
import { calculateCost } from "@/lib/format";

export type DashboardPerformanceUserComparison = {
	commits: number;
	cost: number;
	imageUrl?: string | null;
	inputTokens: number;
	label: string;
	modelsUsed: string[];
	outputTokens: number;
	repositoriesTouched: string[];
	sessions: number;
	totalTokens: number;
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
	cost: number;
	imageUrl?: string | null;
	inputTokens: number;
	modelsUsed: string[];
	outputTokens: number;
	repositoriesTouched: string[];
	totalCommits: number;
	totalSessions: number;
	totalTokens: number;
	userId: string;
	userLabel: string;
};

type AggregatedTrendUsage = {
	inputTokens: number;
	outputTokens: number;
	totalCommits: number;
	totalSessions: number;
	totalTokens: number;
};

function getMemberDisplayLabel(member: DashboardPerformanceMember) {
	const trimmedName = member.user.name.trim();

	return trimmedName || member.user.email || "Unknown user";
}

function buildTrendUsageByUserId(
	usersDailyTrend: UserDailyTrendData[] | undefined,
) {
	const usageByUserId = new Map<string, AggregatedTrendUsage>();

	for (const row of usersDailyTrend ?? []) {
		const currentUsage = usageByUserId.get(row.user_id) ?? {
			inputTokens: 0,
			outputTokens: 0,
			totalCommits: 0,
			totalSessions: 0,
			totalTokens: 0,
		};

		currentUsage.inputTokens += row.input_tokens ?? 0;
		currentUsage.outputTokens += row.output_tokens ?? 0;
		currentUsage.totalCommits += row.total_commits ?? 0;
		currentUsage.totalSessions += row.sessions ?? 0;
		currentUsage.totalTokens += row.total_tokens ?? 0;
		usageByUserId.set(row.user_id, currentUsage);
	}

	return usageByUserId;
}

export function buildDashboardPerformanceUsers(
	usersTokenUsage: UserTokenUsageData[] | undefined,
	usersDailyTrend: UserDailyTrendData[] | undefined,
	userImageById: Map<string, string | null>,
	organizationMembers: readonly DashboardPerformanceMember[] = [],
): DashboardPerformanceUserComparison[] {
	const usageByUserId = new Map(
		(usersTokenUsage ?? []).map((user) => [user.user_id, user] as const),
	);
	const trendUsageByUserId = buildTrendUsageByUserId(usersDailyTrend);
	const memberIds = new Set(organizationMembers.map((member) => member.userId));

	const organizationRows: SortablePerformanceUser[] = organizationMembers.map(
		(member) => {
			const usage = usageByUserId.get(member.userId);
			const trendUsage = trendUsageByUserId.get(member.userId);
			const totalSessions =
				usage && usage.total_sessions > 0
					? usage.total_sessions
					: (trendUsage?.totalSessions ?? 0);
			const totalTokens =
				usage && usage.total_tokens > 0
					? usage.total_tokens
					: (trendUsage?.totalTokens ?? 0);
			const inputTokens =
				usage && usage.total_tokens > 0
					? usage.input_tokens
					: (trendUsage?.inputTokens ?? 0);
			const outputTokens =
				usage && usage.total_tokens > 0
					? usage.output_tokens
					: (trendUsage?.outputTokens ?? 0);
			const totalCommits =
				usage && (usage.total_commits > 0 || usage.total_sessions > 0)
					? usage.total_commits
					: (trendUsage?.totalCommits ?? 0);
			const cost =
				usage && usage.cost > 0
					? usage.cost
					: calculateCost(inputTokens, outputTokens);

			return {
				cost,
				imageUrl: member.user.image,
				inputTokens,
				modelsUsed: usage?.models_used ?? [],
				outputTokens,
				repositoriesTouched: usage?.repositories_touched ?? [],
				totalCommits,
				totalSessions,
				totalTokens,
				userId: member.userId,
				userLabel: usage?.user_label || getMemberDisplayLabel(member),
			};
		},
	);

	const analyticsOnlyIds = new Set<string>([
		...(usersTokenUsage ?? []).map((user) => user.user_id),
		...(usersDailyTrend ?? []).map((row) => row.user_id),
	]);

	const analyticsOnlyRows: SortablePerformanceUser[] = Array.from(analyticsOnlyIds)
		.filter((userId) => userId && !memberIds.has(userId))
		.map((userId) => {
			const usage = usageByUserId.get(userId);
			const trendUsage = trendUsageByUserId.get(userId);
			const totalSessions =
				usage && usage.total_sessions > 0
					? usage.total_sessions
					: (trendUsage?.totalSessions ?? 0);
			const totalTokens =
				usage && usage.total_tokens > 0
					? usage.total_tokens
					: (trendUsage?.totalTokens ?? 0);
			const inputTokens =
				usage && usage.total_tokens > 0
					? usage.input_tokens
					: (trendUsage?.inputTokens ?? 0);
			const outputTokens =
				usage && usage.total_tokens > 0
					? usage.output_tokens
					: (trendUsage?.outputTokens ?? 0);
			const totalCommits =
				usage && (usage.total_commits > 0 || usage.total_sessions > 0)
					? usage.total_commits
					: (trendUsage?.totalCommits ?? 0);

			return {
				cost:
					usage && usage.cost > 0
						? usage.cost
						: calculateCost(inputTokens, outputTokens),
				imageUrl: userImageById.get(userId) ?? null,
				inputTokens,
				modelsUsed: usage?.models_used ?? [],
				outputTokens,
				repositoriesTouched: usage?.repositories_touched ?? [],
				totalCommits,
				totalSessions,
				totalTokens,
				userId,
				userLabel: usage?.user_label ?? userId,
			};
		});

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
			cost: user.cost,
			imageUrl: user.imageUrl ?? userImageById.get(user.userId) ?? null,
			inputTokens: user.inputTokens,
			label: user.userLabel,
			modelsUsed: user.modelsUsed,
			outputTokens: user.outputTokens,
			repositoriesTouched: user.repositoriesTouched,
			sessions: user.totalSessions,
			totalTokens: user.totalTokens,
			userId: user.userId,
		}));
}
