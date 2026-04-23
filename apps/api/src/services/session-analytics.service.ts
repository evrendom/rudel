import {
	buildClaudeSessionTokenBreakdown,
	type ClaudeSessionTokenBreakdown,
	type ClaudeTokenTimelinePoint,
	type DimensionAnalysisInput,
	deriveClaudeUncachedInputTokens,
	type SessionAnalytics,
	type SessionAnalyticsSummary as SessionAnalyticsSummaryBase,
	type SessionDetail,
	type Source,
} from "@rudel/api-routes";
import {
	addOptionalStringEqFilter,
	buildDateFilter,
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
	cache_read_input_tokens: number;
	cache_creation_input_tokens: number;
	token_accounting_version: number;

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
	total_interactions: number;
	avg_interactions_per_session: number;
	median_response_time_sec: number;
	quick_response_rate: number;
	long_pause_rate: number;
}

interface SessionDetailRaw {
	session_id: string;
	user_id: string;
	session_date: string;
	last_interaction_date: string;
	project_path: string;
	repository: string | null;
	content: string;
	subagents: Record<string, string>;
	skills: string[];
	slash_commands: string[];
	git_branch: string | null;
	git_sha: string | null;
	total_tokens: number;
	input_tokens: number;
	output_tokens: number;
	cache_read_input_tokens: number;
	cache_creation_input_tokens: number;
	parent_input_tokens: number;
	parent_output_tokens: number;
	parent_cache_read_input_tokens: number;
	parent_cache_creation_input_tokens: number;
	parent_total_tokens: number;
	subagent_input_tokens: number;
	subagent_output_tokens: number;
	subagent_cache_read_input_tokens: number;
	subagent_cache_creation_input_tokens: number;
	subagent_total_tokens: number;
	token_accounting_version: number;
	success_score?: number;
	duration_min?: number;
	total_interactions?: number;
	session_archetype?: string;
	model_used?: string;
	source?: Source;
}

/**
 * Get session analytics from the materialized view
 */
