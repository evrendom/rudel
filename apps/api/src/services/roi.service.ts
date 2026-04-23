import type {
	DeveloperCostBreakdown,
	ProjectCostBreakdown,
	ROIMetrics,
	ROITrend,
} from "@rudel/api-routes";
import { buildDateFilter, queryClickhouse } from "../clickhouse.js";

// Pricing constants based on Claude Sonnet 4 rates, used as a default approximation
// across all models. TODO: implement per-model pricing using the model_used column.
// Sonnet 4: input=$3/MTok, output=$15/MTok
// Opus 4:   input=$5/MTok, output=$25/MTok
// Haiku 4:  input=$1/MTok, output=$5/MTok
const INPUT_PRICE_PER_MILLION = 3.0;
const OUTPUT_PRICE_PER_MILLION = 15.0;
const DEFAULT_DEV_HOURLY_RATE = 100;

// ROI calculation constants
const CODE_PERCENTAGE = 0.65; // 65% of output tokens are actual code
const TOKENS_PER_LOC = 15; // Average tokens per line of code
const LOC_PER_HOUR = 30; // Developer baseline: 30 lines per hour without Claude

interface ROIMetricsQueryResult {
	total_sessions: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_tokens: number;
	total_hours: number;
	avg_success_score: number;
	active_developers: number;
	total_commits: number;
	total_cost: number;
	cost_per_session: number;
	cost_per_commit: number;
	prev_total_cost: number;
	prev_cost_per_session: number;
	prev_cost_per_commit: number;
	prev_total_commits: number;
	prev_total_output_tokens: number;
	current_period_start: string;
	current_period_end: string;
	previous_period_start: string;
	previous_period_end: string;
}

interface TrendQueryResult {
	week_start: string;
	total_sessions: number;
	total_commits: number;
	total_cost: number;
	avg_success_score: number;
	active_developers: number;
	total_tokens: number;
	total_output_tokens: number;
}

interface DeveloperBreakdownQueryResult {
	user_id: string;
	total_sessions: number;
	total_tokens: number;
	total_cost: number;
	total_commits: number;
	total_hours: number;
	avg_success_score: number;
	success_rate: number;
}

interface ProjectBreakdownQueryResult {
	project_path: string;
	total_sessions: number;
	total_tokens: number;
	total_cost: number;
	total_commits: number;
	total_hours: number;
	avg_success_score: number;
}

/**
 * Get comprehensive ROI metrics with period-over-period comparison
 */
