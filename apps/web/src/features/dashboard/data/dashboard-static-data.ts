import {
	addDays,
	eachDayOfInterval,
	format,
	getISODay,
	parseISO,
	startOfWeek,
} from "date-fns";

export type DashboardDeltaTone = "positive" | "negative" | "neutral";
export type DashboardMetricId =
	| "output"
	| "quality"
	| "efficiency"
	| "speed"
	| "craft"
	| "consistency";

export interface DashboardMetricTrendPoint {
	date: string;
	value: number | null;
}

export interface DashboardMetricMemberPoint {
	imageUrl?: string | null;
	label: string;
	userId?: string;
	value: number | null;
}

export interface DashboardGroupedDetailPoint {
	date: string;
	primary: number | null;
	secondary: number | null;
}

export interface DashboardSingleDetailPoint {
	date: string;
	value: number | null;
}

export interface DashboardMetricDetailData {
	grouped: {
		primaryLabel: string;
		secondaryLabel: string;
		points: DashboardGroupedDetailPoint[];
	};
	single: {
		label: string;
		points: DashboardSingleDetailPoint[];
	};
}

export interface DashboardMetric {
	id: DashboardMetricId;
	label: string;
	value: number;
	deltaLabel: string;
	deltaTone: DashboardDeltaTone;
	trend: DashboardMetricTrendPoint[];
	memberValues: DashboardMetricMemberPoint[];
}

export interface DashboardHeadlineMetric {
	id: "sessions" | "uncommitted" | "commitRate";
	label: string;
	valueLabel: string;
	deltaLabel: string;
	deltaTone: DashboardDeltaTone;
	description: string;
}

export interface DashboardDailyPatternPoint {
	date: string;
	axisLabel: string;
	fullLabel: string;
	commits: number | null;
	sessions: number | null;
	commitRate: number | null;
}

export interface DashboardRankedOutputRow {
	label: string;
	commits: number;
	sessions: number;
	commitRate: number;
	secondaryLabel?: string;
}

export interface DashboardDistributionRow {
	label: string;
	commits: number;
	sessions: number;
	commitRate: number;
	sharePercent: number;
}

export interface DashboardProfileComparisonRow {
	label: string;
	committed: string;
	uncommitted: string;
}

export interface DashboardBinaryImpact {
	label: string;
	withLabel: string;
	withValue: string;
	withoutLabel: string;
	withoutValue: string;
	description: string;
}

export interface DashboardCommitCostMetric {
	label: string;
	valueLabel: string;
	description: string;
}

export interface DashboardBranchActivity {
	repository: string;
	branch: string;
	commits: number;
	players: number;
}

export interface DashboardOutputSnapshot {
	headlineMetrics: DashboardHeadlineMetric[];
	dailyPattern: DashboardDailyPatternPoint[];
	players: DashboardRankedOutputRow[];
	repositories: DashboardRankedOutputRow[];
	models: DashboardDistributionRow[];
	sources: DashboardDistributionRow[];
	sessionProfile: DashboardProfileComparisonRow[];
	impactComparisons: DashboardBinaryImpact[];
	commitCostMetrics: DashboardCommitCostMetric[];
	activeBranches: DashboardBranchActivity[];
	reposTouched: number;
}

const dashboardMetricTemplates: Array<{
	id: DashboardMetricId;
	label: string;
	value: number;
	deltaLabel: string;
	deltaTone: DashboardDeltaTone;
	weeklyValues: Array<number | null>;
	memberValues: Array<number | null>;
}> = [
	{
		id: "output",
		label: "Output",
		value: 89,
		deltaLabel: "+12",
		deltaTone: "positive",
		weeklyValues: [100, 83, 57, 83, null, null, null],
		memberValues: [92, 84, 77, 74, 69, 58, 41, 18],
	},
	{
		id: "quality",
		label: "Quality",
		value: 72,
		deltaLabel: "0",
		deltaTone: "neutral",
		weeklyValues: [82, 76, 80, 79, 77, 81, 78],
		memberValues: [86, 81, 78, 83, 72, 61, 74, 57],
	},
	{
		id: "efficiency",
		label: "Efficiency",
		value: 68,
		deltaLabel: "-5",
		deltaTone: "negative",
		weeklyValues: [74, 71, 67, 69, 61, null, null],
		memberValues: [79, 74, 68, 71, 66, 57, 62, 49],
	},
	{
		id: "speed",
		label: "Speed",
		value: 70,
		deltaLabel: "+2",
		deltaTone: "positive",
		weeklyValues: [85, 79, 76, 81, 73, 69, 67],
		memberValues: [88, 79, 73, 76, 71, 63, 59, 46],
	},
	{
		id: "craft",
		label: "Craft",
		value: 62,
		deltaLabel: "+4",
		deltaTone: "positive",
		weeklyValues: [64, 58, 55, 67, 61, null, null],
		memberValues: [72, 66, 61, 68, 59, 53, 49, 39],
	},
	{
		id: "consistency",
		label: "Consistency",
		value: 67,
		deltaLabel: "+1",
		deltaTone: "positive",
		weeklyValues: [88, 86, 84, 83, 80, 79, 78],
		memberValues: [90, 84, 79, 82, 76, 68, 52, 34],
	},
];

