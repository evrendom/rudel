import {
	type DimensionAnalysisInput,
	resolveRepoIdentity,
	type SessionAnalytics,
	type SessionAnalyticsSummary as SessionAnalyticsSummaryBase,
	type SessionDetail,
	type Source,
} from "@rudel/api-routes";
import {
	addOptionalStringEqFilter,
	buildDateFilter,
	buildInclusiveDateRangeFilter,
	buildLatestRawSessionContentSql,
	queryClickhouse,
} from "../clickhouse.js";
import { getUsageAnalyticsQueryContext } from "./usage-event-analytics.service.js";

export interface SessionAnalyticsRaw {
	source: Source;
	session_id: string;
	user_id: string;
	session_date: string;
	project_path: string;
	organization_id: string;
	git_remote: string;
	package_name: string;

	// Interaction timing metrics
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
	estimated_cost: number | null;

	// Git activity
	git_sha: string;
	git_branch: string;
	has_commit: number;

	// Feature arrays
	subagent_types: string[];
	skills: string[];
	slash_commands: string[];

	// Success metrics
	success_score: number;

	// Effectiveness correlation factors
	error_count: number;
	model_used: string;
	used_plan_mode: number;

	// Persisted language-signal counts
	member_swears: number;
	member_apologies: number;
	member_positive: number;
	model_swears: number;
	model_apologies: number;
	model_positive: number;
}

export type SessionAnalyticsSummary = SessionAnalyticsSummaryBase;