export async function getROIMetrics(
	orgId: string,
	days = 7,
): Promise<ROIMetrics> {
	const d = Number(days);
	const query_params = {
		currentDays: d,
		previousDays: d * 2,
		orgId,
	};

	const query = `
    WITH current_period AS (
      SELECT
        COUNT(*) as total_sessions,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(actual_duration_min) / 60.0 as total_hours,
        AVG(success_score) as avg_success_score,
        COUNT(DISTINCT user_id) as active_developers,
        SUM(has_commit) as total_commits,
        now64(3) - toIntervalDay({currentDays:UInt32}) as period_start,
        now64(3) as period_end
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("currentDays")}
        AND organization_id = {orgId:String}
    ),
    previous_period AS (
      SELECT
        COUNT(*) as total_sessions,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(has_commit) as total_commits,
        now64(3) - toIntervalDay({previousDays:UInt32}) as period_start,
        now64(3) - toIntervalDay({currentDays:UInt32}) as period_end
      FROM rudel.session_analytics FINAL
      WHERE session_date >= now64(3) - toIntervalDay({previousDays:UInt32})
        AND session_date < now64(3) - toIntervalDay({currentDays:UInt32})
        AND organization_id = {orgId:String}
    )
    SELECT
      c.total_sessions,
      c.total_input_tokens,
      c.total_output_tokens,
      c.total_tokens,
      c.total_hours,
      c.avg_success_score,
      c.active_developers,
      c.total_commits,
      round((c.total_output_tokens / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
            (c.total_input_tokens / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 2) as total_cost,
      round((c.total_output_tokens / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
            (c.total_input_tokens / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 4) / c.total_sessions as cost_per_session,
      if(c.total_commits > 0,
        round((c.total_output_tokens / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
              (c.total_input_tokens / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 4) / c.total_commits,
        0) as cost_per_commit,
      round((p.total_output_tokens / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
            (p.total_input_tokens / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 2) as prev_total_cost,
      round((p.total_output_tokens / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
            (p.total_input_tokens / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 4) / p.total_sessions as prev_cost_per_session,
      if(p.total_commits > 0,
        round((p.total_output_tokens / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
              (p.total_input_tokens / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 4) / p.total_commits,
        0) as prev_cost_per_commit,
      p.total_commits as prev_total_commits,
      p.total_output_tokens as prev_total_output_tokens,
      formatDateTime(c.period_start, '%Y-%m-%d') as current_period_start,
      formatDateTime(c.period_end, '%Y-%m-%d') as current_period_end,
      formatDateTime(p.period_start, '%Y-%m-%d') as previous_period_start,
      formatDateTime(p.period_end, '%Y-%m-%d') as previous_period_end
    FROM current_period c
    CROSS JOIN previous_period p
  `;

	const result = await queryClickhouse<ROIMetricsQueryResult>({
		query,
		query_params,
	});

	if (!result || result.length === 0) {
		throw new Error("No data available for ROI metrics");
	}

	const data = result[0] as ROIMetricsQueryResult;

	// Calculate percentage changes
	const totalCostChangePct =
		data.prev_total_cost > 0
			? ((data.total_cost - data.prev_total_cost) / data.prev_total_cost) * 100
			: 0;

	const costPerSessionChangePct =
		data.prev_cost_per_session > 0
			? ((data.cost_per_session - data.prev_cost_per_session) /
					data.prev_cost_per_session) *
				100
			: 0;

	const costPerCommitChangePct =
		data.prev_cost_per_commit > 0 && data.cost_per_commit > 0
			? ((data.cost_per_commit - data.prev_cost_per_commit) /
					data.prev_cost_per_commit) *
				100
			: 0;

	// Calculate productivity improvement
	const currentCommitsPerDollar =
		data.total_cost > 0 ? data.total_commits / data.total_cost : 0;
	const prevCommitsPerDollar =
		data.prev_total_cost > 0
			? data.prev_total_commits / data.prev_total_cost
			: 0;
	const productivityImprovementPct =
		prevCommitsPerDollar > 0
			? ((currentCommitsPerDollar - prevCommitsPerDollar) /
					prevCommitsPerDollar) *
				100
			: 0;

	// Token utilization rate (compared to baseline of 10M tokens per week)
	const baselineTokensPerWeek = 10_000_000;
	const tokenUtilizationRate =
		(data.total_tokens / baselineTokensPerWeek) * 100;

	// Developer hours saved
	const currentLOC =
		(data.total_output_tokens * CODE_PERCENTAGE) / TOKENS_PER_LOC;
	const previousLOC =
		(data.prev_total_output_tokens * CODE_PERCENTAGE) / TOKENS_PER_LOC;

	const currentHoursSaved = currentLOC / LOC_PER_HOUR;
	const previousHoursSaved = previousLOC / LOC_PER_HOUR;

	const currentValueCreated = currentHoursSaved * DEFAULT_DEV_HOURLY_RATE;
	const currentDollarValueSaved = currentValueCreated - data.total_cost;

	const roiPercentage =
		data.total_cost > 0 ? (currentDollarValueSaved / data.total_cost) * 100 : 0;

	const devHoursSavedChangePct =
		previousHoursSaved > 0
			? ((currentHoursSaved - previousHoursSaved) / previousHoursSaved) * 100
			: 0;

	return {
		total_cost: Number(data.total_cost) || 0,
		total_cost_change_pct: Number(totalCostChangePct.toFixed(2)),
		cost_per_session: Number(data.cost_per_session) || 0,
		cost_per_session_change_pct: Number(costPerSessionChangePct.toFixed(2)),
		cost_per_commit: Number(data.cost_per_commit) || 0,
		cost_per_commit_change_pct: Number(costPerCommitChangePct.toFixed(2)),
		total_tokens: Number(data.total_tokens) || 0,
		input_tokens: Number(data.total_input_tokens) || 0,
		output_tokens: Number(data.total_output_tokens) || 0,
		token_utilization_rate: Number(tokenUtilizationRate.toFixed(2)),
		total_sessions: Number(data.total_sessions) || 0,
		total_commits: Number(data.total_commits) || 0,
		total_hours: Number(data.total_hours) || 0,
		active_developers: Number(data.active_developers) || 0,
		avg_success_score: Number(data.avg_success_score) || 0,
		commits_per_dollar: parseFloat(currentCommitsPerDollar.toFixed(2)),
		sessions_per_dollar:
			data.total_cost > 0
				? parseFloat((data.total_sessions / data.total_cost).toFixed(2))
				: 0,
		productivity_improvement_pct: parseFloat(
			productivityImprovementPct.toFixed(2),
		),
		estimated_loc_generated: parseFloat(currentLOC.toFixed(0)),
		dev_hours_saved: parseFloat(currentHoursSaved.toFixed(2)),
		dev_hours_saved_change_pct: parseFloat(devHoursSavedChangePct.toFixed(2)),
		dollar_value_saved: parseFloat(currentDollarValueSaved.toFixed(2)),
		roi_percentage: parseFloat(roiPercentage.toFixed(2)),
		current_period_start: data.current_period_start,
		current_period_end: data.current_period_end,
		previous_period_start: data.previous_period_start,
		previous_period_end: data.previous_period_end,
	};
}

