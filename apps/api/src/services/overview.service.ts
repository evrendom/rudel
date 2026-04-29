import type {
	ModelTokensTrendData,
	OverviewKPIs,
	RepositoryDailyTrendData,
	UsageTrendData,
	UserDailyTrendData,
	UserTokenUsageData,
} from "@rudel/api-routes";
import {
	buildAbsoluteDateFilter,
	buildDateFilter,
	queryClickhouse,
} from "../clickhouse.js";
import { sqlClient } from "../db.js";
import { buildEstimatedCostSql } from "./pricing.service.js";

export interface Insight {
	type: "trend" | "performer" | "alert" | "info";
	severity: "positive" | "warning" | "negative" | "info";
	message: string;
	link: string;
}

const USER_USAGE_PER_SESSION_COST_SQL = buildEstimatedCostSql({
	modelExpr: "sa.model_used",
	inputExpr: "ifNull(sa.input_tokens, 0)",
	outputExpr: "ifNull(sa.output_tokens, 0)",
	cacheReadInputExpr: "ifNull(sa.cache_read_input_tokens, 0)",
	cacheCreationInputExpr: "ifNull(sa.cache_creation_input_tokens, 0)",
});

/**
 * Get overview KPI counts: distinct users, sessions, projects, subagents, skills, slash commands
 */
