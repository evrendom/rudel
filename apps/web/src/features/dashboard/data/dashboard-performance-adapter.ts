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
	modelsUsed: string[];
	outputTokens: number;
	repositoriesTouched: string[];
	totalCommits: number;
	totalSessions: number;
	totalTokens: number;
};

type ResolvedPerformanceTotals = {
	cost: number;
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
	const usageByUserId = new Map<
		string,
		AggregatedTrendUsage & {
			modelCounts: Map<string, number>;
			repositoryCounts: Map<string, number>;
		}
	>();

	for (const row of usersDailyTrend ?? []) {
		const currentUsage = usageByUserId.get(row.user_id) ?? {
			inputTokens: 0,
			modelCounts: new Map<string, number>(),
			modelsUsed: [],
			outputTokens: 0,
			repositoriesTouched: [],
			repositoryCounts: new Map<string, number>(),
			totalCommits: 0,
			totalSessions: 0,
			totalTokens: 0,
		};

		currentUsage.inputTokens += row.input_tokens ?? 0;
		currentUsage.outputTokens += row.output_tokens ?? 0;
		currentUsage.totalCommits += row.total_commits ?? 0;
		currentUsage.totalSessions += row.sessions ?? 0;
		currentUsage.totalTokens += row.total_tokens ?? 0;
		for (const model of row.models_used ?? []) {
			if (!model) {
				continue;
			}

			currentUsage.modelCounts.set(
				model,
				(currentUsage.modelCounts.get(model) ?? 0) + 1,
			);
		}
		for (const repository of row.repositories_touched ?? []) {
			if (!repository) {
				continue;
			}

			currentUsage.repositoryCounts.set(
				repository,
				(currentUsage.repositoryCounts.get(repository) ?? 0) + 1,
			);
		}
		usageByUserId.set(row.user_id, currentUsage);
	}

	return new Map<string, AggregatedTrendUsage>(
		Array.from(usageByUserId.entries()).map(([userId, usage]) => [
			userId,
			{
				inputTokens: usage.inputTokens,
				modelsUsed: Array.from(usage.modelCounts.entries())
					.sort(
						(left, right) =>
							right[1] - left[1] || left[0].localeCompare(right[0]),
					)
					.map(([model]) => model),
				outputTokens: usage.outputTokens,
				repositoriesTouched: Array.from(usage.repositoryCounts.entries())
					.sort(
						(left, right) =>
							right[1] - left[1] || left[0].localeCompare(right[0]),
					)
					.map(([repository]) => repository),
				totalCommits: usage.totalCommits,
				totalSessions: usage.totalSessions,
				totalTokens: usage.totalTokens,
			},
		]),
	);
}

function resolvePerformanceTotals(
	usage: UserTokenUsageData | undefined,
	trendUsage: AggregatedTrendUsage | undefined,
): ResolvedPerformanceTotals {
	const inputTokens = trendUsage?.inputTokens ?? usage?.input_tokens ?? 0;
	const outputTokens = trendUsage?.outputTokens ?? usage?.output_tokens ?? 0;
	const totalCommits = trendUsage?.totalCommits ?? usage?.total_commits ?? 0;
	const totalSessions = trendUsage?.totalSessions ?? usage?.total_sessions ?? 0;
	const totalTokens = trendUsage?.totalTokens ?? usage?.total_tokens ?? 0;

	return {
		cost:
			usage && usage.cost > 0
				? usage.cost
				: calculateCost(inputTokens, outputTokens),
		inputTokens,
		outputTokens,
		totalCommits,
		totalSessions,
		totalTokens,
	};
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
			const {
				cost,
				inputTokens,
				outputTokens,
				totalCommits,
				totalSessions,
				totalTokens,
			} = resolvePerformanceTotals(usage, trendUsage);

			return {
				cost,
				imageUrl: member.user.image,
				inputTokens,
				modelsUsed: usage?.models_used.length
					? usage.models_used
					: (trendUsage?.modelsUsed ?? []),
				outputTokens,
				repositoriesTouched: usage?.repositories_touched.length
					? usage.repositories_touched
					: (trendUsage?.repositoriesTouched ?? []),
				totalCommits,
				totalSessions,
				totalTokens,
				userId: member.userId,
				userLabel: getMemberDisplayLabel(member),
			};
		},
	);

	const analyticsOnlyIds = new Set<string>([
		...(usersTokenUsage ?? []).map((user) => user.user_id),
		...(usersDailyTrend ?? []).map((row) => row.user_id),
	]);

	const analyticsOnlyRows: SortablePerformanceUser[] = Array.from(
		analyticsOnlyIds,
	)
		.filter((userId) => userId && !memberIds.has(userId))
		.map((userId) => {
			const usage = usageByUserId.get(userId);
			const trendUsage = trendUsageByUserId.get(userId);
			const {
				cost,
				inputTokens,
				outputTokens,
				totalCommits,
				totalSessions,
				totalTokens,
			} = resolvePerformanceTotals(usage, trendUsage);

			return {
				cost,
				imageUrl: userImageById.get(userId) ?? null,
				inputTokens,
				modelsUsed: usage?.models_used.length
					? usage.models_used
					: (trendUsage?.modelsUsed ?? []),
				outputTokens,
				repositoriesTouched: usage?.repositories_touched.length
					? usage.repositories_touched
					: (trendUsage?.repositoriesTouched ?? []),
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