/**
 * Get weekly ROI trends for charting
 */
export async function getROITrends(
	orgId: string,
	days = 56,
): Promise<ROITrend[]> {
	const d = Number(days);

	const query = `
    SELECT
      toMonday(session_date) as week_start,
      COUNT(*) as total_sessions,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(has_commit) as total_commits,
      COUNT(DISTINCT user_id) as active_developers,
      AVG(success_score) as avg_success_score,
      round((SUM(output_tokens) / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
            (SUM(input_tokens) / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 2) as total_cost
    FROM rudel.session_analytics FINAL
    WHERE session_date >= now64(3) - toIntervalDay({days:UInt32})
      AND organization_id = {orgId:String}
    GROUP BY week_start
    ORDER BY week_start ASC
  `;

	const result = await queryClickhouse<TrendQueryResult>({
		query,
		query_params: {
			days: d,
			orgId,
		},
	});

	return result.map((row) => {
		const productivityScore =
			row.total_cost > 0 ? (row.total_commits / row.total_cost) * 100 : 0;

		return {
			week_start: row.week_start,
			total_cost: Number(row.total_cost) || 0,
			total_sessions: Number(row.total_sessions) || 0,
			total_commits: Number(row.total_commits) || 0,
			active_developers: Number(row.active_developers) || 0,
			avg_success_score: Number(row.avg_success_score) || 0,
			total_tokens: Number(row.total_tokens) || 0,
			output_tokens: Number(row.total_output_tokens) || 0,
			productivity_score: parseFloat(productivityScore.toFixed(2)),
		};
	});
}

/**
 * Get cost breakdown by developer
 */
export async function getDeveloperCostBreakdown(
	orgId: string,
	days = 30,
): Promise<DeveloperCostBreakdown[]> {
	const d = Number(days);

	const query = `
    SELECT
      user_id,
      COUNT(*) as total_sessions,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      AVG(success_score) as avg_success_score,
      round((SUM(output_tokens) / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
            (SUM(input_tokens) / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 2) as total_cost
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
    GROUP BY user_id
    ORDER BY total_cost DESC
  `;

	const result = await queryClickhouse<DeveloperBreakdownQueryResult>({
		query,
		query_params: {
			days: d,
			orgId,
		},
	});

	// Calculate total cost across all developers for cost_percentage
	const grandTotalCost = result.reduce(
		(sum, row) => sum + (Number(row.total_cost) || 0),
		0,
	);

	return result.map((row) => {
		const cost = Number(row.total_cost) || 0;

		return {
			user_id: row.user_id,
			sessions: Number(row.total_sessions) || 0,
			total_tokens: Number(row.total_tokens) || 0,
			cost,
			cost_percentage:
				grandTotalCost > 0
					? parseFloat(((cost / grandTotalCost) * 100).toFixed(2))
					: 0,
			avg_success_score: Number(row.avg_success_score) || 0,
		};
	});
}

/**
 * Get cost breakdown by project
 */
export async function getProjectCostBreakdown(
	orgId: string,
	days = 30,
): Promise<ProjectCostBreakdown[]> {
	const d = Number(days);

	const query = `
    SELECT
      if(git_remote != '', git_remote, if(package_name != '', package_name, arrayElement(splitByChar('/', project_path), -1))) as project_path,
      COUNT(*) as total_sessions,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      AVG(success_score) as avg_success_score,
      round((SUM(output_tokens) / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} +
            (SUM(input_tokens) / 1000000.0) * ${INPUT_PRICE_PER_MILLION}, 2) as total_cost
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND project_path != ''
    GROUP BY project_path
    ORDER BY total_cost DESC
  `;

	const result = await queryClickhouse<ProjectBreakdownQueryResult>({
		query,
		query_params: {
			days: d,
			orgId,
		},
	});

	// Calculate total cost across all projects for cost_percentage
	const grandTotalCost = result.reduce(
		(sum, row) => sum + (Number(row.total_cost) || 0),
		0,
	);

	return result.map((row) => {
		const cost = Number(row.total_cost) || 0;

		return {
			project_path: row.project_path,
			sessions: Number(row.total_sessions) || 0,
			total_tokens: Number(row.total_tokens) || 0,
			cost,
			cost_percentage:
				grandTotalCost > 0
					? parseFloat(((cost / grandTotalCost) * 100).toFixed(2))
					: 0,
			avg_success_score: Number(row.avg_success_score) || 0,
		};
	});
}