export async function getSessionAnalytics(
	orgId: string,
	params: {
		days?: number;
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
	      cache_read_input_tokens,
	      cache_creation_input_tokens,
	      token_accounting_version,
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
    FROM rudel.session_analytics FINAL sa
    WHERE ${buildDateFilter("days", "sa.session_date")}
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
			cache_read_input_tokens: row.cache_read_input_tokens,
			cache_creation_input_tokens: row.cache_creation_input_tokens,
			uncached_input_tokens: deriveClaudeUncachedInputTokens(
				row.input_tokens,
				row.cache_read_input_tokens,
				row.cache_creation_input_tokens,
			),
			token_accounting_version: row.token_accounting_version,
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
        SUM(quick_responses) as sum_quick_responses,
        SUM(long_pauses) as sum_long_pauses,
        ifNull(AVG(actual_duration_min), 0) as avg_duration,
        ifNull(AVG(total_interactions), 0) as avg_interactions,
        ifNull(AVG(avg_period_sec), 0) as avg_response,
        ifNull(AVG(median_period_sec), 0) as med_response,
        countIf(length(subagent_types) > 0) as cnt_subagents,
        countIf(length(skills) > 0) as cnt_skills,
        countIf(length(slash_commands) > 0) as cnt_slash
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        ${filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : ""}
    )
    SELECT
      cnt_sessions as total_sessions,
      sum_interactions as total_interactions,
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
        ifNull(AVG(actual_duration_min), 0) as avg_duration,
        ifNull(AVG(avg_period_sec), 0) as avg_response,
        countIf(length(subagent_types) > 0) as cnt_subagents,
        countIf(length(skills) > 0) as cnt_skills,
        countIf(length(slash_commands) > 0) as cnt_slash
      FROM rudel.session_analytics FINAL
      WHERE ${dateCondition}
        AND organization_id = {orgId:String}
        ${filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : ""}
    )
    SELECT
      cnt_sessions as total_sessions,
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
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        ${filterSql}
    )
    SELECT
      'Instant (< 5s)' as bucket,
      SUM(quick_responses) as count,
      round(SUM(quick_responses) * 100.0 / (SELECT total_count FROM total), 2) as percentage
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      ${repeatedFilterSql}

    UNION ALL

    SELECT
      'Normal (5-60s)' as bucket,
      SUM(normal_responses) as count,
      round(SUM(normal_responses) * 100.0 / (SELECT total_count FROM total), 2) as percentage
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      ${repeatedFilterSql}

    UNION ALL

    SELECT
      'Long Pause (> 5m)' as bucket,
      SUM(long_pauses) as count,
      round(SUM(long_pauses) * 100.0 / (SELECT total_count FROM total), 2) as percentage
    FROM rudel.session_analytics FINAL
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
      FROM rudel.session_analytics FINAL
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
      FROM rudel.session_analytics FINAL
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
      cache_read_input_tokens,
      cache_creation_input_tokens,
      parent_input_tokens,
      parent_output_tokens,
      parent_cache_read_input_tokens,
      parent_cache_creation_input_tokens,
      parent_total_tokens,
      subagent_input_tokens,
      subagent_output_tokens,
      subagent_cache_read_input_tokens,
      subagent_cache_creation_input_tokens,
      subagent_total_tokens,
      token_accounting_version,
      success_score,
      actual_duration_min as duration_min,
      total_interactions,
      session_archetype,
      model_used,
      source
    FROM rudel.session_analytics FINAL sa
    WHERE session_id = {sessionId:String}
      AND organization_id = {orgId:String}
    ORDER BY ingested_at DESC
    LIMIT 1
  `;

	const results = await queryClickhouse<SessionDetailRaw>({
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

	const claudeTokenBreakdown = buildClaudeDetailTokenBreakdown(row);
	const tokenBreakdown = claudeTokenBreakdown ?? buildStoredTokenBreakdown(row);
	const inputTokens = tokenBreakdown.session.input_tokens;
	const outputTokens = tokenBreakdown.session.output_tokens;
	const cacheReadInputTokens = tokenBreakdown.session.cache_read_input_tokens;
	const cacheCreationInputTokens =
		tokenBreakdown.session.cache_creation_input_tokens;
	const uncachedInputTokens = tokenBreakdown.session.uncached_input_tokens;
	const tokenTimeline =
		claudeTokenBreakdown?.timeline ?? ([] as ClaudeTokenTimelinePoint[]);

	return {
		...row,
		repository: row.repository || null,
		git_branch: row.git_branch || null,
		git_sha: row.git_sha || null,
		total_tokens: tokenBreakdown.session.total_tokens,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		cache_read_input_tokens: cacheReadInputTokens,
		cache_creation_input_tokens: cacheCreationInputTokens,
		uncached_input_tokens: uncachedInputTokens,
		parent_input_tokens: tokenBreakdown.parent.input_tokens,
		parent_output_tokens: tokenBreakdown.parent.output_tokens,
		parent_cache_read_input_tokens:
			tokenBreakdown.parent.cache_read_input_tokens,
		parent_cache_creation_input_tokens:
			tokenBreakdown.parent.cache_creation_input_tokens,
		parent_uncached_input_tokens: tokenBreakdown.parent.uncached_input_tokens,
		parent_total_tokens: tokenBreakdown.parent.total_tokens,
		subagent_input_tokens: tokenBreakdown.subagent.input_tokens,
		subagent_output_tokens: tokenBreakdown.subagent.output_tokens,
		subagent_cache_read_input_tokens:
			tokenBreakdown.subagent.cache_read_input_tokens,
		subagent_cache_creation_input_tokens:
			tokenBreakdown.subagent.cache_creation_input_tokens,
		subagent_uncached_input_tokens:
			tokenBreakdown.subagent.uncached_input_tokens,
		subagent_total_tokens: tokenBreakdown.subagent.total_tokens,
		token_accounting_version:
			row.source === "claude_code" ? 2 : row.token_accounting_version,
		token_breakdown: tokenBreakdown,
		token_timeline: tokenTimeline,
	};
}

function buildClaudeDetailTokenBreakdown(
	row: SessionDetailRaw,
): ClaudeSessionTokenBreakdown | null {
	if (row.source !== "claude_code") {
		return null;
	}

	// Session detail recalculates Claude directly from raw transcript content so
	// the detail page is correct even before a historical backfill is run.
	return buildClaudeSessionTokenBreakdown(row.content, row.subagents);
}

function buildStoredTokenBreakdown(
	row: SessionDetailRaw,
): ClaudeSessionTokenBreakdown {
	const parentCacheReadInputTokens = toNumber(
		row.parent_cache_read_input_tokens,
	);
	const parentCacheCreationInputTokens = toNumber(
		row.parent_cache_creation_input_tokens,
	);
	const parentInputTokens = toNumber(row.parent_input_tokens);
	const parentOutputTokens = toNumber(row.parent_output_tokens);
	const subagentCacheReadInputTokens = toNumber(
		row.subagent_cache_read_input_tokens,
	);
	const subagentCacheCreationInputTokens = toNumber(
		row.subagent_cache_creation_input_tokens,
	);
	const subagentInputTokens = toNumber(row.subagent_input_tokens);
	const subagentOutputTokens = toNumber(row.subagent_output_tokens);

	return {
		parent: {
			input_tokens: parentInputTokens,
			uncached_input_tokens: deriveClaudeUncachedInputTokens(
				parentInputTokens,
				parentCacheReadInputTokens,
				parentCacheCreationInputTokens,
			),
			cache_read_input_tokens: parentCacheReadInputTokens,
			cache_creation_input_tokens: parentCacheCreationInputTokens,
			output_tokens: parentOutputTokens,
			total_tokens: toNumber(row.parent_total_tokens),
		},
		subagent: {
			input_tokens: subagentInputTokens,
			uncached_input_tokens: deriveClaudeUncachedInputTokens(
				subagentInputTokens,
				subagentCacheReadInputTokens,
				subagentCacheCreationInputTokens,
			),
			cache_read_input_tokens: subagentCacheReadInputTokens,
			cache_creation_input_tokens: subagentCacheCreationInputTokens,
			output_tokens: subagentOutputTokens,
			total_tokens: toNumber(row.subagent_total_tokens),
		},
		session: {
			input_tokens: toNumber(row.input_tokens),
			uncached_input_tokens: deriveClaudeUncachedInputTokens(
				toNumber(row.input_tokens),
				toNumber(row.cache_read_input_tokens),
				toNumber(row.cache_creation_input_tokens),
			),
			cache_read_input_tokens: toNumber(row.cache_read_input_tokens),
			cache_creation_input_tokens: toNumber(row.cache_creation_input_tokens),
			output_tokens: toNumber(row.output_tokens),
			total_tokens: toNumber(row.total_tokens),
		},
		timeline: [],
	};
}

function toNumber(value: number | string | undefined): number {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	return 0;
}
