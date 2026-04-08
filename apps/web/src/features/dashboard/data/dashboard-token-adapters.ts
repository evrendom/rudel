import type {
	ModelTokensTrendData,
	UserDailyTrendData,
	UserTokenUsageData,
} from "@rudel/api-routes";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import {
	calculateCost,
	formatCompactNumber,
	formatCompactWholeCurrency,
} from "@/lib/format";

export type DashboardTokenDailyPoint = {
	activeModels: number;
	avgTokensPerSession: number | null;
	axisLabel: string;
	date: string;
	dominantModel: string | null;
	dominantModelTokens: number;
	fullLabel: string;
	inputTokens: number;
	modelTokens: Record<string, number>;
	outputTokens: number;
	sessions: number;
	totalTokens: number;
};

export function buildDashboardTokenDailyPattern(
	startDate: string,
	endDate: string,
	userRows: UserDailyTrendData[] | undefined,
	modelRows: ModelTokensTrendData[] | undefined,
): DashboardTokenDailyPoint[] {
	const sessionsByDate = new Map<string, number>();
	const tokensByDate = new Map<
		string,
		{
			inputTokens: number;
			outputTokens: number;
		}
	>();
	const modelTokensByDate = new Map<string, Record<string, number>>();
	let hasModelTokenBreakdown = false;
	let hasUserTokenBreakdown = false;

	for (const row of userRows ?? []) {
		const dateKey = normalizeDateKey(row.date);
		const currentTokens = tokensByDate.get(dateKey) ?? {
			inputTokens: 0,
			outputTokens: 0,
		};

		sessionsByDate.set(
			dateKey,
			(sessionsByDate.get(dateKey) ?? 0) + row.sessions,
		);
		currentTokens.inputTokens += row.input_tokens;
		currentTokens.outputTokens += row.output_tokens;
		tokensByDate.set(dateKey, currentTokens);

		if (row.input_tokens > 0 || row.output_tokens > 0) {
			hasUserTokenBreakdown = true;
		}
	}

	if (!hasUserTokenBreakdown) {
		for (const row of modelRows ?? []) {
			const dateKey = normalizeDateKey(row.date);
			const currentTokens = tokensByDate.get(dateKey) ?? {
				inputTokens: 0,
				outputTokens: 0,
			};

			currentTokens.inputTokens += row.input_tokens;
			currentTokens.outputTokens += row.output_tokens;
			tokensByDate.set(dateKey, currentTokens);
		}
	}

	for (const row of modelRows ?? []) {
		const dateKey = normalizeDateKey(row.date);
		const currentModelTokens = modelTokensByDate.get(dateKey) ?? {};

		currentModelTokens[row.model] =
			(currentModelTokens[row.model] ?? 0) + row.total_tokens;
		modelTokensByDate.set(dateKey, currentModelTokens);

		if (row.total_tokens > 0) {
			hasModelTokenBreakdown = true;
		}
	}

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const sessions = sessionsByDate.get(isoDate) ?? 0;
		const tokensRow = tokensByDate.get(isoDate) ?? {
			inputTokens: 0,
			outputTokens: 0,
		};
		const modelTokens = modelTokensByDate.get(isoDate) ?? {};
		const totalTokens = tokensRow.inputTokens + tokensRow.outputTokens;
		const sortedModels = Object.entries(modelTokens)
			.filter(([, value]) => value > 0)
			.sort(
				(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
			);
		const [dominantModel, dominantModelTokens] = sortedModels[0] ?? [null, 0];

		return {
			activeModels: hasModelTokenBreakdown ? sortedModels.length : 0,
			avgTokensPerSession:
				sessions > 0 ? Math.round(totalTokens / sessions) : null,
			axisLabel: format(date, "EEE"),
			date: isoDate,
			dominantModel,
			dominantModelTokens,
			fullLabel: format(date, "EEEE, MMM d"),
			inputTokens: tokensRow.inputTokens,
			modelTokens,
			outputTokens: tokensRow.outputTokens,
			sessions,
			totalTokens,
		};
	});
}

export function buildDashboardTokenTabMetrics(
	usersTokenUsage: UserTokenUsageData[] | undefined,
	dailyPattern: DashboardTokenDailyPoint[],
	modelRows?: ModelTokensTrendData[] | undefined,
	userTrendRows?: UserDailyTrendData[] | undefined,
): DashboardHeadlineMetric[] {
	const totalTokensFromUsage = (usersTokenUsage ?? []).reduce(
		(sum, row) => sum + row.total_tokens,
		0,
	);
	const totalTokensFromPattern = dailyPattern.reduce(
		(sum, point) => sum + point.totalTokens,
		0,
	);
	const totalTokens =
		totalTokensFromUsage > 0 ? totalTokensFromUsage : totalTokensFromPattern;
	const totalCostFromUsage = (usersTokenUsage ?? []).reduce(
		(sum, row) => sum + row.cost,
		0,
	);
	const totalCostFromModels = (modelRows ?? []).reduce(
		(sum, row) =>
			sum + calculateCost(row.input_tokens, row.output_tokens, row.model),
		0,
	);
	const totalCost =
		totalCostFromUsage > 0 ? totalCostFromUsage : totalCostFromModels;
	const activeDevelopersFromUsage = (usersTokenUsage ?? []).filter(
		(row) => row.total_tokens > 0 || row.total_sessions > 0,
	).length;
	const activeDevelopersFromTrend = new Set(
		(userTrendRows ?? [])
			.filter((row) => row.total_tokens > 0 || row.sessions > 0)
			.map((row) => row.user_id),
	).size;
	const activeDevelopers =
		activeDevelopersFromUsage > 0
			? activeDevelopersFromUsage
			: activeDevelopersFromTrend;
	const activeDays = dailyPattern.filter(
		(point) => point.totalTokens > 0,
	).length;
	const averageTokensPerActiveDay =
		activeDays > 0 ? Math.round(totalTokens / activeDays) : 0;

	return [
		{
			description: "Total input and output tokens in the selected range.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "sessions",
			label: "Tokens used",
			valueLabel: formatCompactNumber(totalTokens),
		},
		{
			description:
				"Estimated token cost using the current model pricing catalog.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "uncommitted",
			label: "Est. spend",
			valueLabel: formatCompactWholeCurrency(totalCost),
		},
		{
			description:
				"Developers with token activity in the selected range. Delta shows average daily token load.",
			deltaLabel:
				activeDays > 0 ? formatCompactNumber(averageTokensPerActiveDay) : "0",
			deltaTone: "neutral",
			id: "commitRate",
			label: "Active developers",
			valueLabel: activeDevelopers.toString(),
		},
	];
}

function buildDateRange(startDate: string, endDate: string) {
	const parsedStartDate = parseISO(startDate);
	const parsedEndDate = parseISO(endDate);

	if (
		Number.isNaN(parsedStartDate.getTime()) ||
		Number.isNaN(parsedEndDate.getTime())
	) {
		return [];
	}

	return eachDayOfInterval({
		end:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedEndDate
				: parsedStartDate,
		start:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedStartDate
				: parsedEndDate,
	});
}

function normalizeDateKey(value: string) {
	if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
		return value;
	}

	const parsedDate = parseISO(value);

	if (Number.isNaN(parsedDate.getTime())) {
		return value;
	}

	return format(parsedDate, "yyyy-MM-dd");
}
