import type {
	ErrorsDashboard,
	ErrorTrendDataPoint,
	RecurringError,
} from "@rudel/api-routes";
import {
	buildDateFilter,
	buildInclusiveDateRangeFilter,
	queryClickhouse,
} from "../clickhouse.js";

export interface CrossDeveloperError {
	error_pattern: string;
	developers_affected: number;
	total_occurrences: number;
	affected_user_ids: string[];
	avg_session_duration_min: number;
}

const ERROR_CONTENT_FILTER = `
      (
        content ILIKE '%error%' OR
        content ILIKE '%exception%' OR
        content ILIKE '%failed%' OR
        content ILIKE '%timeout%'
      )
`;

const ERROR_PATTERN_SQL = `
        CASE
          WHEN content ILIKE '%Error:%' THEN extractAll(content, '([A-Z][a-zA-Z]+Error):')[1]
          WHEN content ILIKE '%Exception:%' THEN extractAll(content, '([A-Z][a-zA-Z]+Exception):')[1]
          WHEN content ILIKE '%failed%' THEN 'OperationFailed'
          WHEN content ILIKE '%timeout%' THEN 'Timeout'
          WHEN content ILIKE '%not found%' THEN 'NotFound'
          ELSE 'UnknownError'
        END
`;

function buildRecurringErrorsQuery(dateFilter: string) {
	return `
    WITH error_sessions AS (
      SELECT
        session_id,
        user_id,
        session_date,
        if(git_remote != '', git_remote, if(package_name != '', package_name, project_path)) as repository,
        ${ERROR_PATTERN_SQL} as error_pattern
      FROM rudel.session_analytics
      WHERE ${dateFilter}
        AND organization_id = {orgId:String}
        AND ${ERROR_CONTENT_FILTER}
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
    ORDER BY occurrences DESC, affected_users DESC, error_pattern ASC
    LIMIT {limit:UInt32}
  `;
}

/**
 * Get top recurring errors across all sessions
 */
export async function getTopRecurringErrors(
	orgId: string,
	params: { days?: number; min_occurrences?: number; limit?: number } = {},
): Promise<RecurringError[]> {
	const { days = 7, min_occurrences = 2, limit = 15 } = params;
	return queryClickhouse<RecurringError>({
		query: buildRecurringErrorsQuery(buildDateFilter("days")),
		query_params: {
			days: Number(days),
			minOccurrences: Number(min_occurrences),
			limit: Number(limit),
			orgId,
		},
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
	const query_params = {
		days: Number(days),
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
    FROM rudel.session_analytics
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND ${ERROR_CONTENT_FILTER}
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

export async function getErrorsDashboard(
	orgId: string,
	params: {
		start_date: string;
		end_date: string;
		limit?: number;
	},
): Promise<ErrorsDashboard> {
	const { start_date, end_date, limit = 15 } = params;
	const recurring = await queryClickhouse<RecurringError>({
		query: buildRecurringErrorsQuery(
			buildInclusiveDateRangeFilter("startDate", "endDate"),
		),
		query_params: {
			startDate: start_date,
			endDate: end_date,
			orgId,
			minOccurrences: 1,
			limit: Number(limit),
		},
	});

	return {
		start_date,
		end_date,
		summary: {
			total_errors: recurring.reduce((sum, row) => sum + row.occurrences, 0),
			distinct_patterns: recurring.length,
			high_severity_patterns: recurring.filter((row) => row.severity === "high")
				.length,
			max_affected_users: recurring.reduce(
				(max, row) => Math.max(max, row.affected_users),
				0,
			),
			top_error_pattern: recurring[0]?.error_pattern ?? "",
		},
		recurring,
	};
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
	const dimensionExpr =
		split_by === "project_path"
			? "sa.project_path"
			: split_by === "model"
				? "sa.model_used"
				: "sa.user_id";
	type ErrorTrendBaseRow = Omit<
		ErrorTrendDataPoint,
		"error_type_occurrences" | "error_types"
	>;
	type ErrorTrendPatternRow = {
		date: string;
		dimension: string;
		error_pattern: string;
		occurrences: number;
	};

	const baseQuery = `
    WITH error_sessions AS (
      SELECT
        toDate(sa.session_date) as date,
        sa.session_id,
        sa.user_id,
        ${dimensionExpr} as dimension_value,
        sa.error_count,
        ${ERROR_PATTERN_SQL} as error_pattern
      FROM rudel.session_analytics sa
      WHERE ${buildInclusiveDateRangeFilter("startDate", "endDate", "sa.session_date")}
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

	const patternQuery = `
    WITH error_sessions AS (
      SELECT
        toDate(sa.session_date) as date,
        ${dimensionExpr} as dimension_value,
        sa.error_count,
        ${ERROR_PATTERN_SQL} as error_pattern
      FROM rudel.session_analytics sa
      WHERE ${buildInclusiveDateRangeFilter("startDate", "endDate", "sa.session_date")}
        AND sa.organization_id = {orgId:String}
        AND sa.error_count > 0
    )
    SELECT
      date,
      dimension_value as dimension,
      error_pattern,
      SUM(error_count) as occurrences
    FROM error_sessions
    WHERE
      dimension_value IS NOT NULL
      AND dimension_value != ''
      AND dimension_value != 'unknown'
      AND error_pattern != ''
    GROUP BY date, dimension_value, error_pattern
    ORDER BY date, dimension_value, occurrences DESC, error_pattern ASC
  `;

	const queryParams = {
		startDate: start_date,
		endDate: end_date,
		orgId,
	};

	const [baseRows, patternRows] = await Promise.all([
		queryClickhouse<ErrorTrendBaseRow>({
			query: baseQuery,
			query_params: queryParams,
		}),
		queryClickhouse<ErrorTrendPatternRow>({
			query: patternQuery,
			query_params: queryParams,
		}),
	]);

	const patternsByRow = new Map<string, ErrorTrendPatternRow[]>();
	for (const row of patternRows) {
		const key = `${row.date}:${row.dimension}`;
		const current = patternsByRow.get(key) ?? [];
		current.push(row);
		patternsByRow.set(key, current);
	}

	return baseRows.map((row) => {
		const patterns = patternsByRow.get(`${row.date}:${row.dimension}`) ?? [];

		return {
			...row,
			error_type_occurrences: patterns.map((pattern) => pattern.occurrences),
			error_types: patterns.map((pattern) => pattern.error_pattern),
		};
	});
}
