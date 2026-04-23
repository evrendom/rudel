import type {
	DeveloperDetails as DeveloperDetailsBase,
	DeveloperError,
	DeveloperFeatureUsage,
	DeveloperProject as DeveloperProjectBase,
	DeveloperSession as DeveloperSessionBase,
	DeveloperSummary as DeveloperSummaryBase,
	DeveloperTimeline,
	DeveloperTrendDataPoint,
} from "@rudel/api-routes";
import {
	addOptionalStringEqFilter,
	buildDateFilter,
	queryClickhouse,
} from "../clickhouse.js";

export interface DeveloperSummary extends DeveloperSummaryBase {
	username?: string;
}

export interface DeveloperDetails extends DeveloperDetailsBase {
	username?: string;
}

export interface DeveloperSession extends DeveloperSessionBase {
	input_tokens: number;
	output_tokens: number;
}

export type DeveloperProject = DeveloperProjectBase;

export interface DeveloperProjectTimeline {
	date: string;
	project_path: string;
	sessions: number;
	total_duration_min: number;
	total_tokens: number;
}

/**
 * Get list of all developers with summary stats
 */
export async function getDeveloperList(
	orgId: string,
	days = 30,
): Promise<DeveloperSummary[]> {
	const d = Number(days);
	const query_params = {
		currentDays: d,
		previousDays: d * 2,
		orgId,
	};

	const query = `
    WITH current_period AS (
      SELECT
        user_id,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT toDate(session_date)) as active_days,
        SUM(ifNull(input_tokens, 0)) as input_tokens_sum,
        SUM(ifNull(output_tokens, 0)) as output_tokens_sum,
        SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
        round(SUM(actual_duration_min), 2) as total_duration_min,
        round(AVG(actual_duration_min), 2) as avg_session_duration_min,
        toString(max(session_date)) as last_active_date,
        round(AVG(success_score), 2) as success_rate
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("currentDays")}
        AND organization_id = {orgId:String}
      GROUP BY user_id
    ),
    previous_period AS (
      SELECT
        user_id,
        round(AVG(success_score), 2) as prev_success_rate
      FROM rudel.session_analytics FINAL
      WHERE session_date >= now64(3) - toIntervalDay({previousDays:UInt32})
        AND session_date < now64(3) - toIntervalDay({currentDays:UInt32})
        AND organization_id = {orgId:String}
      GROUP BY user_id
    )
    SELECT
      c.user_id,
      c.total_sessions,
      c.active_days,
      c.total_tokens,
      c.input_tokens_sum as input_tokens,
      c.output_tokens_sum as output_tokens,
      c.total_duration_min,
      c.avg_session_duration_min,
      c.last_active_date,
      c.success_rate,
      round((c.output_tokens_sum * 0.000015) + (c.input_tokens_sum * 0.000003), 4) as cost,
      round(c.success_rate - ifNull(p.prev_success_rate, c.success_rate), 2) as success_rate_trend
    FROM current_period c
    LEFT JOIN previous_period p ON c.user_id = p.user_id
    ORDER BY c.total_sessions DESC
  `;

	return queryClickhouse<DeveloperSummary>({
		query,
		query_params,
	});
}

/**
 * Get detailed metrics for a specific developer
 */