export async function getOverviewKPIs(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<OverviewKPIs> {
	const dateFilter = buildAbsoluteDateFilter("startDate", "endDate");
	const query_params = {
		startDate,
		endDate,
		orgId,
	};

	const [mainResult, subagentsResult, skillsResult, slashResult, totalResult] =
		await Promise.all([
			queryClickhouse<{
				distinct_users: number;
				distinct_sessions: number;
				distinct_projects: number;
			}>({
				query: `
        SELECT
          uniq(user_id) as distinct_users,
          count() as distinct_sessions,
          uniq(if(git_remote != '', git_remote, if(package_name != '', package_name, project_path))) as distinct_projects
        FROM rudel.session_analytics FINAL
        WHERE ${dateFilter}
          AND organization_id = {orgId:String}
      `,
				query_params,
			}),
			queryClickhouse<{ count: number }>({
				query: `
        SELECT uniqExact(val) as count
        FROM rudel.session_analytics FINAL
        ARRAY JOIN subagent_types as val
        WHERE ${dateFilter}
          AND organization_id = {orgId:String}
          AND val != ''
      `,
				query_params,
			}),
			queryClickhouse<{ count: number }>({
				query: `
        SELECT uniqExact(val) as count
        FROM rudel.session_analytics FINAL
        ARRAY JOIN skills as val
        WHERE ${dateFilter}
          AND organization_id = {orgId:String}
          AND val != ''
      `,
				query_params,
			}),
			queryClickhouse<{ count: number }>({
				query: `
        SELECT uniqExact(val) as count
        FROM rudel.session_analytics FINAL
        ARRAY JOIN slash_commands as val
        WHERE ${dateFilter}
          AND organization_id = {orgId:String}
          AND val != ''
      `,
				query_params,
			}),
			queryClickhouse<{ count: number }>({
				query: `
        SELECT count() as count
        FROM rudel.session_analytics FINAL
        WHERE organization_id = {orgId:String}
      `,
				query_params,
			}),
		]);

	const row = mainResult[0];
	if (!row) {
		return {
			distinct_users: 0,
			distinct_sessions: 0,
			distinct_projects: 0,
			distinct_subagents: 0,
			distinct_skills: 0,
			distinct_slash_commands: 0,
			total_sessions: 0,
		};
	}
	// ClickHouse returns UInt64 as strings when output_format_json_quote_64bit_integers is true (the default)
	return {
		distinct_users: Number(row.distinct_users),
		distinct_sessions: Number(row.distinct_sessions),
		distinct_projects: Number(row.distinct_projects),
		distinct_subagents: Number(subagentsResult[0]?.count ?? 0),
		distinct_skills: Number(skillsResult[0]?.count ?? 0),
		distinct_slash_commands: Number(slashResult[0]?.count ?? 0),
		total_sessions: Number(totalResult[0]?.count ?? 0),
	};
}

/**
 * Get token usage broken down by model and day
 */
export async function getModelTokensTrend(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<ModelTokensTrendData[]> {
	const dateFilter = buildAbsoluteDateFilter("startDate", "endDate");

	const query = `
    SELECT
      toDate(session_date) as date,
      model_used as model,
      sum(total_tokens) as total_tokens,
      sum(input_tokens) as input_tokens,
      sum(output_tokens) as output_tokens
    FROM rudel.session_analytics FINAL
    WHERE ${dateFilter}
      AND organization_id = {orgId:String}
      AND model_used != ''
      AND model_used != 'unknown'
    GROUP BY date, model
    ORDER BY date ASC, total_tokens DESC
  `;

	return queryClickhouse<ModelTokensTrendData>({
		query,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});
}

export async function getUsersTokenUsage(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<UserTokenUsageData[]> {
	const dateFilter = buildAbsoluteDateFilter("startDate", "endDate");
	const rows = await queryClickhouse<{
		models_used: string[];
		repositories_touched: string[];
		user_id: string;
		total_commits: number;
		total_tokens: number;
		input_tokens: number;
		output_tokens: number;
		cost: number;
		total_sessions: number;
		total_duration_min: number;
		success_rate: number;
		distinct_skills: number;
		distinct_slash_commands: number;
	}>({
		query: `
    SELECT
      sa.user_id,
      arrayFilter(
        x -> x != '',
        topK(3)(if(sa.model_used != '' AND sa.model_used != 'unknown', sa.model_used, ''))
      ) as models_used,
      arraySort(
        arrayDistinct(
          arrayFilter(
            x -> x != '',
            groupArray(
              if(
                sa.git_remote != '',
                replaceRegexpOne(arrayElement(splitByChar('/', sa.git_remote), -1), '\\\\.git$', ''),
                if(
                  sa.package_name != '',
                  sa.package_name,
                  arrayElement(splitByChar('/', replaceAll(sa.project_path, '\\\\', '/')), -1)
                )
              )
            )
          )
        )
      ) as repositories_touched,
      sum(sa.has_commit) as total_commits,
      sum(ifNull(sa.total_tokens, 0)) as total_tokens,
      sum(ifNull(sa.input_tokens, 0)) as input_tokens,
      sum(ifNull(sa.output_tokens, 0)) as output_tokens,
      round(sum(${USER_USAGE_PER_SESSION_COST_SQL}), 4) as cost,
      count() as total_sessions,
      round(sum(sa.actual_duration_min), 2) as total_duration_min,
      round(avg(sa.success_score), 2) as success_rate,
      length(arrayDistinct(arrayFilter(x -> x != '', arrayFlatten(groupArray(sa.skills))))) as distinct_skills,
      length(arrayDistinct(arrayFilter(x -> x != '', arrayFlatten(groupArray(sa.slash_commands))))) as distinct_slash_commands
    FROM rudel.session_analytics AS sa FINAL
    WHERE ${dateFilter}
      AND sa.organization_id = {orgId:String}
      AND sa.user_id != ''
    GROUP BY sa.user_id
    ORDER BY total_tokens DESC
  `,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});

	if (rows.length === 0) {
		return [];
	}

	return rows.map((row) => ({
		models_used: row.models_used ?? [],
		repositories_touched: row.repositories_touched ?? [],
		user_id: row.user_id,
		user_label: row.user_id,
		total_commits: Number(row.total_commits),
		total_tokens: Number(row.total_tokens),
		input_tokens: Number(row.input_tokens),
		output_tokens: Number(row.output_tokens),
		cost: Number(row.cost),
		total_sessions: Number(row.total_sessions),
		total_duration_min: Number(row.total_duration_min),
		success_rate: Number(row.success_rate),
		distinct_skills: Number(row.distinct_skills),
		distinct_slash_commands: Number(row.distinct_slash_commands),
	}));
}

export async function getUsersDailyTrend(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<UserDailyTrendData[]> {
	const dateFilter = buildAbsoluteDateFilter("startDate", "endDate");

	return queryClickhouse<UserDailyTrendData>({
		query: `
    SELECT
      toString(toDate(session_date)) as date,
      user_id,
      count() as sessions,
      sum(has_commit) as total_commits,
      round(sum(actual_duration_min) / 60, 2) as total_hours,
      sum(ifNull(total_tokens, 0)) as total_tokens,
      sum(ifNull(input_tokens, 0)) as input_tokens,
      sum(ifNull(output_tokens, 0)) as output_tokens,
      round(avg(success_score), 2) as avg_success_rate,
      length(arrayDistinct(arrayFilter(x -> x != '', arrayFlatten(groupArray(skills))))) as distinct_skills,
      length(arrayDistinct(arrayFilter(x -> x != '', arrayFlatten(groupArray(slash_commands))))) as distinct_slash_commands,
      arrayFilter(
        x -> x != '',
        arrayDistinct(groupArray(if(model_used != '' AND model_used != 'unknown', model_used, '')))
      ) as models_used,
      arraySort(
        arrayDistinct(
          arrayFilter(
            x -> x != '',
            groupArray(
              if(
                git_remote != '',
                replaceRegexpOne(arrayElement(splitByChar('/', git_remote), -1), '\\\\.git$', ''),
                if(
                  package_name != '',
                  package_name,
                  arrayElement(splitByChar('/', replaceAll(project_path, '\\\\', '/')), -1)
                )
              )
            )
          )
        )
      ) as repositories_touched
    FROM rudel.session_analytics FINAL
    WHERE ${dateFilter}
      AND organization_id = {orgId:String}
      AND user_id != ''
    GROUP BY date, user_id
    ORDER BY date ASC, user_id ASC
  `,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});
}

export async function getRepositoriesDailyTrend(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<RepositoryDailyTrendData[]> {
	const dateFilter = buildAbsoluteDateFilter("startDate", "endDate");

	return queryClickhouse<RepositoryDailyTrendData>({
		query: `
    SELECT
      toString(toDate(session_date)) as date,
      if(
        git_remote != '',
        replaceRegexpOne(arrayElement(splitByChar('/', git_remote), -1), '\\\\.git$', ''),
        if(
          package_name != '',
          package_name,
          arrayElement(splitByChar('/', replaceAll(project_path, '\\\\', '/')), -1)
        )
      ) as repository,
      count() as sessions,
      sum(has_commit) as total_commits
    FROM rudel.session_analytics FINAL
    WHERE ${dateFilter}
      AND organization_id = {orgId:String}
    GROUP BY date, repository
    HAVING repository != ''
    ORDER BY date ASC, repository ASC
  `,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});
}

/**
 * Get detailed usage trend data aggregated by day
 */
export async function getUsageTrendDetailed(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<UsageTrendData[]> {
	const dateFilter = buildAbsoluteDateFilter("startDate", "endDate");

	const query = `
    SELECT
      toDate(session_date) as date,
      count() as sessions,
      uniq(user_id) as active_users,
      round(sum(actual_duration_min) / 60, 2) as total_hours,
      sum(total_tokens) as total_tokens
    FROM rudel.session_analytics FINAL
    WHERE ${dateFilter}
      AND organization_id = {orgId:String}
    GROUP BY date
    ORDER BY date ASC
  `;

	return queryClickhouse<UsageTrendData>({
		query,
		query_params: {
			startDate,
			endDate,
			orgId,
		},
	});
}

/**
 * Generate rule-based insights from current data
 */
export async function getOverviewInsights(
	orgId: string,
	startDate: string,
	endDate: string,
): Promise<Insight[]> {
	const insights: Insight[] = [];
	const periodMs = new Date(endDate).getTime() - new Date(startDate).getTime();
	const prevEnd = new Date(new Date(startDate).getTime() - 1);
	const prevStart = new Date(prevEnd.getTime() - periodMs);
	const prevStartStr = prevStart.toISOString().slice(0, 10);
	const prevEndStr = prevEnd.toISOString().slice(0, 10);
	const currentDateFilter = buildAbsoluteDateFilter("startDate", "endDate");
	const previousDateFilter = buildAbsoluteDateFilter(
		"previousStartDate",
		"previousEndDate",
	);

	interface PeriodStats {
		total_sessions: number;
		total_users: number;
		avg_duration_min: number;
	}

	const [currentData, previousData, topPerformerData, silos] =
		await Promise.all([
			queryClickhouse<PeriodStats>({
				query: `
      SELECT
        count() as total_sessions,
        uniq(user_id) as total_users,
        round(avg(actual_duration_min), 2) as avg_duration_min
      FROM rudel.session_analytics FINAL
      WHERE ${currentDateFilter}
        AND organization_id = {orgId:String}
    `,
				query_params: {
					startDate,
					endDate,
					orgId,
				},
			}),
			queryClickhouse<PeriodStats>({
				query: `
      SELECT
        count() as total_sessions,
        uniq(user_id) as total_users,
        round(avg(actual_duration_min), 2) as avg_duration_min
      FROM rudel.session_analytics FINAL
      WHERE ${previousDateFilter}
        AND organization_id = {orgId:String}
    `,
				query_params: {
					previousStartDate: prevStartStr,
					previousEndDate: prevEndStr,
					orgId,
				},
			}),
			queryClickhouse<{
				user_id: string;
				sessions: number;
				total_hours: number;
			}>({
				query: `
      SELECT
        user_id,
        count() as sessions,
        round(sum(actual_duration_min) / 60, 1) as total_hours
      FROM rudel.session_analytics FINAL
      WHERE ${currentDateFilter}
        AND organization_id = {orgId:String}
      GROUP BY user_id
      ORDER BY sessions DESC
      LIMIT 1
    `,
				query_params: {
					startDate,
					endDate,
					orgId,
				},
			}),
			queryClickhouse<{
				project_path: string;
				unique_users: number;
				sessions: number;
			}>({
				query: `
      SELECT
        project_path,
        uniq(user_id) as unique_users,
        count() as sessions
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("siloDays")}
        AND organization_id = {orgId:String}
      GROUP BY project_path
      HAVING unique_users = 1 AND sessions >= 5
      ORDER BY sessions DESC
    `,
				query_params: {
					siloDays: 30,
					orgId,
				},
			}),
		]);

	const current = currentData[0];
	const previous = previousData[0] || { total_sessions: 0 };

	// Insight 1: Session trend analysis
	if (current && previous) {
		const sessionChange =
			previous.total_sessions > 0
				? ((current.total_sessions - previous.total_sessions) /
						previous.total_sessions) *
					100
				: 0;

		if (Math.abs(sessionChange) >= 10) {
			const direction = sessionChange > 0 ? "up" : "down";
			const severity = sessionChange > 0 ? "positive" : "warning";
			insights.push({
				type: "trend",
				severity,
				message: `Team activity ${direction} ${Math.abs(sessionChange).toFixed(1)}% this week`,
				link: "/dashboard/team",
			});
		}
	}

	// Insight 2: Top performer identification
	if (topPerformerData.length > 0 && topPerformerData[0]) {
		const performer = topPerformerData[0];
		const [userData] = await sqlClient<Array<{ name: string | null }>>`
			SELECT name
			FROM "user"
			WHERE id = ${performer.user_id}
			LIMIT 1
		`;
		const displayName =
			userData?.name || `${performer.user_id.substring(0, 8)}...`;

		insights.push({
			type: "performer",
			severity: "info",
			message: `Top contributor: ${displayName} (${performer.sessions} sessions, ${performer.total_hours}h)`,
			link: `/dashboard/developers/${performer.user_id}`,
		});
	}

	// Insight 3: Knowledge silos detection (uses a wider 30-day window)
	if (silos.length > 0) {
		insights.push({
			type: "alert",
			severity: "warning",
			message: `${silos.length} project${silos.length > 1 ? "s" : ""} with only one developer - risk of knowledge silos`,
			link: "/dashboard/projects",
		});
	}

	return insights.slice(0, 3);
}

export interface TeamSummaryPeriodData {
	total_sessions: number;
	active_users: number;
	avg_duration_min: number;
	avg_sessions_per_user: number;
}

/**
 * Get team summary with previous period comparison
 */
export async function getTeamSummaryWithComparison(
	orgId: string,
	startDate: string,
	endDate: string,
) {
	const periodMs = new Date(endDate).getTime() - new Date(startDate).getTime();
	const prevEnd = new Date(new Date(startDate).getTime() - 1);
	const prevStart = new Date(prevEnd.getTime() - periodMs);
	const prevStartStr = prevStart.toISOString().slice(0, 10);
	const prevEndStr = prevEnd.toISOString().slice(0, 10);
	const currentDateFilter = buildAbsoluteDateFilter("startDate", "endDate");
	const previousDateFilter = buildAbsoluteDateFilter(
		"previousStartDate",
		"previousEndDate",
	);

	const currentQuery = `
    SELECT
      count() as total_sessions,
      uniq(user_id) as active_users,
      round(avg(actual_duration_min), 2) as avg_duration_min,
      round(count() / uniq(user_id), 2) as avg_sessions_per_user
    FROM rudel.session_analytics FINAL
    WHERE ${currentDateFilter}
      AND organization_id = {orgId:String}
  `;

	const previousQuery = `
    SELECT
      count() as total_sessions,
      uniq(user_id) as active_users,
      round(avg(actual_duration_min), 2) as avg_duration_min,
      round(count() / uniq(user_id), 2) as avg_sessions_per_user
    FROM rudel.session_analytics FINAL
    WHERE ${previousDateFilter}
      AND organization_id = {orgId:String}
  `;

	const [currentData, previousData] = await Promise.all([
		queryClickhouse<TeamSummaryPeriodData>({
			query: currentQuery,
			query_params: {
				startDate,
				endDate,
				orgId,
			},
		}),
		queryClickhouse<TeamSummaryPeriodData>({
			query: previousQuery,
			query_params: {
				previousStartDate: prevStartStr,
				previousEndDate: prevEndStr,
				orgId,
			},
		}),
	]);

	const defaultPeriod: TeamSummaryPeriodData = {
		total_sessions: 0,
		active_users: 0,
		avg_duration_min: 0,
		avg_sessions_per_user: 0,
	};

	const current = currentData[0] || defaultPeriod;
	const previous = previousData[0] || defaultPeriod;

	const calculateChange = (curr: number, prev: number) => {
		if (!prev || prev === 0) return 0;
		return ((curr - prev) / prev) * 100;
	};

	const changes = {
		total_sessions: calculateChange(
			current.total_sessions || 0,
			previous.total_sessions || 0,
		),
		active_users: calculateChange(
			current.active_users || 0,
			previous.active_users || 0,
		),
		avg_duration_min: calculateChange(
			current.avg_duration_min || 0,
			previous.avg_duration_min || 0,
		),
		avg_sessions_per_user: calculateChange(
			current.avg_sessions_per_user || 0,
			previous.avg_sessions_per_user || 0,
		),
	};

	return { current, previous, changes };
}

/**
 * Get session success rate metrics with comparison
 */
export async function getSuccessRateMetrics(
	orgId: string,
	startDate: string,
	endDate: string,
) {
	const periodMs = new Date(endDate).getTime() - new Date(startDate).getTime();
	const prevEnd = new Date(new Date(startDate).getTime() - 1);
	const prevStart = new Date(prevEnd.getTime() - periodMs);
	const prevStartStr = prevStart.toISOString().slice(0, 10);
	const prevEndStr = prevEnd.toISOString().slice(0, 10);
	const currentDateFilter = buildAbsoluteDateFilter("startDate", "endDate");
	const previousDateFilter = buildAbsoluteDateFilter(
		"previousStartDate",
		"previousEndDate",
	);

	const currentQuery = `
    SELECT
      count() as total_sessions,
      round(avg(success_score), 1) as avg_success_score,
      countIf(success_score >= 70) as high_quality_sessions
    FROM rudel.session_analytics FINAL
    WHERE ${currentDateFilter}
      AND organization_id = {orgId:String}
  `;

	const previousQuery = `
    SELECT
      count() as total_sessions,
      round(avg(success_score), 1) as avg_success_score,
      countIf(success_score >= 70) as high_quality_sessions
    FROM rudel.session_analytics FINAL
    WHERE ${previousDateFilter}
      AND organization_id = {orgId:String}
  `;

	interface SuccessRateStats {
		total_sessions: number;
		avg_success_score: number;
		high_quality_sessions: number;
	}

	const [currentData, previousData] = await Promise.all([
		queryClickhouse<SuccessRateStats>({
			query: currentQuery,
			query_params: {
				startDate,
				endDate,
				orgId,
			},
		}),
		queryClickhouse<SuccessRateStats>({
			query: previousQuery,
			query_params: {
				previousStartDate: prevStartStr,
				previousEndDate: prevEndStr,
				orgId,
			},
		}),
	]);

	const current: SuccessRateStats = currentData[0] || {
		total_sessions: 0,
		avg_success_score: 0,
		high_quality_sessions: 0,
	};

	const previous: SuccessRateStats = previousData[0] || {
		total_sessions: 0,
		avg_success_score: 0,
		high_quality_sessions: 0,
	};

	const currentSuccessRate =
		current.total_sessions > 0
			? (current.high_quality_sessions / current.total_sessions) * 100
			: 0;

	const previousSuccessRate =
		previous.total_sessions > 0
			? (previous.high_quality_sessions / previous.total_sessions) * 100
			: 0;

	return {
		current: {
			high_quality_sessions: current.high_quality_sessions,
			total_sessions: current.total_sessions,
			success_rate: currentSuccessRate,
		},
		previous: {
			high_quality_sessions: previous.high_quality_sessions,
			total_sessions: previous.total_sessions,
			success_rate: previousSuccessRate,
		},
		changes: {
			success_rate: currentSuccessRate - previousSuccessRate,
		},
	};
}
