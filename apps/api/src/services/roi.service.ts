import type {
	DeveloperCostBreakdown,
	ProjectCostBreakdown,
	ROIDashboard,
	ROIMetrics,
	ROITrend,
} from "@rudel/api-routes";
import {
	buildDateFilter,
	buildInclusiveDateRangeFilter,
	queryClickhouse,
} from "../clickhouse.js";
import {
	buildEstimatedCostSql,
	ESTIMATED_PRICING_MODE,
	FALLBACK_MODEL_PRICING,
	getModelPricingCatalog,
} from "./pricing.service.js";

// Pricing constants based on Claude Sonnet 4 rates, used as a default approximation
// across all models. TODO: implement per-model pricing using the model_used column.
// Sonnet 4: input=$3/MTok, output=$15/MTok
// Opus 4:   input=$5/MTok, output=$25/MTok
// Haiku 4:  input=$1/MTok, output=$5/MTok
const INPUT_PRICE_PER_MILLION = 3.0;
const OUTPUT_PRICE_PER_MILLION = 15.0;
const DEFAULT_DEV_HOURLY_RATE = 100;
const PER_SESSION_COST_SQL = buildEstimatedCostSql({
	modelExpr: "model_used",
	inputExpr: "ifNull(input_tokens, 0)",
	outputExpr: "ifNull(output_tokens, 0)",
	cacheReadInputExpr: "ifNull(cache_read_input_tokens, 0)",
	cacheCreationInputExpr: "ifNull(cache_creation_input_tokens, 0)",
});

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

interface RangeSnapshotRow {
	total_sessions: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_tokens: number;
	total_cost: number;
	total_hours: number;
	avg_success_score: number;
	active_developers: number;
	total_commits: number;
}

interface ROIDashboardTrendQueryRow {
	bucket_start: string;
	total_sessions: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_tokens: number;
	total_cost: number;
	total_commits: number;
}

type TrendInterval = "day" | "week" | "month";

interface DerivedROISnapshot {
	total_cost: number;
	dollar_value_saved: number;
	roi_percentage: number;
	dev_hours_saved: number;
	commits_per_dollar: number;
	sessions_per_dollar: number;
	total_sessions: number;
	total_commits: number;
	active_developers: number;
	avg_success_score: number;
}

function roundTo(value: number, digits = 2) {
	return Number(value.toFixed(digits));
}

function calculateChangePct(current: number, previous: number) {
	if (!Number.isFinite(previous) || previous === 0) {
		return 0;
	}

	return roundTo(((current - previous) / previous) * 100);
}