const dashboardMetricDetailTemplates: Record<
	DashboardMetricId,
	{
		grouped: {
			primaryLabel: string;
			secondaryLabel: string;
			primaryValues: Array<number | null>;
			secondaryValues: Array<number | null>;
		};
		single: {
			label: string;
			values: Array<number | null>;
		};
	}
> = {
	output: {
		grouped: {
			primaryLabel: "commits",
			secondaryLabel: "sessions",
			primaryValues: [19, 16, 11, 18, null, null, null],
			secondaryValues: [44, 38, 26, 41, null, null, null],
		},
		single: {
			label: "lines of code",
			values: [1280, 1045, 690, 1175, null, null, null],
		},
	},
	quality: {
		grouped: {
			primaryLabel: "reviews",
			secondaryLabel: "fixes",
			primaryValues: [12, 14, 13, 15, 11, 10, 12],
			secondaryValues: [6, 5, 7, 6, 5, 4, 5],
		},
		single: {
			label: "confidence points",
			values: [118, 109, 102, 120, 96, 91, 94],
		},
	},
	efficiency: {
		grouped: {
			primaryLabel: "tasks",
			secondaryLabel: "handoffs",
			primaryValues: [21, 20, 18, 22, 16, null, null],
			secondaryValues: [9, 8, 7, 10, 6, null, null],
		},
		single: {
			label: "focus minutes",
			values: [96, 88, 81, 93, 76, null, null],
		},
	},
	speed: {
		grouped: {
			primaryLabel: "patches",
			secondaryLabel: "revisions",
			primaryValues: [18, 16, 15, 17, 13, 12, 11],
			secondaryValues: [7, 6, 5, 7, 5, 4, 4],
		},
		single: {
			label: "time saved",
			values: [142, 130, 126, 138, 116, 104, 98],
		},
	},
	craft: {
		grouped: {
			primaryLabel: "refactors",
			secondaryLabel: "polish",
			primaryValues: [9, 8, 7, 10, 8, null, null],
			secondaryValues: [11, 10, 9, 12, 10, null, null],
		},
		single: {
			label: "cleanup lines",
			values: [640, 590, 510, 690, 560, null, null],
		},
	},
	consistency: {
		grouped: {
			primaryLabel: "streaks",
			secondaryLabel: "check-ins",
			primaryValues: [5, 5, 4, 5, 4, 4, 4],
			secondaryValues: [13, 12, 11, 13, 10, 10, 9],
		},
		single: {
			label: "stable sessions",
			values: [84, 81, 79, 82, 76, 74, 72],
		},
	},
};

const headlineMetricsTemplate: DashboardHeadlineMetric[] = [
	{
		id: "sessions",
		label: "Sessions run",
		valueLabel: "142",
		deltaLabel: "-6",
		deltaTone: "negative",
		description: "Total AI sessions this period.",
	},
	{
		id: "uncommitted",
		label: "Uncommitted sessions",
		valueLabel: "53",
		deltaLabel: "+8",
		deltaTone: "negative",
		description: "Sessions that did not produce a commit.",
	},
	{
		id: "commitRate",
		label: "Commit rate",
		valueLabel: "63%",
		deltaLabel: "+4.6 pp",
		deltaTone: "positive",
		description: "Sessions that produced a commit.",
	},
];

const dailyPatternTemplate = [
	{ commits: 17, sessions: 27, commitRate: 63 },
	{ commits: 14, sessions: 22, commitRate: 64 },
	{ commits: 18, sessions: 29, commitRate: 62 },
	{ commits: 21, sessions: 34, commitRate: 62 },
	{ commits: 19, sessions: 30, commitRate: 63 },
	{ commits: null, sessions: null, commitRate: null },
	{ commits: null, sessions: null, commitRate: null },
] as const;