export async function getDeveloperDetails(
	orgId: string,
	userId: string,
	days = 30,
): Promise<DeveloperDetails | null> {
	const d = Number(days);
	const query_params = {
		currentDays: d,
		previousDays: d * 2,
		orgId,
		userId,
	};

	const query = `
    WITH current_period AS (
      SELECT
        user_id,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT toDate(session_date)) as active_days,
        SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
        SUM(ifNull(input_tokens, 0)) as input_tokens_sum,
        SUM(ifNull(output_tokens, 0)) as output_tokens_sum,
        round(SUM(actual_duration_min), 2) as total_duration_min,
        round(AVG(actual_duration_min), 2) as avg_session_duration_min,
        toString(max(session_date)) as last_active_date,
        round(AVG(success_score), 2) as success_rate,
        COUNT(DISTINCT project_path) as distinct_projects,
        SUM(error_count) as error_count
      FROM rudel.session_analytics FINAL
      WHERE user_id = {userId:String}
        AND ${buildDateFilter("currentDays")}
        AND organization_id = {orgId:String}
      GROUP BY user_id
    ),
    previous_period AS (
      SELECT
        user_id,
        round(AVG(success_score), 2) as prev_success_rate
      FROM rudel.session_analytics FINAL
      WHERE user_id = {userId:String}
        AND session_date >= now64(3) - toIntervalDay({previousDays:UInt32})
        AND session_date < now64(3) - toIntervalDay({currentDays:UInt32})
        AND organization_id = {orgId:String}
      GROUP BY user_id
    )
    SELECT
      c.user_id,
      c.total_sessions,
      c.active_days,
      c.total_tokens,
      c.input_tokens_sum as input_tokens,
      c.output_tokens_sum as output_tokens,
      c.total_duration_min,
      c.avg_session_duration_min,
      c.last_active_date,
      c.success_rate,
      round((c.output_tokens_sum * 0.000015) + (c.input_tokens_sum * 0.000003), 4) as cost,
      round(c.success_rate - ifNull(p.prev_success_rate, c.success_rate), 2) as success_rate_trend,
      c.distinct_projects,
      c.error_count
    FROM current_period c
    LEFT JOIN previous_period p ON c.user_id = p.user_id
  `;

	const results = await queryClickhouse<DeveloperDetails>({
		query,
		query_params,
	});
	const [first] = results;
	if (!first) return null;

	return first;
}

/**
 * Get session history for a developer with filtering
 */
