import type {
	ModelTokensTrendData,
	OverviewKPIs,
	UsageTrendData,
} from "@rudel/api-routes";
import { user } from "@rudel/sql-schema";
import { eq } from "drizzle-orm";
import {
	buildAbsoluteDateFilter,
	buildDateFilter,
	queryClickhouse,
} from "../clickhouse.js";
import { db } from "../db.js";

export interface Insight {
	insight_key: string;
	type: "trend" | "performer" | "alert" | "info";
	severity: "positive" | "warning" | "negative" | "info";
	message: string;
	link: string;
}

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
        FROM rudel.session_analytics
        WHERE ${dateFilter}
          AND organization_id = {orgId:String}
      `,
				query_params,
			}),
			queryClickhouse<{ count: number }>({
				query: `
        SELECT uniqExact(val) as count
        FROM rudel.session_analytics
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
        FROM rudel.session_analytics
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
        FROM rudel.session_analytics
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
        FROM rudel.session_analytics
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
    FROM rudel.session_analytics
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
    FROM rudel.session_analytics
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
      FROM rudel.session_analytics
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
      FROM rudel.session_analytics
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
      FROM rudel.session_analytics
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
      FROM rudel.session_analytics
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
				insight_key: "team_activity_change",
				type: "trend",
				severity,
				message: `Team activity ${direction} ${Math.abs(sessionChange).toFixed(1)}% this week`,
				link: "/dashboard/sessions",
			});
		}
	}

	// Insight 2: Top performer identification
	if (topPerformerData.length > 0 && topPerformerData[0]) {
		const performer = topPerformerData[0];
		const [userData] = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, performer.user_id))
			.limit(1);
		const displayName =
			userData?.name || `${performer.user_id.substring(0, 8)}...`;

		insights.push({
			insight_key: "top_contributor",
			type: "performer",
			severity: "info",
			message: `Top contributor: ${displayName} (${performer.sessions} sessions, ${performer.total_hours}h)`,
			link: `/dashboard/developers/${performer.user_id}`,
		});
	}

	// Insight 3: Knowledge silos detection (uses a wider 30-day window)
	if (silos.length > 0) {
		insights.push({
			insight_key: "knowledge_silos",
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
    FROM rudel.session_analytics
    WHERE ${currentDateFilter}
      AND organization_id = {orgId:String}
  `;

	const previousQuery = `
    SELECT
      count() as total_sessions,
      uniq(user_id) as active_users,
      round(avg(actual_duration_min), 2) as avg_duration_min,
      round(count() / uniq(user_id), 2) as avg_sessions_per_user
    FROM rudel.session_analytics
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
    FROM rudel.session_analytics
    WHERE ${currentDateFilter}
      AND organization_id = {orgId:String}
  `;

	const previousQuery = `
    SELECT
      count() as total_sessions,
      round(avg(success_score), 1) as avg_success_score,
      countIf(success_score >= 70) as high_quality_sessions
    FROM rudel.session_analytics
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
