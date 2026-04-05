import type {
	CostWindowMetric,
	CostsDashboard,
	CostsModelBreakdown,
	CostsProjectBreakdown,
} from "@rudel/api-routes";
import { queryClickhouse } from "../clickhouse.js";
import {
	buildEstimatedCostSql,
	calculateEstimatedCost,
	ESTIMATED_PRICING_MODE,
} from "./pricing.service.js";

interface CostsSummaryRow {
	first_session_date: string | null;
	today_input_tokens: number;
	today_output_tokens: number;
	week_input_tokens: number;
	week_output_tokens: number;
	month_input_tokens: number;
	month_output_tokens: number;
	all_time_input_tokens: number;
	all_time_output_tokens: number;
}

interface CostsModelRow {
	model: string;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	sessions: number;
	cost: number;
}

interface CostsProjectRow {
	project_key: string;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	sessions: number;
	cost: number;
}

const ALL_TIME_START = "2000-01-01";

function formatUtcDate(date: Date) {
	return date.toISOString().slice(0, 10);
}

function getUtcToday() {
	const now = new Date();
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
}

function getUtcIsoWeekStart(date: Date) {
	const day = date.getUTCDay();
	const offset = day === 0 ? -6 : 1 - day;
	const start = new Date(date);
	start.setUTCDate(start.getUTCDate() + offset);
	return start;
}

function getUtcMonthStart(date: Date) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function buildMetric(
	key: CostWindowMetric["key"],
	label: string,
	startDate: string,
	endDate: string,
	inputTokens: number,
	outputTokens: number,
): CostWindowMetric {
	return {
		key,
		label,
		cost: Number(calculateEstimatedCost(inputTokens, outputTokens, 4)),
		start_date: startDate,
		end_date: endDate,
	};
}

function toSharePct(cost: number, totalCost: number) {
	if (totalCost <= 0) {
		return 0;
	}

	return Number(((cost / totalCost) * 100).toFixed(2));
}

function getProjectLabel(projectKey: string) {
	const normalized = projectKey.replace(/\.git$/i, "").replace(/\\/g, "/");

	if (!normalized) {
		return "Unknown project";
	}

	const scopedPackageMatch = normalized.match(/@[^/]+\/([^/]+)$/);
	if (scopedPackageMatch?.[1]) {
		return scopedPackageMatch[1];
	}

	const segments = normalized.split(/[/:]/).filter(Boolean);
	return segments[segments.length - 1] ?? normalized;
}