const playersTemplate: DashboardRankedOutputRow[] = [
	{ label: "Morgan Lee", commits: 21, sessions: 28, commitRate: 75 },
	{ label: "Riley Nguyen", commits: 17, sessions: 25, commitRate: 68 },
	{ label: "Taylor Chen", commits: 14, sessions: 23, commitRate: 61 },
	{ label: "Alex Kim", commits: 13, sessions: 18, commitRate: 72 },
	{ label: "Jordan Rivera", commits: 12, sessions: 20, commitRate: 60 },
	{ label: "Sam Park", commits: 8, sessions: 18, commitRate: 44 },
	{ label: "Drew Wilson", commits: 4, sessions: 6, commitRate: 67 },
	{ label: "Casey Patel", commits: 0, sessions: 4, commitRate: 0 },
];

const repositoriesTemplate: DashboardRankedOutputRow[] = [
	{ label: "payments", commits: 28, sessions: 37, commitRate: 76 },
	{ label: "dashboard", commits: 19, sessions: 31, commitRate: 61 },
	{ label: "conductor", commits: 16, sessions: 29, commitRate: 55 },
	{ label: "tel-aviv-v1", commits: 14, sessions: 21, commitRate: 67 },
	{ label: "docs-site", commits: 12, sessions: 24, commitRate: 50 },
];

const modelsTemplate: DashboardDistributionRow[] = [
	{
		label: "Opus",
		commits: 48,
		sessions: 83,
		commitRate: 58,
		sharePercent: 54,
	},
	{
		label: "Sonnet 4",
		commits: 36,
		sessions: 51,
		commitRate: 71,
		sharePercent: 40,
	},
	{ label: "Haiku", commits: 5, sessions: 8, commitRate: 63, sharePercent: 6 },
];

const sourcesTemplate: DashboardDistributionRow[] = [
	{
		label: "Claude",
		commits: 66,
		sessions: 98,
		commitRate: 67,
		sharePercent: 74,
	},
	{
		label: "Codex",
		commits: 23,
		sessions: 44,
		commitRate: 52,
		sharePercent: 26,
	},
];

const sessionProfileTemplate: DashboardProfileComparisonRow[] = [
	{ label: "Avg duration", committed: "22 min", uncommitted: "18 min" },
	{ label: "Avg interactions", committed: "9.2", uncommitted: "6.8" },
	{ label: "Avg errors", committed: "0.8", uncommitted: "1.6" },
	{ label: "Avg tokens", committed: "84k", uncommitted: "66k" },
	{ label: "Avg cost", committed: "$3.19", uncommitted: "$2.41" },
	{ label: "Most common model", committed: "Sonnet 4", uncommitted: "Opus" },
	{ label: "Plan mode usage", committed: "58%", uncommitted: "31%" },
];

const impactComparisonsTemplate: DashboardBinaryImpact[] = [
	{
		label: "Plan mode impact",
		withLabel: "Plan mode on",
		withValue: "74%",
		withoutLabel: "Plan mode off",
		withoutValue: "56%",
		description: "Commit rate for sessions with planning vs without.",
	},
	{
		label: "Subagent impact",
		withLabel: "Subagents on",
		withValue: "68%",
		withoutLabel: "Subagents off",
		withoutValue: "61%",
		description: "Commit rate for sessions that used subagents.",
	},
];

const commitCostMetricsTemplate: DashboardCommitCostMetric[] = [
	{
		label: "Time to commit",
		valueLabel: "22m",
		description: "14m human thinking / 8m AI inference.",
	},
	{
		label: "Interactions to commit",
		valueLabel: "9.2",
		description: "Average turns in sessions that shipped code.",
	},
	{
		label: "Cost per commit",
		valueLabel: "$3.19",
		description: "Committed session spend divided by shipped commits.",
	},
];

const activeBranchesTemplate: DashboardBranchActivity[] = [
	{
		repository: "payments",
		branch: "feature/stripe-v3",
		commits: 8,
		players: 3,
	},
	{
		repository: "dashboard",
		branch: "feature/output-overview",
		commits: 6,
		players: 2,
	},
	{
		repository: "conductor",
		branch: "fix/sidebar-reflow",
		commits: 5,
		players: 2,
	},
	{
		repository: "tel-aviv-v1",
		branch: "feature/dashboardy-preview",
		commits: 4,
		players: 1,
	},
	{
		repository: "docs-site",
		branch: "content/agent-skills",
		commits: 3,
		players: 2,
	},
];

