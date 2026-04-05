import { addDays, format, parseISO, startOfWeek } from "date-fns";

export type DashboardTone =
	| "blue"
	| "teal"
	| "orange"
	| "lime"
	| "violet"
	| "rose"
	| "slate";

export type DashboardMetricId =
	| "output"
	| "quality"
	| "efficiency"
	| "speed"
	| "craft"
	| "consistency";

export type DashboardDeltaTone = "positive" | "negative" | "neutral";

export interface DashboardMetricTrendPoint {
	date: string;
	value: number | null;
}

export interface DashboardMetric {
	id: DashboardMetricId;
	label: string;
	value: number;
	deltaLabel: string;
	deltaTone: DashboardDeltaTone;
	trend: DashboardMetricTrendPoint[];
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

export interface DashboardBreakdownGroup {
	title: string;
	summary: string;
	items: Array<{
		label: string;
		valueLabel: string;
		percent: number;
		tone: DashboardTone;
	}>;
}

const dashboardMetricTemplates: Array<{
	id: DashboardMetricId;
	label: string;
	value: number;
	deltaLabel: string;
	deltaTone: DashboardDeltaTone;
	weeklyValues: Array<number | null>;
}> = [
	{
		id: "output",
		label: "Output",
		value: 89,
		deltaLabel: "+12",
		deltaTone: "positive",
		weeklyValues: [100, 83, 57, 83, null, null, null],
	},
	{
		id: "quality",
		label: "Quality",
		value: 72,
		deltaLabel: "0",
		deltaTone: "neutral",
		weeklyValues: [82, 76, 80, 79, 77, 81, 78],
	},
	{
		id: "efficiency",
		label: "Efficiency",
		value: 68,
		deltaLabel: "-5",
		deltaTone: "negative",
		weeklyValues: [74, 71, 67, 69, 61, null, null],
	},
	{
		id: "speed",
		label: "Speed",
		value: 70,
		deltaLabel: "+2",
		deltaTone: "positive",
		weeklyValues: [85, 79, 76, 81, 73, 69, 67],
	},
	{
		id: "craft",
		label: "Craft",
		value: 62,
		deltaLabel: "+4",
		deltaTone: "positive",
		weeklyValues: [64, 58, 55, 67, 61, null, null],
	},
	{
		id: "consistency",
		label: "Consistency",
		value: 67,
		deltaLabel: "+1",
		deltaTone: "positive",
		weeklyValues: [88, 86, 84, 83, 80, 79, 78],
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

function resolveWeekStart(endDate: string) {
	const parsedEndDate = parseISO(endDate);

	if (Number.isNaN(parsedEndDate.getTime())) {
		return startOfWeek(new Date(), { weekStartsOn: 1 });
	}

	return startOfWeek(parsedEndDate, { weekStartsOn: 1 });
}

export function createDashboardMetrics(endDate: string): DashboardMetric[] {
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

export const dashboardBreakdownGroups: DashboardBreakdownGroup[] = [
	{
		title: "Work types",
		summary: "142 sessions",
		items: [
			{ label: "Build", valueLabel: "45%", percent: 45, tone: "teal" },
			{ label: "Debug", valueLabel: "28%", percent: 28, tone: "lime" },
			{ label: "Refactor", valueLabel: "15%", percent: 15, tone: "orange" },
			{ label: "Explore", valueLabel: "12%", percent: 12, tone: "violet" },
		],
	},
	{
		title: "Models used",
		summary: "$284 spend",
		items: [
			{ label: "Opus", valueLabel: "52%", percent: 52, tone: "violet" },
			{ label: "Sonnet 4", valueLabel: "40%", percent: 40, tone: "teal" },
			{ label: "Haiku", valueLabel: "8%", percent: 8, tone: "orange" },
		],
	},
];

export const dashboardTimeComposition = [
	{
		label: "31h human thinking",
		valueLabel: "66%",
		percent: 66,
		tone: "violet" as const,
	},
	{
		label: "16h AI inference",
		valueLabel: "34%",
		percent: 34,
		tone: "teal" as const,
	},
];

export const dashboardComparisonNotes = [
	"47h total time with AI this week",
	"Last week: 52h (62% / 38%)",
] as const;

export const dashboardToolCards = [
	{ label: "Plan mode", value: "5/8", progress: 62, tone: "teal" as const },
	{ label: "Subagents", value: "3/8", progress: 38, tone: "teal" as const },
	{ label: "Skills", value: "2/8", progress: 25, tone: "teal" as const },
	{
		label: "Slash commands",
		value: "6/8",
		progress: 75,
		tone: "teal" as const,
	},
];

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
