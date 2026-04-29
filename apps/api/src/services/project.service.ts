import { getLogger } from "@logtape/logtape";
import type {
	ProjectContributor as ProjectContributorBase,
	ProjectDetailData,
	ProjectError as ProjectErrorBase,
	ProjectFeatureUsage,
	ProjectInvestment,
	ProjectTrendDataPoint as ProjectTrendDataPointBase,
} from "@rudel/api-routes";
import {
	addOptionalStringEqFilter,
	addOptionalStringInFilter,
	buildDateFilter,
	queryClickhouse,
} from "../clickhouse.js";

const logger = getLogger(["rudel", "api", "project-service"]);

const PROJECT_KEY_EXPR = `if(git_remote != '', git_remote, if(package_name != '', package_name, project_path))`;
const PROJECT_DISPLAY_EXPR = `if(git_remote != '', arrayElement(splitByChar('/', git_remote), -1), arrayElement(splitByChar('/', replaceAll(project_path, '\\\\', '/')), -1))`;

function buildProjectDisplaySubquery(
	orgParamName: string,
	projectParamName: string,
): string {
	return `(
    SELECT
      if(
        count() > 0,
        any(${PROJECT_DISPLAY_EXPR}),
        if(
          position({${projectParamName}:String}, '/') > 0,
          arrayElement(splitByChar('/', {${projectParamName}:String}), -1),
          {${projectParamName}:String}
        )
      ) as project_display
    FROM rudel.session_analytics FINAL
    WHERE organization_id = {${orgParamName}:String}
      AND (
        project_path = {${projectParamName}:String}
        OR git_remote = {${projectParamName}:String}
        OR ${PROJECT_KEY_EXPR} = {${projectParamName}:String}
      )
      AND (git_remote != '' OR package_name != '' OR project_path != '')
  )`;
}

export interface KnowledgeSilo {
	project_path: string;
	project_name?: string;
	repository_name?: string;
	sole_user: string;
	sessions: number;
	risk_level: "high" | "medium" | "low";
}

export interface ProjectActivity {
	date: string;
	project_path: string;
	sessions: number;
	unique_users: number;
}

export interface ProjectSummary {
	total_projects: number;
	projects_with_silos: number;
	avg_users_per_project: number;
	most_active_project: string;
	most_active_sessions: number;
}

export type ProjectDetails = ProjectDetailData;

export interface ProjectContributor extends ProjectContributorBase {
	username?: string;
	first_session: string;
	last_session: string;
}

export interface ProjectError extends ProjectErrorBase {
	first_seen: string;
}

export type ProjectTrendDataPoint = ProjectTrendDataPointBase;

/**
 * Extract project name from path (last segment)
 */
function extractProjectName(projectPath: string): string {
	if (!projectPath) return "";
	const segments = projectPath.replace(/\\/g, "/").split("/").filter(Boolean);
	return segments[segments.length - 1] || projectPath;
}

/**
 * Extract repository name from path
 */
function extractRepositoryName(projectPath: string): string {
	return extractProjectName(projectPath);
}

/**
 * Get AI investment by project - where is time being spent?
 */