export async function getDeveloperSessions(
	orgId: string,
	userId: string,
	params: {
		days?: number;
		project_path?: string;
		outcome?: "success" | "all";
		limit?: number;
		offset?: number;
		sort_by?: "date" | "duration" | "tokens";
		sort_order?: "asc" | "desc";
	} = {},
): Promise<DeveloperSession[]> {
	const {
		days = 30,
		project_path,
		outcome,
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
		userId,
	};
	const filters: string[] = [];
	addOptionalStringEqFilter(
		filters,
		query_params,
		"project_path",
		"projectPath",
		project_path,
	);
	if (outcome === "success") {
		filters.push("actual_duration_min BETWEEN 5 AND 240");
	}

	const sortColumn =
		sort_by === "duration"
			? "actual_duration_min"
			: sort_by === "tokens"
				? "total_tokens"
				: "session_date";
	const sortDirection = sort_order === "asc" ? "ASC" : "DESC";

	const query = `
    SELECT
      session_id,
      session_date,
      project_path,
      git_remote,
      package_name,
      actual_duration_min as duration_min,
      ifNull(input_tokens, 0) as input_tokens,
      ifNull(output_tokens, 0) as output_tokens,
      ifNull(input_tokens, 0) + ifNull(output_tokens, 0) as total_tokens,
      length(subagent_types) > 0 as has_subagents,
      length(skills) > 0 as has_skills,
      length(slash_commands) > 0 as has_slash_commands,
      error_count > 0 as has_errors,
      actual_duration_min BETWEEN 5 AND 240 as likely_success
    FROM rudel.session_analytics FINAL
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      ${filters.length > 0 ? `AND ${filters.join("\n      AND ")}` : ""}
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

	const results = await queryClickhouse<DeveloperSession>({
		query,
		query_params,
	});

	return results.map((session) => ({
		...session,
		has_subagents: Boolean(session.has_subagents),
		has_skills: Boolean(session.has_skills),
		has_slash_commands: Boolean(session.has_slash_commands),
		has_errors: Boolean(session.has_errors),
		likely_success: Boolean(session.likely_success),
	}));
}

/**
 * Get projects worked on by a developer
 */
export async function getDeveloperProjects(
	orgId: string,
	userId: string,
	days = 30,
): Promise<DeveloperProject[]> {
	const d = Number(days);

	const query = `
    SELECT
      project_path,
      any(git_remote) as git_remote,
      any(package_name) as package_name,
      COUNT(*) as sessions,
      round(SUM(actual_duration_min), 2) as total_duration_min,
      SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
      toString(min(session_date)) as first_session,
      toString(max(session_date)) as last_session
    FROM rudel.session_analytics FINAL
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND project_path != ''
    GROUP BY project_path
    ORDER BY sessions DESC
  `;

	return queryClickhouse<DeveloperProject>({
		query,
		query_params: {
			days: d,
			orgId,
			userId,
		},
	});
}

/**
 * Get errors encountered by a developer
 */
export async function getDeveloperErrors(
	orgId: string,
	userId: string,
	days = 30,
): Promise<DeveloperError[]> {
	const d = Number(days);

	const query = `
    WITH error_extracts AS (
      SELECT
        session_id,
        session_date,
        CASE
          WHEN content LIKE '%OperationFailed%' THEN 'OperationFailed'
          WHEN content LIKE '%UnknownError%' THEN 'UnknownError'
          WHEN content LIKE '%ORPCError%' THEN 'ORPCError'
          WHEN content LIKE '%TimeoutError%' THEN 'TimeoutError'
          WHEN content LIKE '%TypeError%' THEN 'TypeError'
          WHEN content LIKE '%ReferenceError%' THEN 'ReferenceError'
          WHEN content LIKE '%Error:%' OR content LIKE '%error:%' THEN 'GenericError'
          ELSE NULL
        END as error_pattern
      FROM rudel.session_analytics FINAL
      WHERE user_id = {userId:String}
        AND ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        AND (content LIKE '%Error:%' OR content LIKE '%error:%')
    )
    SELECT
      error_pattern,
      COUNT(*) as occurrences,
      toString(min(session_date)) as first_seen,
      toString(max(session_date)) as last_seen,
      COUNT(DISTINCT session_id) as sessions_affected
    FROM error_extracts
    WHERE error_pattern IS NOT NULL
    GROUP BY error_pattern
    ORDER BY occurrences DESC
    LIMIT 20
  `;

	return queryClickhouse<DeveloperError>({
		query,
		query_params: {
			days: d,
			orgId,
			userId,
		},
	});
}

/**
 * Get daily activity timeline for a developer
 */
export async function getDeveloperTimeline(
	orgId: string,
	userId: string,
	days = 30,
): Promise<DeveloperTimeline[]> {
	const d = Number(days);

	const query = `
    SELECT
      toString(toDate(session_date)) as date,
      COUNT(*) as sessions,
      round(SUM(actual_duration_min), 2) as total_duration_min,
      SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
      COUNT(DISTINCT project_path) as projects_worked,
      round(AVG(success_score), 2) as avg_success_rate
    FROM rudel.session_analytics FINAL
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
    GROUP BY toDate(session_date)
    ORDER BY date ASC
  `;

	return queryClickhouse<DeveloperTimeline>({
		query,
		query_params: {
			days: d,
			orgId,
			userId,
		},
	});
}

/**
 * Get feature usage stats for a developer
 */
export async function getDeveloperFeatureUsage(
	orgId: string,
	userId: string,
	days = 30,
): Promise<DeveloperFeatureUsage> {
	const d = Number(days);
	const query_params = {
		days: d,
		orgId,
		userId,
	};

	const adoptionQuery = `
    SELECT
      COUNT(*) as total_sessions,
      countIf(length(subagent_types) > 0) as subagents_sessions,
      countIf(length(skills) > 0) as skills_sessions,
      countIf(length(slash_commands) > 0) as slash_commands_sessions
    FROM rudel.session_analytics FINAL
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
  `;

	const topSubagentsQuery = `
    SELECT val as name, count() as count
    FROM rudel.session_analytics FINAL
    ARRAY JOIN subagent_types as val
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND val != ''
    GROUP BY val
    ORDER BY count DESC
    LIMIT 10
  `;

	const topSkillsQuery = `
    SELECT val as name, count() as count
    FROM rudel.session_analytics FINAL
    ARRAY JOIN skills as val
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND val != ''
    GROUP BY val
    ORDER BY count DESC
    LIMIT 10
  `;

	const topSlashCommandsQuery = `
    SELECT val as name, count() as count
    FROM rudel.session_analytics FINAL
    ARRAY JOIN slash_commands as val
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND val != ''
    GROUP BY val
    ORDER BY count DESC
    LIMIT 10
  `;

	const [adoptionResults, topSubagents, topSkills, topSlashCommands] =
		await Promise.all([
			queryClickhouse<{
				total_sessions: number;
				subagents_sessions: number;
				skills_sessions: number;
				slash_commands_sessions: number;
			}>({
				query: adoptionQuery,
				query_params,
			}),
			queryClickhouse<{ name: string; count: number }>({
				query: topSubagentsQuery,
				query_params,
			}),
			queryClickhouse<{ name: string; count: number }>({
				query: topSkillsQuery,
				query_params,
			}),
			queryClickhouse<{ name: string; count: number }>({
				query: topSlashCommandsQuery,
				query_params,
			}),
		]);

	if (adoptionResults.length === 0) {
		return {
			subagents_adoption_rate: 0,
			skills_adoption_rate: 0,
			slash_commands_adoption_rate: 0,
			top_subagents: [],
			top_skills: [],
			top_slash_commands: [],
		};
	}

	const [stats] = adoptionResults;
	if (!stats)
		return {
			subagents_adoption_rate: 0,
			skills_adoption_rate: 0,
			slash_commands_adoption_rate: 0,
			top_subagents: [],
			top_skills: [],
			top_slash_commands: [],
		};
	return {
		subagents_adoption_rate:
			stats.total_sessions > 0
				? (stats.subagents_sessions / stats.total_sessions) * 100
				: 0,
		skills_adoption_rate:
			stats.total_sessions > 0
				? (stats.skills_sessions / stats.total_sessions) * 100
				: 0,
		slash_commands_adoption_rate:
			stats.total_sessions > 0
				? (stats.slash_commands_sessions / stats.total_sessions) * 100
				: 0,
		top_subagents: topSubagents,
		top_skills: topSkills,
		top_slash_commands: topSlashCommands,
	};
}

/**
 * Get developer trend data for time series charts (split by developer)
 */
export async function getDeveloperTrends(
	orgId: string,
	days = 30,
	groupBy: "day" | "week" = "day",
): Promise<DeveloperTrendDataPoint[]> {
	const d = Number(days);

	const dateFunc =
		groupBy === "week"
			? "toMonday(toDate(session_date))"
			: "toDate(session_date)";

	const query = `
    SELECT
      toString(${dateFunc}) as date,
      user_id,
      COUNT(*) as sessions,
      round(SUM(actual_duration_min) / 60, 2) as total_hours,
      SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
      round(AVG(success_score), 2) as avg_success_rate
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
    GROUP BY date, user_id
    ORDER BY date ASC, user_id ASC
  `;

	return queryClickhouse<DeveloperTrendDataPoint>({
		query,
		query_params: {
			days: d,
			orgId,
		},
	});
}

/**
 * Get project activity over time for a developer (time series)
 */
export async function getDeveloperProjectTimeline(
	orgId: string,
	userId: string,
	days = 30,
): Promise<DeveloperProjectTimeline[]> {
	const d = Number(days);

	const query = `
    SELECT
      toString(toDate(session_date)) as date,
      project_path,
      COUNT(*) as sessions,
      round(SUM(actual_duration_min), 2) as total_duration_min,
      SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens
    FROM rudel.session_analytics FINAL
    WHERE user_id = {userId:String}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND project_path != ''
    GROUP BY toDate(session_date), project_path
    ORDER BY date ASC, project_path ASC
  `;

	return queryClickhouse<DeveloperProjectTimeline>({
		query,
		query_params: {
			days: d,
			orgId,
			userId,
		},
	});
}