function shiftIsoDate(isoDate: string, days: number) {
	const date = new Date(`${isoDate}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function getInclusiveDateSpanDays(startDate: string, endDate: string) {
	const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
	const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
	return Math.floor((end - start) / 86_400_000) + 1;
}

function getTrendIntervalForRange(dayCount: number): TrendInterval {
	if (dayCount <= 31) {
		return "day";
	}

	if (dayCount <= 120) {
		return "week";
	}

	return "month";
}

function formatTrendBucketLabel(bucketStart: string, interval: TrendInterval) {
	const date = new Date(`${bucketStart}T00:00:00.000Z`);

	if (interval === "day" || interval === "week") {
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
		}).format(date);
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		year: "numeric",
	}).format(date);
}

function deriveROISnapshot(row?: RangeSnapshotRow): DerivedROISnapshot {
	const totalSessions = Number(row?.total_sessions) || 0;
	const totalOutputTokens = Number(row?.total_output_tokens) || 0;
	const totalCost = Number(row?.total_cost) || 0;
	const totalCommits = Number(row?.total_commits) || 0;
	const activeDevelopers = Number(row?.active_developers) || 0;
	const avgSuccessScore = roundTo(Number(row?.avg_success_score) || 0);
	const estimatedLocGenerated =
		(totalOutputTokens * CODE_PERCENTAGE) / TOKENS_PER_LOC;
	const devHoursSaved = roundTo(estimatedLocGenerated / LOC_PER_HOUR);
	const estimatedValueCreated = devHoursSaved * DEFAULT_DEV_HOURLY_RATE;
	const dollarValueSaved = roundTo(estimatedValueCreated - totalCost);
	const roiPercentage =
		totalCost > 0 ? roundTo((dollarValueSaved / totalCost) * 100) : 0;
	const commitsPerDollar =
		totalCost > 0 ? roundTo(totalCommits / totalCost) : 0;
	const sessionsPerDollar =
		totalCost > 0 ? roundTo(totalSessions / totalCost) : 0;

	return {
		total_cost: totalCost,
		dollar_value_saved: dollarValueSaved,
		roi_percentage: roiPercentage,
		dev_hours_saved: devHoursSaved,
		commits_per_dollar: commitsPerDollar,
		sessions_per_dollar: sessionsPerDollar,
		total_sessions: totalSessions,
		total_commits: totalCommits,
		active_developers: activeDevelopers,
		avg_success_score: avgSuccessScore,
	};
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

async function getRangeSnapshot(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<RangeSnapshotRow | undefined> {
	const query = `
    SELECT
      COUNT(*) as total_sessions,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      round(SUM(${PER_SESSION_COST_SQL}), 4) as total_cost,
      SUM(actual_duration_min) / 60.0 as total_hours,
      AVG(success_score) as avg_success_score,
      COUNT(DISTINCT user_id) as active_developers,
      SUM(has_commit) as total_commits
    FROM rudel.session_analytics
    WHERE ${buildInclusiveDateRangeFilter("startDate", "endDate")}
      AND organization_id = {orgId:String}
  `;

	const result = await queryClickhouse<RangeSnapshotRow>({
		query,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});

	return result[0];
}

async function getDeveloperCostBreakdownForRange(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<DeveloperCostBreakdown[]> {
	const query = `
    SELECT
      user_id,
      COUNT(*) as total_sessions,
      SUM(total_tokens) as total_tokens,
      AVG(success_score) as avg_success_score,
      round(SUM(${PER_SESSION_COST_SQL}), 4) as total_cost
    FROM rudel.session_analytics
    WHERE ${buildInclusiveDateRangeFilter("startDate", "endDate")}
      AND organization_id = {orgId:String}
    GROUP BY user_id
    ORDER BY total_cost DESC, total_tokens DESC, user_id ASC
  `;

	const result = await queryClickhouse<DeveloperBreakdownQueryResult>({
		query,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});

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
				grandTotalCost > 0 ? roundTo((cost / grandTotalCost) * 100) : 0,
			avg_success_score: roundTo(Number(row.avg_success_score) || 0),
		};
	});
}

async function getProjectCostBreakdownForRange(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<ProjectCostBreakdown[]> {
	const query = `
    SELECT
      if(git_remote != '', git_remote, if(package_name != '', package_name, arrayElement(splitByChar('/', project_path), -1))) as project_path,
      COUNT(*) as total_sessions,
      SUM(total_tokens) as total_tokens,
      AVG(success_score) as avg_success_score,
      round(SUM(${PER_SESSION_COST_SQL}), 4) as total_cost
    FROM rudel.session_analytics
    WHERE ${buildInclusiveDateRangeFilter("startDate", "endDate")}
      AND organization_id = {orgId:String}
      AND project_path != ''
    GROUP BY project_path
    ORDER BY total_cost DESC, total_tokens DESC, project_path ASC
  `;

	const result = await queryClickhouse<ProjectBreakdownQueryResult>({
		query,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});

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
				grandTotalCost > 0 ? roundTo((cost / grandTotalCost) * 100) : 0,
			avg_success_score: roundTo(Number(row.avg_success_score) || 0),
		};
	});
}

export async function getROIDashboard(
	orgId: string,
	params: {
		start_date: string;
		end_date: string;
	},
): Promise<ROIDashboard> {
	const { end_date, start_date } = params;
	const spanDays = getInclusiveDateSpanDays(start_date, end_date);
	const comparison_end_date = shiftIsoDate(start_date, -1);
	const comparison_start_date = shiftIsoDate(
		comparison_end_date,
		-(spanDays - 1),
	);
	const trendInterval = getTrendIntervalForRange(spanDays);
	const bucketExpr =
		trendInterval === "day"
			? "toDate(session_date)"
			: trendInterval === "week"
				? "toMonday(session_date)"
				: "toStartOfMonth(session_date)";

	const trendQuery = `
    SELECT
      toString(${bucketExpr}) as bucket_start,
      COUNT(*) as total_sessions,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      round(SUM(${PER_SESSION_COST_SQL}), 4) as total_cost,
      SUM(has_commit) as total_commits
    FROM rudel.session_analytics
    WHERE ${buildInclusiveDateRangeFilter("startDate", "endDate")}
      AND organization_id = {orgId:String}
    GROUP BY bucket_start
    ORDER BY bucket_start ASC
  `;

	const [
		currentSnapshotRow,
		previousSnapshotRow,
		trendRows,
		developerBreakdown,
		projectBreakdown,
	] = await Promise.all([
		getRangeSnapshot(orgId, start_date, end_date),
		getRangeSnapshot(orgId, comparison_start_date, comparison_end_date),
		queryClickhouse<ROIDashboardTrendQueryRow>({
			query: trendQuery,
			query_params: {
				startDate: start_date,
				endDate: end_date,
				orgId,
			},
		}),
		getDeveloperCostBreakdownForRange(orgId, start_date, end_date),
		getProjectCostBreakdownForRange(orgId, start_date, end_date),
	]);

	const current = deriveROISnapshot(currentSnapshotRow);
	const previous = deriveROISnapshot(previousSnapshotRow);

	return {
		start_date,
		end_date,
		comparison_start_date,
		comparison_end_date,
		summary: {
			total_cost: current.total_cost,
			total_cost_change_pct: calculateChangePct(
				current.total_cost,
				previous.total_cost,
			),
			dollar_value_saved: current.dollar_value_saved,
			dollar_value_saved_change_pct: calculateChangePct(
				current.dollar_value_saved,
				previous.dollar_value_saved,
			),
			roi_percentage: current.roi_percentage,
			roi_percentage_change_pct: calculateChangePct(
				current.roi_percentage,
				previous.roi_percentage,
			),
			dev_hours_saved: current.dev_hours_saved,
			dev_hours_saved_change_pct: calculateChangePct(
				current.dev_hours_saved,
				previous.dev_hours_saved,
			),
			commits_per_dollar: current.commits_per_dollar,
			sessions_per_dollar: current.sessions_per_dollar,
			total_sessions: current.total_sessions,
			total_commits: current.total_commits,
			active_developers: current.active_developers,
			avg_success_score: current.avg_success_score,
		},
		assumptions: {
			pricing_mode: ESTIMATED_PRICING_MODE,
			priced_model_entries: getModelPricingCatalog().length,
			fallback_input_price_per_million: FALLBACK_MODEL_PRICING.inputPerMillion,
			fallback_output_price_per_million:
				FALLBACK_MODEL_PRICING.outputPerMillion,
			code_percentage: CODE_PERCENTAGE,
			tokens_per_loc: TOKENS_PER_LOC,
			loc_per_hour: LOC_PER_HOUR,
			developer_hourly_rate: DEFAULT_DEV_HOURLY_RATE,
		},
		trend_interval: trendInterval,
		trend: trendRows.map((row) => {
			const snapshot = deriveROISnapshot({
				total_sessions: Number(row.total_sessions) || 0,
				total_input_tokens: Number(row.total_input_tokens) || 0,
				total_output_tokens: Number(row.total_output_tokens) || 0,
				total_tokens: Number(row.total_tokens) || 0,
				total_cost: Number(row.total_cost) || 0,
				total_hours: 0,
				avg_success_score: 0,
				active_developers: 0,
				total_commits: Number(row.total_commits) || 0,
			});

			return {
				bucket_start: row.bucket_start,
				bucket_label: formatTrendBucketLabel(row.bucket_start, trendInterval),
				total_cost: snapshot.total_cost,
				dollar_value_saved: snapshot.dollar_value_saved,
				roi_percentage: snapshot.roi_percentage,
				dev_hours_saved: snapshot.dev_hours_saved,
				commits_per_dollar: snapshot.commits_per_dollar,
				sessions_per_dollar: snapshot.sessions_per_dollar,
				total_sessions: Number(row.total_sessions) || 0,
				total_commits: Number(row.total_commits) || 0,
			};
		}),
		developer_breakdown: developerBreakdown,
		project_breakdown: projectBreakdown,
	};
}
