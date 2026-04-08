import type {
	DimensionAnalysisInput,
	SessionAnalytics,
	SessionAnalyticsSummary as SessionAnalyticsSummaryBase,
	SessionDetail,
	SessionHourlyActivityDataPoint,
} from "@rudel/api-routes";
import {
	addOptionalStringEqFilter,
	buildDateFilter,
	buildInclusiveDateRangeFilter,
	queryClickhouse,
} from "../clickhouse.js";

export interface SessionAnalyticsRaw {
	session_id: string;
	user_id: string;
	session_date: string;
	project_path: string;
	organization_id: string;
	git_remote: string;
	package_name: string;

	// Interaction timing metrics
	total_interactions: number;
	avg_period_sec: number;
	median_period_sec: number;
	quick_responses: number;
	normal_responses: number;
	long_pauses: number;
	actual_duration_min: number;

	// Duration metrics
	last_interaction_date: string;

	// Token metrics
	total_tokens: number;
	input_tokens: number;
	output_tokens: number;

	// Git activity
	git_sha: string;
	git_branch: string;
	has_commit: number;

	// Feature arrays
	subagent_types: string[];
	skills: string[];
	slash_commands: string[];

	// Success metrics
	session_archetype: string;
	success_score: number;

	// Effectiveness correlation factors
	error_count: number;
	model_used: string;
	used_plan_mode: number;
}

export interface SessionAnalyticsSummary extends SessionAnalyticsSummaryBase {
	avg_interactions_per_session: number;
	median_response_time_sec: number;
	quick_response_rate: number;
	long_pause_rate: number;
}

/**
 * Get session analytics from the materialized view
 */
