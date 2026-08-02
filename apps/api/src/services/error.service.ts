import type {
	ErrorsDashboard,
	ErrorsDashboardSummary,
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

function buildRecurringErrorsQuery(dateFilter: string) {
	return `
    WITH error_sessions AS (
        SELECT
          sa.session_id,
          sa.user_id,
          sa.session_date,
          if(sa.git_remote != '', sa.git_remote, if(sa.package_name != '', sa.package_name, sa.project_path)) as repository,
          sa.error_pattern
        FROM rudel.session_analytics AS sa FINAL
        WHERE ${dateFilter}
          AND sa.organization_id = {orgId:String}
          AND sa.error_pattern != ''
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

function buildErrorsSummaryQuery(dateFilter: string) {
	return `
    WITH error_patterns AS (
      SELECT
        sa.error_pattern AS error_pattern,
        count() AS occurrences,
        uniq(sa.user_id) AS affected_users
      FROM rudel.session_analytics AS sa FINAL
      WHERE ${dateFilter}
        AND sa.organization_id = {orgId:String}
        AND sa.error_pattern != ''
      GROUP BY sa.error_pattern
    )
    SELECT
      ifNull(sum(occurrences), 0) AS total_errors,
      count() AS distinct_patterns,
      countIf(occurrences >= 10) AS high_severity_patterns,
      ifNull(max(affected_users), 0) AS max_affected_users,
      ifNull(argMax(error_pattern, tuple(occurrences, affected_users, error_pattern)), '') AS top_error_pattern
    FROM error_patterns
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
		query: buildRecurringErrorsQuery(
			buildDateFilter("days", "sa.session_date"),
		),
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
      sa.error_pattern,
      uniq(sa.user_id) as developers_affected,
      COUNT(*) as total_occurrences,
      groupUniqArray(sa.user_id) as affected_user_ids,
      round(AVG(sa.actual_duration_min), 2) as avg_session_duration_min
    FROM rudel.session_analytics AS sa FINAL
    WHERE ${buildDateFilter("days", "sa.session_date")}
      AND sa.organization_id = {orgId:String}
      AND sa.error_pattern != ''
    GROUP BY sa.error_pattern
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
	const dateFilter = buildInclusiveDateRangeFilter(
		"startDate",
		"endDate",
		"sa.session_date",
	);
	const queryParams = {
		startDate: start_date,
		endDate: end_date,
		orgId,
	};
	const [recurring, summaryRows] = await Promise.all([
		queryClickhouse<RecurringError>({
			query: buildRecurringErrorsQuery(dateFilter),
			query_params: {
				...queryParams,
				minOccurrences: 1,
				limit: Number(limit),
			},
		}),
		queryClickhouse<ErrorsDashboardSummary>({
			query: buildErrorsSummaryQuery(dateFilter),
			query_params: queryParams,
		}),
	]);
	const summary = summaryRows[0];

	return {
		start_date,
		end_date,
		summary: summary ?? {
			total_errors: 0,
			distinct_patterns: 0,
			high_severity_patterns: 0,
			max_affected_users: 0,
			top_error_pattern: "",
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
        sa.error_count
      FROM rudel.session_analytics AS sa FINAL
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
          sa.error_pattern
        FROM rudel.session_analytics AS sa FINAL
        WHERE ${buildInclusiveDateRangeFilter("startDate", "endDate", "sa.session_date")}
          AND sa.organization_id = {orgId:String}
          AND sa.error_count > 0
          AND sa.error_pattern != ''
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
