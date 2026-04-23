import type { ErrorTrendDataPoint, RecurringError } from "@rudel/api-routes";
import { buildDateFilter, queryClickhouse } from "../clickhouse.js";

export interface CrossDeveloperError {
	error_pattern: string;
	developers_affected: number;
	total_occurrences: number;
	affected_user_ids: string[];
	avg_session_duration_min: number;
}

/**
 * Get top recurring errors across all sessions
 */
export async function getTopRecurringErrors(
	orgId: string,
	params: { days?: number; min_occurrences?: number; limit?: number } = {},
): Promise<RecurringError[]> {
	const { days = 7, min_occurrences = 2, limit = 15 } = params;
	const d = Number(days);
	const query_params = {
		days: d,
		minOccurrences: Number(min_occurrences),
		limit: Number(limit),
		orgId,
	};

	const query = `
    WITH error_sessions AS (
      SELECT
        session_id,
        user_id,
        session_date,
        if(git_remote != '', git_remote, if(package_name != '', package_name, project_path)) as repository,
        content,
        CASE
          WHEN content ILIKE '%Error:%' THEN extractAll(content, '([A-Z][a-zA-Z]+Error):')[1]
          WHEN content ILIKE '%Exception:%' THEN extractAll(content, '([A-Z][a-zA-Z]+Exception):')[1]
          WHEN content ILIKE '%failed%' THEN 'OperationFailed'
          WHEN content ILIKE '%timeout%' THEN 'Timeout'
          WHEN content ILIKE '%not found%' THEN 'NotFound'
          ELSE 'UnknownError'
        END as error_pattern
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        AND (
          content ILIKE '%error%' OR
          content ILIKE '%exception%' OR
          content ILIKE '%failed%' OR
          content ILIKE '%timeout%'
        )
    )
    SELECT
      error_pattern,
      COUNT(*) as occurrences,
      uniq(session_id) as affected_sessions,
      uniq(user_id) as affected_users,
      max(session_date) as last_seen,
      CASE
        WHEN COUNT(*) >= 10 THEN 'high'
        WHEN COUNT(*) >= 5 THEN 'medium'
        ELSE 'low'
      END as severity,
      groupUniqArray(repository) as repositories
    FROM error_sessions
    WHERE error_pattern != ''
    GROUP BY error_pattern
    HAVING occurrences >= {minOccurrences:UInt32}
    ORDER BY occurrences DESC
    LIMIT {limit:UInt32}
  `;

	return queryClickhouse<RecurringError>({
		query,
		query_params,
	});
}

/**
 * Get errors affecting multiple developers
 */
export async function getCrossDeveloperErrors(
	orgId: string,
	params: { days?: number; min_developers?: number; limit?: number } = {},
): Promise<CrossDeveloperError[]> {
	const { days = 7, min_developers = 2, limit = 10 } = params;
	const d = Number(days);
	const query_params = {
		days: d,
		minDevelopers: Number(min_developers),
		limit: Number(limit),
		orgId,
	};

	const query = `
    SELECT
      CASE
        WHEN content ILIKE '%Error:%' THEN 'TypeError'
        WHEN content ILIKE '%Exception:%' THEN 'Exception'
        WHEN content ILIKE '%failed%' THEN 'OperationFailed'
        WHEN content ILIKE '%timeout%' THEN 'Timeout'
        ELSE 'UnknownError'
      END as error_pattern,
      uniq(user_id) as developers_affected,
      COUNT(*) as total_occurrences,
      groupUniqArray(user_id) as affected_user_ids,
      round(AVG(actual_duration_min), 2) as avg_session_duration_min
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (
        content ILIKE '%error%' OR
        content ILIKE '%exception%' OR
        content ILIKE '%failed%' OR
        content ILIKE '%timeout%'
      )
    GROUP BY error_pattern
    HAVING developers_affected >= {minDevelopers:UInt32}
    ORDER BY developers_affected DESC, total_occurrences DESC
    LIMIT {limit:UInt32}
  `;

	return queryClickhouse<CrossDeveloperError>({
		query,
		query_params,
	});
}

/**
 * Get error metrics trends over time with various split options
 */
export async function getErrorTrends(
	orgId: string,
	params: {
		start_date: string;
		end_date: string;
		split_by: "project_path" | "user_id" | "model";
	},
): Promise<ErrorTrendDataPoint[]> {
	const { start_date, end_date, split_by } = params;
	const query_params = {
		startDate: start_date,
		endDate: end_date,
		orgId,
	};

	if (split_by === "project_path" || split_by === "model") {
		const dimensionExpr =
			split_by === "project_path" ? "sa.project_path" : "sa.model_used";
		const query = `
      WITH error_sessions AS (
        SELECT
          toDate(sa.session_date) as date,
          sa.session_id,
          sa.user_id,
          ${dimensionExpr} as dimension_value,
          sa.error_count
        FROM rudel.session_analytics FINAL sa
        WHERE sa.session_date >= toDateTime64({startDate:String}, 3)
          AND sa.session_date < toDateTime64({endDate:String}, 3)
          AND sa.organization_id = {orgId:String}
          AND sa.error_count > 0
      ),
      daily_metrics AS (
        SELECT
          date,
          dimension_value as dimension,
          COUNT(DISTINCT session_id) as session_count,
          SUM(error_count) as total_errors,
          COUNT(DISTINCT user_id) as interaction_count
        FROM error_sessions
        WHERE dimension IS NOT NULL AND dimension != '' AND dimension != 'unknown'
        GROUP BY date, dimension
      )
      SELECT
        date,
        dimension,
        round(total_errors / GREATEST(interaction_count, 1), 2) as avg_errors_per_interaction,
        round(total_errors / GREATEST(session_count, 1), 2) as avg_errors_per_session,
        total_errors
      FROM daily_metrics
      ORDER BY date, dimension
    `;

		return queryClickhouse<ErrorTrendDataPoint>({
			query,
			query_params,
		});
	}

	// For user_id split
	const dimension_field = "user_id";

	const query = `
    WITH error_sessions AS (
      SELECT
        toDate(session_date) as date,
        session_id,
        user_id,
        ${dimension_field} as dimension_value,
        length(splitByRegexp('\\\\n', content)) as error_count
      FROM rudel.session_analytics FINAL
      WHERE session_date >= toDateTime64({startDate:String}, 3)
        AND session_date < toDateTime64({endDate:String}, 3)
        AND organization_id = {orgId:String}
        AND (
          content ILIKE '%error%' OR
          content ILIKE '%exception%' OR
          content ILIKE '%failed%' OR
          content ILIKE '%timeout%'
        )
    ),
    daily_metrics AS (
      SELECT
        date,
        dimension_value as dimension,
        COUNT(DISTINCT session_id) as session_count,
        SUM(error_count) as total_errors,
        COUNT(DISTINCT user_id) as interaction_count
      FROM error_sessions
      WHERE dimension IS NOT NULL AND dimension != ''
      GROUP BY date, dimension
    )
    SELECT
      date,
      dimension,
      round(total_errors / GREATEST(interaction_count, 1), 2) as avg_errors_per_interaction,
      round(total_errors / GREATEST(session_count, 1), 2) as avg_errors_per_session,
      total_errors
    FROM daily_metrics
    ORDER BY date, dimension
  `;

	return queryClickhouse<ErrorTrendDataPoint>({
		query,
		query_params,
	});
}