function resolveWeekStart(endDate: string) {
	const parsedEndDate = parseISO(endDate);

	if (Number.isNaN(parsedEndDate.getTime())) {
		return startOfWeek(new Date(), { weekStartsOn: 1 });
	}

	return startOfWeek(parsedEndDate, { weekStartsOn: 1 });
}

function isValidDate(value: Date) {
	return !Number.isNaN(value.getTime());
}

function resolveDateInterval(startDate: string, endDate: string) {
	const parsedStartDate = parseISO(startDate);
	const parsedEndDate = parseISO(endDate);

	if (!isValidDate(parsedStartDate) && !isValidDate(parsedEndDate)) {
		const weekStart = resolveWeekStart(endDate);
		return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
	}

	const safeEndDate = isValidDate(parsedEndDate)
		? parsedEndDate
		: parsedStartDate;
	const safeStartDate = isValidDate(parsedStartDate)
		? parsedStartDate
		: addDays(safeEndDate, -6);

	const [intervalStart, intervalEnd] =
		safeStartDate.getTime() <= safeEndDate.getTime()
			? [safeStartDate, safeEndDate]
			: [safeEndDate, safeStartDate];

	return eachDayOfInterval({
		start: intervalStart,
		end: intervalEnd,
	});
}

function buildDailyPatternPoint(
	date: Date,
	index: number,
): DashboardDailyPatternPoint {
	const template = dailyPatternTemplate[getISODay(date) - 1];

	if (
		template.commits == null ||
		template.sessions == null ||
		template.commitRate == null
	) {
		return {
			date: format(date, "yyyy-MM-dd"),
			axisLabel: format(date, "EEE"),
			fullLabel: format(date, "EEEE, MMM d"),
			commits: null,
			sessions: null,
			commitRate: null,
		};
	}

	const weekOffset = Math.floor(index / 7);
	const variabilitySeed = date.getDate() + date.getMonth() * 3 + weekOffset * 2;
	const variability = (variabilitySeed % 5) - 2;
	const sessions = Math.max(
		template.commits,
		Math.round(template.sessions * (1 + variability * 0.06)),
	);
	const commitRate = Math.max(
		0,
		Math.min(100, Math.round(template.commitRate + variability * 2)),
	);
	const commits = Math.min(
		sessions,
		Math.max(0, Math.round((sessions * commitRate) / 100)),
	);

	return {
		date: format(date, "yyyy-MM-dd"),
		axisLabel: format(date, "EEE"),
		fullLabel: format(date, "EEEE, MMM d"),
		commits,
		sessions,
		commitRate,
	};
}

function buildHeadlineMetrics(dailyPattern: DashboardDailyPatternPoint[]) {
	const commits = dailyPattern.reduce(
		(total, point) => total + (point.commits ?? 0),
		0,
	);
	const sessions = dailyPattern.reduce(
		(total, point) => total + (point.sessions ?? 0),
		0,
	);
	const uncommitted = Math.max(sessions - commits, 0);
	const commitRate = sessions > 0 ? Math.round((commits / sessions) * 100) : 0;

	return headlineMetricsTemplate.map((metric) => {
		if (metric.id === "uncommitted") {
			return {
				...metric,
				valueLabel: `${uncommitted}`,
			};
		}

		if (metric.id === "sessions") {
			return {
				...metric,
				valueLabel: `${sessions}`,
			};
		}

		return {
			...metric,
			valueLabel: `${commitRate}%`,
		};
	});
}

function clampDashboardScore(value: number) {
	return Math.max(0, Math.min(100, value));
}

function getRangeSeed(interval: Date[]) {
	return interval.reduce(
		(total, date, index) =>
			total + date.getDate() * (index + 3) + (date.getMonth() + 1) * 11,
		0,
	);
}