export function mapSessionAnalyticsRow(
	row: SessionAnalyticsRaw,
): SessionAnalytics {
	const repositoryIdentity = resolveRepoIdentity({
		gitRemote: row.git_remote || null,
		packageName: row.package_name || null,
		projectPath: row.project_path,
	});

	return {
		source: row.source,
		session_id: row.session_id,
		user_id: row.user_id,
		session_date: row.session_date,
		project_path: row.project_path,
		repository: repositoryIdentity.repoLabel,
		worktree: repositoryIdentity.worktree,
		git_remote: row.git_remote || undefined,
		git_branch: row.git_branch || null,
		duration_min: row.actual_duration_min,
		total_tokens: row.total_tokens,
		input_tokens: row.input_tokens,
		output_tokens: row.output_tokens,
		estimated_cost: row.estimated_cost,
		success_score: row.success_score,
		avg_period_sec: row.avg_period_sec,
		subagent_types: row.subagent_types,
		skills: row.skills,
		slash_commands: row.slash_commands,
		has_commit: row.has_commit > 0,
		model_used: row.model_used,
		used_plan_mode: row.used_plan_mode > 0,
		member_swears: row.member_swears,
		member_apologies: row.member_apologies,
		member_positive: row.member_positive,
		model_swears: row.model_swears,
		model_apologies: row.model_apologies,
		model_positive: row.model_positive,
	};
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
		source?: string;
		limit?: number;
		offset?: number;
		sort_by?: "date" | "duration";
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
		source,
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
	// An explicit window wins over the rolling `days` lookback so a range that
	// does not end today returns that window rather than the last N days.
	const hasAbsoluteRange = Boolean(start_date && end_date);

	if (hasAbsoluteRange) {
		query_params.startDate = start_date;
		query_params.endDate = end_date;
	}

	const dateFilter = hasAbsoluteRange
		? buildInclusiveDateRangeFilter("startDate", "endDate", "sa.session_date")
		: buildDateFilter("days", "sa.session_date");
	const signalDateFilter = hasAbsoluteRange
		? buildInclusiveDateRangeFilter(
				"startDate",
				"endDate",
				"signal_rows.session_date",
			)
		: buildDateFilter("days", "signal_rows.session_date");
	const filters: string[] = [];
	addOptionalStringEqFilter(
		filters,
		query_params,
		"sa.user_id",
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
	addOptionalStringEqFilter(
		filters,
		query_params,
		"sa.source",
		"source",
		source,
	);

	const sortColumn =
		sort_by === "duration" ? "actual_duration_min" : "sa.session_date";
	const sortDirection = sort_order === "asc" ? "ASC" : "DESC";
	const usage = await getUsageAnalyticsQueryContext(orgId, {
		sourceParam: source ? "source" : undefined,
		userIdParam: user_id ? "userId" : undefined,
	});
	const estimatedCostSql = "sa.estimated_cost";

	const query = `
	WITH ${usage.cteDefinitions},
	language_signal_counts AS (
		SELECT
			organization_id,
			session_date,
			session_id,
			user_id,
			source,
			argMax(member_swears, scanned_at) AS member_swears,
			argMax(member_apologies, scanned_at) AS member_apologies,
			argMax(member_positive, scanned_at) AS member_positive,
			argMax(model_swears, scanned_at) AS model_swears,
			argMax(model_apologies, scanned_at) AS model_apologies,
			argMax(model_positive, scanned_at) AS model_positive
		FROM rudel.session_language_signals AS signal_rows
		WHERE signal_rows.organization_id = {orgId:String}
			AND ${signalDateFilter}
		GROUP BY organization_id, session_date, session_id, user_id, source
	)
    SELECT
      sa.source AS source,
	  sa.session_id AS session_id,
	  sa.user_id AS user_id,
      formatDateTime(sa.session_date, '%Y-%m-%dT%H:%i:%SZ') as session_date,
      project_path,
      sa.organization_id AS organization_id,
      git_remote,
      package_name,
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
	  ${estimatedCostSql} AS estimated_cost,
      git_sha,
      git_branch,
      has_commit,
      subagent_types,
      skills,
      slash_commands,
      success_score,
      error_count,
      model_used,
      used_plan_mode,
	  signals.member_swears AS member_swears,
	  signals.member_apologies AS member_apologies,
	  signals.member_positive AS member_positive,
	  signals.model_swears AS model_swears,
	  signals.model_apologies AS model_apologies,
	  signals.model_positive AS model_positive
    FROM ${usage.sessionsRelation} AS sa
	LEFT ANY JOIN language_signal_counts AS signals
		ON signals.organization_id = sa.organization_id
		AND signals.session_date = sa.session_date
		AND signals.session_id = sa.session_id
		AND signals.user_id = sa.user_id
		AND signals.source = sa.source
    WHERE ${dateFilter}
      AND sa.organization_id = {orgId:String}
      ${filters.length > 0 ? `AND ${filters.join("\n      AND ")}` : ""}
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

	const raw = await queryClickhouse<SessionAnalyticsRaw>({
		clickhouse_settings: { join_use_nulls: 0 },
		query,
		query_params,
	});
	return raw.map(mapSessionAnalyticsRow);
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
        ifNull(AVG(actual_duration_min), 0) as avg_duration,
        ifNull(AVG(avg_period_sec), 0) as avg_response,
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
      ifNull(round(avg_duration, 2), 0) as avg_session_duration_min,
      ifNull(round(avg_response, 2), 0) as avg_response_time_sec,
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
		avg_session_duration_min: 0,
		avg_response_time_sec: 0,
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
 * Get flexible dimension analysis with optional split-by for stacked charts
 */

// Map metric to SQL expression
const METRIC_EXPRESSIONS: Record<DimensionAnalysisInput["metric"], string> = {
	session_count: "COUNT(*)",
	avg_duration: "round(AVG(actual_duration_min), 2)",
	total_duration: "round(SUM(actual_duration_min) / 60, 2)",
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
	const usage = await getUsageAnalyticsQueryContext(
		orgId,
		user_id ? { userIdParam: "userId" } : {},
	);

	if (split_by) {
		query = `
	  WITH ${usage.cteDefinitions}
      SELECT
        ${dimensionExpression} as dimension_value,
        ${splitByExpression} as split_value,
        ${metricExpression} as metric_value
      FROM ${usage.sessionsRelation} AS sa
      WHERE ${buildDateFilter("days")}
        AND sa.organization_id = {orgId:String}
        ${filters.length > 0 ? `AND ${filters.join("\n        AND ")}` : ""}
      GROUP BY dimension_value, split_value
      ORDER BY metric_value DESC
    `;
	} else {
		query = `
	  WITH ${usage.cteDefinitions}
      SELECT
        ${dimensionExpression} as dimension_value,
        ${metricExpression} as metric_value
      FROM ${usage.sessionsRelation} AS sa
      WHERE ${buildDateFilter("days")}
        AND sa.organization_id = {orgId:String}
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
	ownerId: string,
): Promise<SessionDetail | null> {
	const usage = await getUsageAnalyticsQueryContext(orgId, {
		sessionIdParam: "sessionId",
		userIdParam: "ownerId",
	});
	const estimatedCostSql = "sa.estimated_cost";
	const metadataQuery = `
	WITH ${usage.cteDefinitions}
    SELECT
      sa.session_id,
      sa.user_id,
	  sa.source,
	  sa.session_date AS raw_session_date,
      formatDateTime(sa.session_date, '%Y-%m-%dT%H:%i:%SZ') as session_date,
      formatDateTime(sa.last_interaction_date, '%Y-%m-%dT%H:%i:%SZ') as last_interaction_date,
      sa.project_path,
      if(sa.git_remote != '', sa.git_remote, if(sa.package_name != '', sa.package_name, sa.project_path)) as repository,
      sa.skills,
      sa.slash_commands,
      sa.git_branch,
      sa.git_sha,
      sa.total_tokens,
      sa.input_tokens,
      sa.output_tokens,
	  ${estimatedCostSql} AS estimated_cost,
      sa.success_score,
      dateDiff('second', sa.session_date, sa.last_interaction_date) / 60.0 as duration_min,
      sa.model_used
	FROM ${usage.sessionsRelation} AS sa
    WHERE sa.organization_id = {orgId:String}
      AND sa.session_id = {sessionId:String}
      AND sa.user_id = {ownerId:String}
    ORDER BY sa.ingested_at DESC
    LIMIT 1
  `;

	type SessionDetailMetadata = Omit<SessionDetail, "content" | "subagents"> & {
		raw_session_date: string;
		source: string;
	};
	const metadataResults = await queryClickhouse<SessionDetailMetadata>({
		query: metadataQuery,
		query_params: {
			orgId,
			ownerId,
			sessionId,
			userId: ownerId,
		},
	});

	const [metadata] = metadataResults;
	if (!metadata) {
		return null;
	}

	const contentResults = await queryClickhouse<
		Pick<SessionDetail, "content" | "subagents">
	>({
		query: `
			WITH latest_raw_session_content AS (
				${buildLatestRawSessionContentSql({
					sessionDate: true,
					sessionId: true,
					source: true,
					userId: true,
				})}
			)
			SELECT content, subagents
			FROM latest_raw_session_content
			WHERE source = {source:String}
			LIMIT 1
		`,
		query_params: {
			orgId,
			sessionDate: metadata.raw_session_date,
			sessionId,
			source: metadata.source,
			userId: ownerId,
		},
	});
	const [content] = contentResults;
	if (!content) return null;

	const {
		raw_session_date: _rawSessionDate,
		source: _source,
		...publicMetadata
	} = metadata;
	return {
		...publicMetadata,
		...content,
		repository: metadata.repository || null,
		git_branch: metadata.git_branch || null,
		git_sha: metadata.git_sha || null,
	};
}