export async function getCostsDashboard(orgId: string): Promise<CostsDashboard> {
	const today = getUtcToday();
	const todayLabel = formatUtcDate(today);
	const weekStart = formatUtcDate(getUtcIsoWeekStart(today));
	const monthStart = formatUtcDate(getUtcMonthStart(today));

	const summaryQuery = queryClickhouse<CostsSummaryRow>({
		query: `
      SELECT
        if(count() = 0, null, min(toString(toDate(session_date)))) as first_session_date,
        sumIf(input_tokens, toDate(session_date) = toDate({today:String})) as today_input_tokens,
        sumIf(output_tokens, toDate(session_date) = toDate({today:String})) as today_output_tokens,
        sumIf(input_tokens, toDate(session_date) >= toDate({weekStart:String}) AND toDate(session_date) <= toDate({today:String})) as week_input_tokens,
        sumIf(output_tokens, toDate(session_date) >= toDate({weekStart:String}) AND toDate(session_date) <= toDate({today:String})) as week_output_tokens,
        sumIf(input_tokens, toDate(session_date) >= toDate({monthStart:String}) AND toDate(session_date) <= toDate({today:String})) as month_input_tokens,
        sumIf(output_tokens, toDate(session_date) >= toDate({monthStart:String}) AND toDate(session_date) <= toDate({today:String})) as month_output_tokens,
        sum(input_tokens) as all_time_input_tokens,
        sum(output_tokens) as all_time_output_tokens
      FROM rudel.session_analytics
      WHERE organization_id = {orgId:String}
    `,
		query_params: {
			orgId,
			today: todayLabel,
			weekStart,
			monthStart,
		},
	});

	const modelQuery = queryClickhouse<CostsModelRow>({
		query: `
      SELECT
        model_used as model,
        sum(input_tokens) as input_tokens,
        sum(output_tokens) as output_tokens,
        sum(total_tokens) as total_tokens,
        count() as sessions,
        ${buildEstimatedCostSql({
					inputExpr: "sum(input_tokens)",
					outputExpr: "sum(output_tokens)",
					precision: 4,
				})} as cost
      FROM rudel.session_analytics
      WHERE organization_id = {orgId:String}
        AND toDate(session_date) >= toDate({monthStart:String})
        AND toDate(session_date) <= toDate({today:String})
        AND model_used != ''
        AND model_used != 'unknown'
      GROUP BY model
      ORDER BY cost DESC, total_tokens DESC, model ASC
    `,
		query_params: {
			orgId,
			monthStart,
			today: todayLabel,
		},
	});

	const projectQuery = queryClickhouse<CostsProjectRow>({
		query: `
      SELECT
        if(git_remote != '', git_remote, if(package_name != '', package_name, project_path)) as project_key,
        sum(input_tokens) as input_tokens,
        sum(output_tokens) as output_tokens,
        sum(total_tokens) as total_tokens,
        count() as sessions,
        ${buildEstimatedCostSql({
					inputExpr: "sum(input_tokens)",
					outputExpr: "sum(output_tokens)",
					precision: 4,
				})} as cost
      FROM rudel.session_analytics
      WHERE organization_id = {orgId:String}
        AND toDate(session_date) >= toDate({monthStart:String})
        AND toDate(session_date) <= toDate({today:String})
        AND if(git_remote != '', git_remote, if(package_name != '', package_name, project_path)) != ''
      GROUP BY project_key
      ORDER BY cost DESC, total_tokens DESC, project_key ASC
    `,
		query_params: {
			orgId,
			monthStart,
			today: todayLabel,
		},
	});

	const [summaryRows, modelRows, projectRows] = await Promise.all([
		summaryQuery,
		modelQuery,
		projectQuery,
	]);

	const summary = summaryRows[0] ?? {
		first_session_date: null,
		today_input_tokens: 0,
		today_output_tokens: 0,
		week_input_tokens: 0,
		week_output_tokens: 0,
		month_input_tokens: 0,
		month_output_tokens: 0,
		all_time_input_tokens: 0,
		all_time_output_tokens: 0,
	};

	const allTimeStart = summary.first_session_date || ALL_TIME_START;

	const metrics: CostWindowMetric[] = [
		buildMetric(
			"today",
			"Costs today",
			todayLabel,
			todayLabel,
			Number(summary.today_input_tokens) || 0,
			Number(summary.today_output_tokens) || 0,
		),
		buildMetric(
			"week",
			"Costs this week",
			weekStart,
			todayLabel,
			Number(summary.week_input_tokens) || 0,
			Number(summary.week_output_tokens) || 0,
		),
		buildMetric(
			"month",
			"Costs this month",
			monthStart,
			todayLabel,
			Number(summary.month_input_tokens) || 0,
			Number(summary.month_output_tokens) || 0,
		),
		buildMetric(
			"all_time",
			"All time costs",
			allTimeStart,
			todayLabel,
			Number(summary.all_time_input_tokens) || 0,
			Number(summary.all_time_output_tokens) || 0,
		),
	];

	const totalModelCost = modelRows.reduce(
		(sum, row) => sum + (Number(row.cost) || 0),
		0,
	);
	const totalProjectCost = projectRows.reduce(
		(sum, row) => sum + (Number(row.cost) || 0),
		0,
	);

	const byModel: CostsModelBreakdown[] = modelRows.map((row) => ({
		model: row.model,
		display_name: row.model,
		cost: Number(row.cost) || 0,
		input_tokens: Number(row.input_tokens) || 0,
		output_tokens: Number(row.output_tokens) || 0,
		total_tokens: Number(row.total_tokens) || 0,
		sessions: Number(row.sessions) || 0,
		share_pct: toSharePct(Number(row.cost) || 0, totalModelCost),
	}));

	const byProject: CostsProjectBreakdown[] = projectRows.map((row) => ({
		project_key: row.project_key,
		project_label: getProjectLabel(row.project_key),
		cost: Number(row.cost) || 0,
		input_tokens: Number(row.input_tokens) || 0,
		output_tokens: Number(row.output_tokens) || 0,
		total_tokens: Number(row.total_tokens) || 0,
		sessions: Number(row.sessions) || 0,
		share_pct: toSharePct(Number(row.cost) || 0, totalProjectCost),
	}));

	return {
		currency: "USD",
		pricing_mode: ESTIMATED_PRICING_MODE,
		timezone: "UTC",
		generated_at: new Date().toISOString(),
		chart_window_start: monthStart,
		chart_window_end: todayLabel,
		metrics,
		by_model: byModel,
		by_project: byProject,
	};
}