function getMetricRangeBias(metricId: DashboardMetricId, dayCount: number) {
	switch (metricId) {
		case "output":
			return dayCount >= 21 ? 4 : dayCount <= 3 ? -5 : 0;
		case "quality":
			return dayCount >= 14 ? 1 : 0;
		case "efficiency":
			return dayCount >= 21 ? 2 : dayCount <= 3 ? -3 : 0;
		case "speed":
			return dayCount <= 3 ? 4 : dayCount >= 21 ? -1 : 1;
		case "craft":
			return dayCount >= 14 ? 2 : 0;
		case "consistency":
			return dayCount >= 21 ? 6 : dayCount >= 14 ? 3 : -2;
	}
}

function buildMetricMemberValues(
	metricId: DashboardMetricId,
	memberValues: Array<number | null>,
	startDate: string,
	endDate: string,
) {
	const interval = resolveDateInterval(startDate, endDate);
	const dayCount = interval.length;
	const rangeSeed = getRangeSeed(interval);
	const volatility =
		dayCount <= 3 ? 8 : dayCount <= 7 ? 6 : dayCount <= 21 ? 4 : 2;

	return playersTemplate.map((player, index) => {
		const baseValue = memberValues[index] ?? null;

		if (baseValue == null) {
			return {
				label: player.label,
				value: null,
			};
		}

		const activityModifier = 0.88 + (((rangeSeed + index * 19) % 9) - 4) * 0.04;
		const expectedSessions =
			(player.sessions / 7) * dayCount * activityModifier;

		if (expectedSessions < 1.35) {
			return {
				label: player.label,
				value: null,
			};
		}

		const waveform =
			((((rangeSeed + (index + 1) * 17 + metricId.length * 13) % 11) - 5) *
				volatility) /
			5;
		const playerBias =
			player.commitRate >= 70 ? 2 : player.commitRate <= 50 ? -3 : 0;
		const rangeBias = getMetricRangeBias(metricId, dayCount);

		return {
			label: player.label,
			value: clampDashboardScore(
				Math.round(baseValue + waveform + playerBias + rangeBias),
			),
		};
	});
}

export function createDashboardMetrics(
	startDate: string,
	endDate: string,
): DashboardMetric[] {
	const weekStart = resolveWeekStart(endDate);

	return dashboardMetricTemplates.map((metric) => ({
		id: metric.id,
		label: metric.label,
		value: metric.value,
		deltaLabel: metric.deltaLabel,
		deltaTone: metric.deltaTone,
		trend: metric.weeklyValues.map((value, index) => ({
			date: format(addDays(weekStart, index), "yyyy-MM-dd"),
			value,
		})),
		memberValues: buildMetricMemberValues(
			metric.id,
			metric.memberValues,
			startDate,
			endDate,
		),
	}));
}

export function createDashboardMetricDetail(
	metricId: DashboardMetricId,
	endDate: string,
): DashboardMetricDetailData {
	const weekStart = resolveWeekStart(endDate);
	const template = dashboardMetricDetailTemplates[metricId];

	return {
		grouped: {
			primaryLabel: template.grouped.primaryLabel,
			secondaryLabel: template.grouped.secondaryLabel,
			points: Array.from({ length: 7 }, (_, index) => ({
				date: format(addDays(weekStart, index), "yyyy-MM-dd"),
				primary: template.grouped.primaryValues[index] ?? null,
				secondary: template.grouped.secondaryValues[index] ?? null,
			})),
		},
		single: {
			label: template.single.label,
			points: Array.from({ length: 7 }, (_, index) => ({
				date: format(addDays(weekStart, index), "yyyy-MM-dd"),
				value: template.single.values[index] ?? null,
			})),
		},
	};
}

export function createDashboardOutputSnapshot(
	startDate: string,
	endDate: string,
): DashboardOutputSnapshot {
	const dailyPattern = resolveDateInterval(startDate, endDate).map(
		buildDailyPatternPoint,
	);

	return {
		headlineMetrics: buildHeadlineMetrics(dailyPattern),
		dailyPattern,
		players: playersTemplate,
		repositories: repositoriesTemplate,
		models: modelsTemplate,
		sources: sourcesTemplate,
		sessionProfile: sessionProfileTemplate,
		impactComparisons: impactComparisonsTemplate,
		commitCostMetrics: commitCostMetricsTemplate,
		activeBranches: activeBranchesTemplate,
		reposTouched: 7,
	};
}

export const dashboardUserOptions = [
	"Morgan Lee",
	"Riley Nguyen",
	"Taylor Chen",
	"Alex Kim",
	"Jordan Rivera",
	"Sam Park",
	"Drew Wilson",
	"Casey Patel",
] as const;