export async function getSessionAnalytics(
	orgId: string,
	params: {
		days?: number;
		start_date?: string;
		end_date?: string;
		user_id?: string;
		project_path?: string;
		repository?: string;
		limit?: number;
		offset?: number;
		sort_by?: "date" | "duration" | "interactions";
		sort_order?: "asc" | "desc";
	} = {},
): Promise<SessionAnalytics[]> {
	const {
		days = 30,
		start_date,
		end_date,
		user_id,
		project_path,
		repository,
		limit = 50,
		offset = 0,
		sort_by = "date",
		sort_order = "desc",
	} = params;

	const d = Number(days);
	const query_params: Record<string, unknown> = {
		days: d,
		limit: Number(limit),
		offset: Number(offset),
		orgId,
	};
	const dateFilter =
		start_date && end_date
			? buildInclusiveDateRangeFilter("startDate", "endDate", "sa.session_date")
			: buildDateFilter("days", "sa.session_date");
	if (start_date && end_date) {
		query_params.startDate = start_date;
		query_params.endDate = end_date;
	}
	const filters: string[] = [];
	addOptionalStringEqFilter(
		filters,
		query_params,
		"user_id",
		"userId",
		user_id,
	);
	addOptionalStringEqFilter(
		filters,
		query_params,
		"project_path",
		"projectPath",
		project_path,
	);
	if (repository) {
		filters.push(
			"(git_remote = {repository:String} OR package_name = {repository:String} OR project_path = {repository:String})",
		);
		query_params.repository = repository;
	}

	const sortColumn =
		sort_by === "duration"
			? "actual_duration_min"
			: sort_by === "interactions"
				? "total_interactions"
				: "sa.session_date";
	const sortDirection = sort_order === "asc" ? "ASC" : "DESC";

	const query = `
    SELECT
      session_id,
      user_id,
      formatDateTime(sa.session_date, '%Y-%m-%dT%H:%i:%SZ') as session_date,
      project_path,
      organization_id,
      git_remote,
      package_name,
      total_interactions,
      avg_period_sec,
      median_period_sec,
      quick_responses,
      normal_responses,
      long_pauses,
      actual_duration_min,
      formatDateTime(sa.last_interaction_date, '%Y-%m-%dT%H:%i:%SZ') as last_interaction_date,
      total_tokens,
      input_tokens,
      output_tokens,
      git_sha,
      git_branch,
      has_commit,
      subagent_types,
      skills,
      slash_commands,
      session_archetype,
      success_score,
      error_count,
      model_used,
      used_plan_mode
    FROM rudel.session_analytics sa
    WHERE ${dateFilter}
      AND organization_id = {orgId:String}
      ${filters.length > 0 ? `AND ${filters.join("\n      AND ")}` : ""}
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

	const raw = await queryClickhouse<SessionAnalyticsRaw>({
		query,
		query_params,
	});

	return raw.map(
		(row): SessionAnalytics => ({
			session_id: row.session_id,
			user_id: row.user_id,
			session_date: row.session_date,
			project_path: row.project_path,
			repository:
				row.git_remote || row.package_name || row.project_path || null,
			git_remote: row.git_remote || undefined,
			duration_min: row.actual_duration_min,
			total_tokens: row.total_tokens,
			input_tokens: row.input_tokens,
			output_tokens: row.output_tokens,
			success_score: row.success_score,
			total_interactions: row.total_interactions,
			avg_period_sec: row.avg_period_sec,
			subagent_types: row.subagent_types,
			skills: row.skills,
			slash_commands: row.slash_commands,
			has_commit: row.has_commit > 0,
			session_archetype: row.session_archetype,
			model_used: row.model_used,
			used_plan_mode: row.used_plan_mode > 0,
		}),
	);
}

/**
 * Get summary statistics from session analytics
 */
export async function getSessionAnalyticsSummary(
	orgId: string,
	params: {
		days?: number;
		user_id?: string;
		project_path?: string;
	} = {},
): Promise<SessionAnalyticsSummary> {
	const { days = 30, user_id, project_path } = params;
	const d = Number(days);
	const query_params: Record<string, unknown> = {
		days: d,
		orgId,
	};
	const filters: string[] = [];
	addOptionalStringEqFilter(
		filters,
		query_params,
		"user_id",
		"userId",
		user_id,
	);
	addOptionalStringEqFilter(
		filters,
		query_params,
		"project_path",
		"projectPath",
		project_path,
	);

	const query = `
    WITH totals AS (
      SELECT
        COUNT(*) as cnt_sessions,
        SUM(total_interactions) as sum_interactions,
        SUM(total_tokens) as sum_tokens,
        SUM(quick_responses) as sum_quick_responses,
        SUM(long_pauses) as sum_long_pauses,
        ifNull(AVG(actual_duration_min), 0) as avg_duration,
        ifNull(AVG(total_interactions), 0) as avg_interactions,
        ifNull(AVG(avg_period_sec), 0) as avg_response,
        ifNull(AVG(median_period_sec), 0) as med_response,
        countIf(length(subagent_types) > 0) as cnt_subagents,
        countIf(length(skills) > 0) as cnt_skills,
        countIf(length(slash_commands) > 0) as cnt_slash
      FROM rudel.session_analytics
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        ${filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : ""}
    )
    SELECT
      cnt_sessions as total_sessions,
      sum_interactions as total_interactions,
      sum_tokens as total_tokens,
      ifNull(round(avg_duration, 2), 0) as avg_session_duration_min,
      ifNull(round(avg_interactions, 2), 0) as avg_interactions_per_session,
      ifNull(round(avg_response, 2), 0) as avg_response_time_sec,
      ifNull(round(med_response, 2), 0) as median_response_time_sec,
      round(sum_quick_responses * 100.0 / if(sum_interactions > 0, sum_interactions, 1), 2) as quick_response_rate,
      round(sum_long_pauses * 100.0 / if(sum_interactions > 0, sum_interactions, 1), 2) as long_pause_rate,
      round(cnt_subagents * 100.0 / if(cnt_sessions > 0, cnt_sessions, 1), 2) as subagents_adoption_rate,
      round(cnt_skills * 100.0 / if(cnt_sessions > 0, cnt_sessions, 1), 2) as skills_adoption_rate,
      round(cnt_slash * 100.0 / if(cnt_sessions > 0, cnt_sessions, 1), 2) as slash_commands_adoption_rate
    FROM totals
  `;

	const results = await queryClickhouse<SessionAnalyticsSummary>({
		query,
		query_params,
	});

	const defaults: SessionAnalyticsSummary = {
		total_sessions: 0,
		total_interactions: 0,
		total_tokens: 0,
		avg_session_duration_min: 0,
		avg_interactions_per_session: 0,
		avg_response_time_sec: 0,
		median_response_time_sec: 0,
		quick_response_rate: 0,
		long_pause_rate: 0,
		subagents_adoption_rate: 0,
		skills_adoption_rate: 0,
		slash_commands_adoption_rate: 0,
	};

	if (results.length === 0) {
		return defaults;
	}

	// Coalesce nulls from ClickHouse (AVG on 0 rows returns null despite ifNull)
	const row = results[0] as Record<string, unknown> | undefined;
	if (!row) return defaults;
	return Object.fromEntries(
		Object.entries(defaults).map(([key, def]) => [key, row[key] ?? def]),
	) as SessionAnalyticsSummary;
}

export type SessionSummaryComparisonPeriod = SessionAnalyticsSummaryBase;

/**
 * Get session analytics summary with period-over-period comparison
 */
export async function getSessionAnalyticsSummaryComparison(
	orgId: string,
	params: {
		days?: number;
		user_id?: string;
		project_path?: string;
	} = {},
) {
	const { days = 7, user_id, project_path } = params;
	const d = Number(days);
	const previousDays = d * 2;
	const baseParams: Record<string, unknown> = {
		currentDays: d,
		previousDays,
		orgId,
	};
	const filters: string[] = [];
	addOptionalStringEqFilter(filters, baseParams, "user_id", "userId", user_id);
	addOptionalStringEqFilter(
		filters,
		baseParams,
		"project_path",
		"projectPath",
		project_path,
	);

	const summarySQL = (dateCondition: string) => `
    WITH totals AS (
      SELECT
        COUNT(*) as cnt_sessions,
        SUM(total_interactions) as total_interactions,
        SUM(total_tokens) as total_tokens,
        ifNull(AVG(actual_duration_min), 0) as avg_duration,
        ifNull(AVG(avg_period_sec), 0) as avg_response,
        countIf(length(subagent_types) > 0) as cnt_subagents,
        countIf(length(skills) > 0) as cnt_skills,
        countIf(length(slash_commands) > 0) as cnt_slash
      FROM rudel.session_analytics
      WHERE ${dateCondition}
        AND organization_id = {orgId:String}
        ${filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : ""}
    )
    SELECT
      cnt_sessions as total_sessions,
      total_interactions,
      total_tokens,
      ifNull(round(avg_duration, 2), 0) as avg_session_duration_min,
      ifNull(round(avg_response, 2), 0) as avg_response_time_sec,
      round(cnt_subagents * 100.0 / if(cnt_sessions > 0, cnt_sessions, 1), 2) as subagents_adoption_rate,
      round(cnt_skills * 100.0 / if(cnt_sessions > 0, cnt_sessions, 1), 2) as skills_adoption_rate,
      round(cnt_slash * 100.0 / if(cnt_sessions > 0, cnt_sessions, 1), 2) as slash_commands_adoption_rate
    FROM totals
  `;

	const currentQuery = summarySQL(buildDateFilter("currentDays"));
	const previousQuery = summarySQL(
		"session_date >= now64(3) - toIntervalDay({previousDays:UInt32}) AND session_date < now64(3) - toIntervalDay({currentDays:UInt32})",
	);

	const [currentData, previousData] = await Promise.all([
		queryClickhouse<SessionSummaryComparisonPeriod>({
			query: currentQuery,
			query_params: baseParams,
		}),
		queryClickhouse<SessionSummaryComparisonPeriod>({
			query: previousQuery,
			query_params: baseParams,
		}),
	]);

	const defaultPeriod: SessionSummaryComparisonPeriod = {
		total_sessions: 0,
		total_interactions: 0,
		total_tokens: 0,
		avg_session_duration_min: 0,
		avg_response_time_sec: 0,
		subagents_adoption_rate: 0,
		skills_adoption_rate: 0,
		slash_commands_adoption_rate: 0,
	};

	// Coalesce nulls from ClickHouse (AVG on 0 rows returns null despite ifNull)
	const coalesce = (
		row: SessionSummaryComparisonPeriod | undefined,
	): SessionSummaryComparisonPeriod => {
		if (!row) return { ...defaultPeriod };
		return Object.fromEntries(
			Object.entries(defaultPeriod).map(([key, def]) => [
				key,
				(row as unknown as Record<string, unknown>)[key] ?? def,
			]),
		) as SessionSummaryComparisonPeriod;
	};
	const current = coalesce(currentData[0]);
	const previous = coalesce(previousData[0]);

	const calculateChange = (curr: number, prev: number) => {
		if (!prev || prev === 0) return 0;
		return ((curr - prev) / prev) * 100;
	};

	const changes = {
		total_sessions: calculateChange(
			current.total_sessions || 0,
			previous.total_sessions || 0,
		),
		avg_session_duration_min: calculateChange(
			current.avg_session_duration_min || 0,
			previous.avg_session_duration_min || 0,
		),
		avg_response_time_sec: calculateChange(
			current.avg_response_time_sec || 0,
			previous.avg_response_time_sec || 0,
		),
	};

	return { current, previous, changes };
}

function getHourLabel(hour: number) {
	if (hour === 0) return "12am";
	if (hour < 12) return `${hour}am`;
	if (hour === 12) return "12pm";
	return `${hour - 12}pm`;
}

async function querySessionHourlyActivity(
	orgId: string,
	days: number,
	timezone: string,
): Promise<SessionHourlyActivityDataPoint[]> {
	return queryClickhouse<SessionHourlyActivityDataPoint>({
		query: `
    WITH hourly_sessions AS (
      SELECT
        toHour(toTimeZone(session_date, {timezone:String})) as hour,
        count() as sessions
      FROM rudel.session_analytics
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
      GROUP BY hour
    )
    SELECT
      hours.number as hour,
      coalesce(hourly_sessions.sessions, 0) as sessions
    FROM numbers(24) AS hours
    LEFT JOIN hourly_sessions ON hourly_sessions.hour = hours.number
    ORDER BY hour ASC
  `,
		query_params: {
			days,
			orgId,
			timezone,
		},
	}).then((rows) =>
		rows.map((row) => ({
			hour: Number(row.hour),
			label: getHourLabel(Number(row.hour)),
			sessions: Number(row.sessions),
		})),
	);
}

export async function getSessionHourlyActivity(
	orgId: string,
	params: {
		days?: number;
		timezone?: string;
	} = {},
): Promise<SessionHourlyActivityDataPoint[]> {
	const days = Number(params.days ?? 30);
	const timezone = params.timezone?.trim();

	try {
		return await querySessionHourlyActivity(orgId, days, timezone || "UTC");
	} catch (error) {
		if (!timezone || timezone === "UTC") {
			throw error;
		}

		return querySessionHourlyActivity(orgId, days, "UTC");
	}
}

/**
 * Get interaction timing distribution
 */
export async function getInteractionTimingDistribution(
	orgId: string,
	params: {
		days?: number;
		user_id?: string;
		project_path?: string;
	} = {},
): Promise<Array<{ bucket: string; count: number; percentage: number }>> {
	const { days = 30, user_id, project_path } = params;
	const d = Number(days);
	const query_params: Record<string, unknown> = {
		days: d,
		orgId,
	};
	const filters: string[] = [];
	addOptionalStringEqFilter(
		filters,
		query_params,
		"user_id",
		"userId",
		user_id,
	);
	addOptionalStringEqFilter(
		filters,
		query_params,
		"project_path",
		"projectPath",
		project_path,
	);
	const filterSql =
		filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : "";
	const repeatedFilterSql =
		filters.length > 0 ? `AND ${filters.join("\n      AND ")}` : "";

	const query = `
    WITH total AS (
      SELECT SUM(total_interactions) as total_count
      FROM rudel.session_analytics
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        ${filterSql}
    )
    SELECT
      'Instant (< 5s)' as bucket,
      SUM(quick_responses) as count,
      round(SUM(quick_responses) * 100.0 / (SELECT total_count FROM total), 2) as percentage
    FROM rudel.session_analytics
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      ${repeatedFilterSql}

    UNION ALL

    SELECT
      'Normal (5-60s)' as bucket,
      SUM(normal_responses) as count,
      round(SUM(normal_responses) * 100.0 / (SELECT total_count FROM total), 2) as percentage
    FROM rudel.session_analytics
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      ${repeatedFilterSql}

    UNION ALL

    SELECT
      'Long Pause (> 5m)' as bucket,
      SUM(long_pauses) as count,
      round(SUM(long_pauses) * 100.0 / (SELECT total_count FROM total), 2) as percentage
    FROM rudel.session_analytics
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      ${repeatedFilterSql}

    ORDER BY count DESC
  `;

	return queryClickhouse<{ bucket: string; count: number; percentage: number }>(
		{
			query,
			query_params,
		},
	);
}

/**
 * Get flexible dimension analysis with optional split-by for stacked charts
 */

// Map metric to SQL expression
const METRIC_EXPRESSIONS: Record<DimensionAnalysisInput["metric"], string> = {
	session_count: "COUNT(*)",
	avg_duration: "round(AVG(actual_duration_min), 2)",
	total_duration: "round(SUM(actual_duration_min) / 60, 2)",
	avg_interactions: "round(AVG(total_interactions), 2)",
	total_interactions: "SUM(total_interactions)",
	avg_response_time: "round(AVG(avg_period_sec), 2)",
	median_response_time: "round(AVG(median_period_sec), 2)",
	avg_tokens: "round(AVG(total_tokens), 0)",
	total_tokens: "SUM(total_tokens)",
	avg_success_score: "round(AVG(success_score), 2)",
	avg_errors: "round(AVG(error_count), 2)",
	total_errors: "SUM(error_count)",
};

const DIMENSION_EXPRESSIONS: Record<
	DimensionAnalysisInput["dimension"],
	string
> = {
	user_id: "user_id",
	project_path: "arrayElement(splitByChar('/', project_path), -1)",
	repository:
		"if(git_remote != '', git_remote, if(package_name != '', package_name, project_path))",
	session_archetype: "session_archetype",
	model_used: "model_used",
	has_commit: "has_commit",
	used_plan_mode: "used_plan_mode",
	used_skills: "if(length(skills) > 0, 1, 0)",
	used_slash_commands: "if(length(slash_commands) > 0, 1, 0)",
	used_subagents: "if(length(subagent_types) > 0, 1, 0)",
};

export async function getSessionDimensionAnalysis(
	orgId: string,
	params: {
		days?: number;
		dimension: DimensionAnalysisInput["dimension"];
		metric: DimensionAnalysisInput["metric"];
		split_by?: DimensionAnalysisInput["dimension"];
		limit?: number;
		user_id?: string;
		project_path?: string;
	},
) {
	const {
		days = 7,
		dimension,
		metric,
		split_by,
		limit = 10,
		user_id,
		project_path,
	} = params;
	const d = Number(days);
	const query_params: Record<string, unknown> = {
		days: d,
		limit: Number(limit),
		orgId,
	};

	const metricExpression = METRIC_EXPRESSIONS[metric];
	const dimensionExpression = DIMENSION_EXPRESSIONS[dimension];
	const splitByExpression = split_by ? DIMENSION_EXPRESSIONS[split_by] : null;

	const filters: string[] = [];
	addOptionalStringEqFilter(
		filters,
		query_params,
		"user_id",
		"userId",
		user_id,
	);
	addOptionalStringEqFilter(
		filters,
		query_params,
		"project_path",
		"projectPath",
		project_path,
	);

	let query: string;

	if (split_by) {
		query = `
      SELECT
        ${dimensionExpression} as dimension_value,
        ${splitByExpression} as split_value,
        ${metricExpression} as metric_value
      FROM rudel.session_analytics
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        ${filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : ""}
      GROUP BY dimension_value, split_value
      ORDER BY metric_value DESC
    `;
	} else {
		query = `
      SELECT
        ${dimensionExpression} as dimension_value,
        ${metricExpression} as metric_value
      FROM rudel.session_analytics
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        ${filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : ""}
      GROUP BY dimension_value
      ORDER BY metric_value DESC
      LIMIT {limit:UInt32}
    `;
	}

	interface DimensionRow {
		dimension_value: string;
		split_value?: string;
		metric_value: number;
	}

	const results = await queryClickhouse<DimensionRow>({
		query,
		query_params,
	});

	if (split_by) {
		const grouped = new Map<string, Record<string, number>>();
		const totalMetric = new Map<string, number>();

		for (const row of results) {
			const dimVal = String(row.dimension_value);
			const splitVal = String(row.split_value);
			const metricVal = Number(row.metric_value);

			if (!grouped.has(dimVal)) {
				grouped.set(dimVal, {});
				totalMetric.set(dimVal, 0);
			}

			const group = grouped.get(dimVal);
			if (group) group[splitVal] = metricVal;
			totalMetric.set(dimVal, (totalMetric.get(dimVal) || 0) + metricVal);
		}

		const finalData = Array.from(grouped.entries())
			.map(([dimension_value, split_values]) => ({
				dimension_value,
				split_values,
				_total: totalMetric.get(dimension_value) || 0,
			}))
			.sort((a, b) => b._total - a._total)
			.slice(0, Number(limit))
			.map(({ dimension_value, split_values }) => ({
				dimension_value,
				split_values,
			}));

		return finalData;
	}

	return results.map((row) => ({
		dimension_value: String(row.dimension_value),
		metric_value: Number(row.metric_value),
	}));
}

/**
 * Get detailed session information including conversation content
 */
export async function getSessionDetail(
	orgId: string,
	sessionId: string,
): Promise<SessionDetail | null> {
	const query = `
    SELECT
      session_id,
      user_id,
      formatDateTime(sa.session_date, '%Y-%m-%dT%H:%i:%SZ') as session_date,
      formatDateTime(sa.last_interaction_date, '%Y-%m-%dT%H:%i:%SZ') as last_interaction_date,
      project_path,
      if(git_remote != '', git_remote, if(package_name != '', package_name, project_path)) as repository,
      content,
      subagents,
      skills,
      slash_commands,
      git_branch,
      git_sha,
      total_tokens,
      input_tokens,
      output_tokens,
      success_score,
      actual_duration_min as duration_min,
      total_interactions,
      session_archetype,
      model_used
    FROM rudel.session_analytics sa
    WHERE session_id = {sessionId:String}
      AND organization_id = {orgId:String}
    ORDER BY ingested_at DESC
    LIMIT 1
  `;

	const results = await queryClickhouse<SessionDetail>({
		query,
		query_params: {
			orgId,
			sessionId,
		},
	});

	const [row] = results;
	if (!row) {
		return null;
	}
	return {
		...row,
		repository: row.repository || null,
		git_branch: row.git_branch || null,
		git_sha: row.git_sha || null,
	};
}