export async function getProjectInvestment(
	orgId: string,
	params: {
		days?: number;
		limit?: number;
		offset?: number;
		project_path?: string;
		project_paths?: string[];
	} = {},
): Promise<ProjectInvestment[]> {
	const {
		days = 30,
		limit = 20,
		offset = 0,
		project_path,
		project_paths,
	} = params;
	const d = Number(days);
	const query_params: Record<string, unknown> = {
		currentDays: d,
		previousDays: d * 2,
		limit: Number(limit),
		offset: Number(offset),
		orgId,
	};
	const projectFilters: string[] = [];
	addOptionalStringEqFilter(
		projectFilters,
		query_params,
		"project_path",
		"projectPath",
		project_path,
	);
	if (!project_path) {
		addOptionalStringInFilter(
			projectFilters,
			query_params,
			"project_path",
			"projectPathList",
			project_paths,
		);
	}

	const query = `
    WITH current_period AS (
      SELECT
        ${PROJECT_DISPLAY_EXPR} as project_display,
        any(git_remote) as _git_remote,
        any(project_path) as _project_path,
        COUNT(*) as sessions,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(ifNull(input_tokens, 0)) as input_tokens_sum,
        SUM(ifNull(output_tokens, 0)) as output_tokens_sum,
        SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
        round(SUM(actual_duration_min), 2) as total_duration_min,
        round(AVG(actual_duration_min), 2) as avg_session_duration_min,
        round(AVG(success_score), 2) as success_rate
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("currentDays")}
        AND organization_id = {orgId:String}
        AND (git_remote != '' OR package_name != '' OR project_path != '')
        ${projectFilters.length > 0 ? `AND ${projectFilters.join("\n        AND ")}` : ""}
      GROUP BY ${PROJECT_DISPLAY_EXPR}
    ),
    previous_period AS (
      SELECT
        ${PROJECT_DISPLAY_EXPR} as project_display,
        round(AVG(success_score), 2) as prev_success_rate
      FROM rudel.session_analytics FINAL
      WHERE session_date >= now64(3) - toIntervalDay({previousDays:UInt32})
        AND session_date < now64(3) - toIntervalDay({currentDays:UInt32})
        AND organization_id = {orgId:String}
        AND (git_remote != '' OR package_name != '' OR project_path != '')
        ${projectFilters.length > 0 ? `AND ${projectFilters.join("\n        AND ")}` : ""}
      GROUP BY ${PROJECT_DISPLAY_EXPR}
    )
    SELECT
      c.project_display as repository,
      c._git_remote as git_remote,
      c._project_path as project_path,
      c.sessions,
      c.unique_users,
      c.total_tokens,
      c.input_tokens_sum as input_tokens,
      c.output_tokens_sum as output_tokens,
      c.total_duration_min,
      c.avg_session_duration_min,
      c.success_rate,
      round((c.output_tokens_sum / 1000000.0) * 15.0 + (c.input_tokens_sum / 1000000.0) * 3.0, 4) as cost,
      round(c.success_rate - ifNull(p.prev_success_rate, c.success_rate), 2) as success_rate_trend
    FROM current_period c
    LEFT JOIN previous_period p ON c.project_display = p.project_display
    ORDER BY c.total_duration_min DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

	const results = await queryClickhouse<
		ProjectInvestment & { git_remote?: string }
	>({
		query,
		query_params,
	});

	return results.map((project) => ({
		...project,
		repository: project.repository || null,
		git_remote: project.git_remote || undefined,
	}));
}

/**
 * Get knowledge silos - projects with only one developer
 */
export async function getKnowledgeSilos(
	orgId: string,
	params: { days?: number; min_sessions?: number } = {},
): Promise<KnowledgeSilo[]> {
	const { days = 30, min_sessions = 5 } = params;
	const d = Number(days);
	const query_params = {
		days: d,
		minSessions: Number(min_sessions),
		orgId,
	};

	const query = `
    SELECT
      project_path,
      any(user_id) as sole_user,
      COUNT(*) as sessions,
      CASE
        WHEN COUNT(*) >= 20 THEN 'high'
        WHEN COUNT(*) >= 10 THEN 'medium'
        ELSE 'low'
      END as risk_level
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND project_path != ''
    GROUP BY project_path
    HAVING COUNT(DISTINCT user_id) = 1
      AND COUNT(*) >= {minSessions:UInt32}
    ORDER BY sessions DESC
  `;

	const results = await queryClickhouse<KnowledgeSilo>({
		query,
		query_params,
	});

	return results.map((silo) => ({
		...silo,
		project_name: extractProjectName(silo.project_path),
		repository_name: extractRepositoryName(silo.project_path),
	}));
}

/**
 * Get project activity trend over time
 */
export async function getProjectActivity(
	orgId: string,
	projectPath: string,
	params: { days?: number; granularity?: "day" | "week" | "month" } = {},
): Promise<ProjectActivity[]> {
	const { days = 30, granularity = "day" } = params;
	const d = Number(days);

	let dateGrouping = "toDate(session_date)";
	if (granularity === "week") {
		dateGrouping = "toMonday(session_date)";
	} else if (granularity === "month") {
		dateGrouping = "toStartOfMonth(session_date)";
	}

	const query = `
    WITH project_key AS (
      SELECT if(git_remote != '', git_remote, if(package_name != '', package_name, project_path)) as pk, any(project_path) as project_path
      FROM rudel.session_analytics FINAL
      WHERE project_path = {projectPath:String}
        AND (git_remote != '' OR package_name != '' OR project_path != '')
        AND organization_id = {orgId:String}
      LIMIT 1
    )
    SELECT
      toString(${dateGrouping}) as date,
      pk.project_path,
      COUNT(*) as sessions,
      COUNT(DISTINCT s.user_id) as unique_users
    FROM project_key pk
    INNER JOIN rudel.session_analytics AS s FINAL ON if(s.git_remote != '', s.git_remote, if(s.package_name != '', s.package_name, s.project_path)) = pk.pk
    WHERE ${buildDateFilter("days", "s.session_date")}
      AND s.organization_id = {orgId:String}
    GROUP BY ${dateGrouping}, pk.project_path
    ORDER BY date ASC
  `;

	return queryClickhouse<ProjectActivity>({
		query,
		query_params: {
			days: d,
			orgId,
			projectPath,
		},
	});
}

/**
 * Get project summary statistics
 */
export async function getProjectSummary(
	orgId: string,
	days = 30,
): Promise<ProjectSummary> {
	const d = Number(days);

	const query = `
    WITH project_stats AS (
      SELECT
        project_path,
        COUNT(*) as sessions,
        COUNT(DISTINCT user_id) as users
      FROM rudel.session_analytics FINAL
      WHERE ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        AND project_path != ''
      GROUP BY project_path
    )
    SELECT
      COUNT(*) as total_projects,
      countIf(users = 1 AND sessions >= 5) as projects_with_silos,
      round(AVG(users), 2) as avg_users_per_project,
      argMax(project_path, sessions) as most_active_project,
      max(sessions) as most_active_sessions
    FROM project_stats
  `;

	const result = await queryClickhouse<ProjectSummary>({
		query,
		query_params: {
			days: d,
			orgId,
		},
	});
	return (
		result[0] || {
			total_projects: 0,
			projects_with_silos: 0,
			avg_users_per_project: 0,
			most_active_project: "",
			most_active_sessions: 0,
		}
	);
}

/**
 * Get detailed metrics for a specific project
 */
export async function getProjectDetails(
	orgId: string,
	projectPath: string,
	days = 30,
): Promise<ProjectDetails | null> {
	const d = Number(days);
	const projectDisplaySubquery = buildProjectDisplaySubquery(
		"orgId",
		"projectPath",
	);
	const query_params = {
		days: d,
		orgId,
		projectPath,
	};

	const query = `
    SELECT
      any(project_path) as raw_project_path,
      COUNT(*) as total_sessions,
      SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
      SUM(ifNull(input_tokens, 0)) as input_tokens_sum,
      SUM(ifNull(output_tokens, 0)) as output_tokens_sum,
      COUNT(DISTINCT user_id) as contributors_count,
      countIf(success_score < 40) as errors_count,
      ifNull(round(avgOrNull(actual_duration_min), 2), 0) as avg_session_duration_min,
      ifNull(round(avgOrNull(success_score), 2), 0) as success_rate,
      round(SUM(actual_duration_min), 2) as total_duration_min
    FROM rudel.session_analytics FINAL
    WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (git_remote != '' OR package_name != '' OR project_path != '')
  `;

	let results: (Omit<ProjectDetails, "project_path"> & {
		raw_project_path: string;
		input_tokens_sum: number;
		output_tokens_sum: number;
	})[];
	try {
		results = await queryClickhouse<
			Omit<ProjectDetails, "project_path"> & {
				raw_project_path: string;
				input_tokens_sum: number;
				output_tokens_sum: number;
			}
		>({
			query,
			query_params,
		});
	} catch (err) {
		logger.error(
			"getProjectDetails ClickHouse query failed for org={org} path={path}: {error}",
			{ org: orgId, path: projectPath, error: String(err) },
		);
		throw err;
	}

	const [row] = results;
	if (!row || row.total_sessions === 0) return null;
	const cost =
		row.output_tokens_sum * 0.000015 + row.input_tokens_sum * 0.000003;
	return {
		project_path: row.raw_project_path,
		total_sessions: row.total_sessions,
		total_tokens: row.total_tokens,
		contributors_count: row.contributors_count,
		errors_count: row.errors_count,
		avg_session_duration_min: row.avg_session_duration_min,
		success_rate: row.success_rate,
		total_duration_min: row.total_duration_min,
		cost: parseFloat(cost.toFixed(4)),
	};
}

/**
 * Get contributors to a specific project
 */
export async function getProjectContributors(
	orgId: string,
	projectPath: string,
	days = 30,
): Promise<ProjectContributor[]> {
	const d = Number(days);
	const projectDisplaySubquery = buildProjectDisplaySubquery(
		"orgId",
		"projectPath",
	);
	const query_params = {
		days: d,
		orgId,
		projectPath,
	};

	const query = `
    WITH project_totals AS (
      SELECT COUNT(*) as total_sessions
      FROM rudel.session_analytics FINAL
      WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
        AND ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        AND (git_remote != '' OR package_name != '' OR project_path != '')
    )
    SELECT
      user_id,
      COUNT(*) as sessions,
      round(SUM(actual_duration_min), 2) as total_duration_min,
      SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
      toString(min(session_date)) as first_session,
      toString(max(session_date)) as last_session,
      round(COUNT(*) * 100.0 / (SELECT total_sessions FROM project_totals), 2) as contribution_percentage
    FROM rudel.session_analytics FINAL
    WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (git_remote != '' OR package_name != '' OR project_path != '')
    GROUP BY user_id
    ORDER BY sessions DESC
  `;

	return queryClickhouse<ProjectContributor>({
		query,
		query_params,
	});
}

/**
 * Get feature usage for a specific project
 */
export async function getProjectFeatureUsage(
	orgId: string,
	projectPath: string,
	days = 30,
): Promise<ProjectFeatureUsage> {
	const d = Number(days);
	const projectDisplaySubquery = buildProjectDisplaySubquery(
		"orgId",
		"projectPath",
	);
	const query_params = {
		days: d,
		orgId,
		projectPath,
	};

	const adoptionQuery = `
    SELECT
      COUNT(*) as total_sessions,
      countIf(length(subagent_types) > 0) as subagents_sessions,
      countIf(length(skills) > 0) as skills_sessions,
      countIf(length(slash_commands) > 0) as slash_commands_sessions
    FROM rudel.session_analytics FINAL
    WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (git_remote != '' OR package_name != '' OR project_path != '')
  `;

	const topSubagentsQuery = `
    SELECT val as name, count() as count
    FROM rudel.session_analytics FINAL
    ARRAY JOIN subagent_types as val
    WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (git_remote != '' OR package_name != '' OR project_path != '')
      AND val != ''
    GROUP BY val
    ORDER BY count DESC
    LIMIT 10
  `;

	const topSkillsQuery = `
    SELECT val as name, count() as count
    FROM rudel.session_analytics FINAL
    ARRAY JOIN skills as val
    WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (git_remote != '' OR package_name != '' OR project_path != '')
      AND val != ''
    GROUP BY val
    ORDER BY count DESC
    LIMIT 10
  `;

	const topSlashCommandsQuery = `
    SELECT val as name, count() as count
    FROM rudel.session_analytics FINAL
    ARRAY JOIN slash_commands as val
    WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
      AND ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (git_remote != '' OR package_name != '' OR project_path != '')
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
 * Get error patterns specific to a project
 */
export async function getProjectErrors(
	orgId: string,
	projectPath: string,
	days = 30,
): Promise<ProjectError[]> {
	const d = Number(days);
	const projectDisplaySubquery = buildProjectDisplaySubquery(
		"orgId",
		"projectPath",
	);

	const query = `
    WITH error_extracts AS (
      SELECT
        session_id,
        user_id,
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
      WHERE ${PROJECT_DISPLAY_EXPR} = ${projectDisplaySubquery}
        AND ${buildDateFilter("days")}
        AND organization_id = {orgId:String}
        AND (git_remote != '' OR package_name != '' OR project_path != '')
        AND (content LIKE '%Error:%' OR content LIKE '%error:%')
    )
    SELECT
      error_pattern,
      COUNT(*) as occurrences,
      uniq(user_id) as affected_users,
      toString(min(session_date)) as first_seen,
      toString(max(session_date)) as last_seen
    FROM error_extracts
    WHERE error_pattern IS NOT NULL
    GROUP BY error_pattern
    ORDER BY occurrences DESC
    LIMIT 20
  `;

	return queryClickhouse<ProjectError>({
		query,
		query_params: {
			days: d,
			orgId,
			projectPath,
		},
	});
}

/**
 * Get project trend data for time series charts (split by project)
 */
export async function getProjectTrends(
	orgId: string,
	days = 30,
	groupBy: "day" | "week" = "day",
): Promise<ProjectTrendDataPoint[]> {
	const d = Number(days);

	const dateFunc =
		groupBy === "week"
			? "toMonday(toDate(session_date))"
			: "toDate(session_date)";

	const query = `
    SELECT
      toString(${dateFunc}) as date,
      ${PROJECT_DISPLAY_EXPR} as project_key,
      any(project_path) as _project_path,
      COUNT(*) as sessions,
      round(SUM(actual_duration_min) / 60, 2) as total_hours,
      SUM(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) as total_tokens,
      round(AVG(success_score), 2) as avg_success_rate
    FROM rudel.session_analytics FINAL
    WHERE ${buildDateFilter("days")}
      AND organization_id = {orgId:String}
      AND (git_remote != '' OR package_name != '' OR project_path != '')
    GROUP BY date, ${PROJECT_DISPLAY_EXPR}
    ORDER BY date ASC, project_key ASC
  `;

	const results = await queryClickhouse<
		ProjectTrendDataPoint & { project_key: string; _project_path: string }
	>({
		query,
		query_params: {
			days: d,
			orgId,
		},
	});

	return results.map((item) => ({
		date: item.date,
		project_path: item._project_path,
		project_name: item.project_key,
		sessions: item.sessions,
		total_hours: item.total_hours,
		total_tokens: item.total_tokens,
		avg_success_rate: item.avg_success_rate,
	}));
}
