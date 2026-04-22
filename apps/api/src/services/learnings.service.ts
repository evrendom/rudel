import type {
	LearningEntry as LearningEntryBase,
	LearningsFeedStats,
	LearningsTrendDataPoint,
} from "@rudel/api-routes";
import { addOptionalStringEqFilter, queryClickhouse } from "../clickhouse";

export interface LearningEntry extends LearningEntryBase {
	organization_id: string;
	subagents: string[];
	skills: string[];
	other_commands: string[];
}

/**
 * Get learnings feed from compound:feedback sessions
 */
export async function getLearningsFeed(
	orgId: string,
	params: {
		days?: number;
		user_id?: string;
		project_path?: string;
		limit?: number;
		offset?: number;
	} = {},
): Promise<LearningEntry[]> {
	const { days = 30, user_id, project_path, limit = 50, offset = 0 } = params;

	const d = Number(days);
	const query_params: Record<string, unknown> = {
		days: d,
		limit: Number(limit),
		offset: Number(offset),
		orgId,
	};
	const filters = [
		"last_interaction_date >= now64(3) - toIntervalDay({days:UInt32})",
		"has(slash_commands, 'compound:feedback')",
		"organization_id = {orgId:String}",
	];
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
    WITH
      feedback_data AS (
        SELECT
          session_id,
          user_id,
          last_interaction_date,
          project_path,
          organization_id,
          if(git_remote != '', git_remote, if(package_name != '', package_name, project_path)) as repository,
          subagents,
          skills,
          slash_commands,
          content
        FROM rudel.session_analytics
        WHERE ${filters.join("\n          AND ")}
      )
    SELECT
      session_id,
      user_id,
      formatDateTime(last_interaction_date, '%Y-%m-%dT%H:%i:%SZ') as created_at,
      'feedback' as type,
      if(
        position(content, '<command-name>/compound:feedback</command-name>') > 0
        AND position(content, '<command-args>', position(content, '<command-name>/compound:feedback</command-name>')) > 0
        AND position(content, '</command-args>', position(content, '<command-name>/compound:feedback</command-name>')) > 0,
        trimBoth(
          substring(
            content,
            position(content, '<command-args>', position(content, '<command-name>/compound:feedback</command-name>')) + 14,
            least(
              position(content, '</command-args>', position(content, '<command-name>/compound:feedback</command-name>'))
              - position(content, '<command-args>', position(content, '<command-name>/compound:feedback</command-name>'))
              - 14,
              5000
            )
          )
        ),
        concat('Feedback session in ', if(repository != '', repository, project_path))
      ) as content,
      'project' as scope,
      [] as tags,
      project_path,
      organization_id,
      repository,
      mapKeys(subagents) as subagents,
      skills,
      arrayFilter(x -> x != 'compound:feedback', slash_commands) as other_commands
    FROM feedback_data
    ORDER BY last_interaction_date DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

	return queryClickhouse<LearningEntry>({ query, query_params });
}

/**
 * Get learnings feed statistics
 */
export async function getLearningsFeedStats(
	orgId: string,
	params: {
		days?: number;
		user_id?: string;
		project_path?: string;
	} = {},
): Promise<LearningsFeedStats> {
	const { days = 30, user_id, project_path } = params;
	const d = Number(days);
	const query_params: Record<string, unknown> = {
		days: d,
		orgId,
	};
	const filters = [
		"last_interaction_date >= now64(3) - toIntervalDay({days:UInt32})",
		"has(slash_commands, 'compound:feedback')",
		"organization_id = {orgId:String}",
	];
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

	const statsQuery = `
    SELECT
      count() as total_learnings,
      uniq(user_id) as unique_users,
      uniq(project_path) as unique_projects
    FROM rudel.session_analytics
    WHERE ${filters.join("\n      AND ")}
  `;

	const timeSeriesQuery = `
    SELECT
      toDate(last_interaction_date) as date,
      count() as count
    FROM rudel.session_analytics
    WHERE ${filters.join("\n      AND ")}
    GROUP BY date
    ORDER BY date DESC
  `;

	const [statsData, timeSeriesData] = await Promise.all([
		queryClickhouse<{
			total_learnings: number;
			unique_users: number;
			unique_projects: number;
		}>({ query: statsQuery, query_params }),
		queryClickhouse<{ date: string; count: number }>({
			query: timeSeriesQuery,
			query_params,
		}),
	]);

	const stats = statsData[0] || {
		total_learnings: 0,
		unique_users: 0,
		unique_projects: 0,
	};

	return {
		...stats,
		learnings_by_day: timeSeriesData,
	};
}

/**
 * Get unique users who have used compound:feedback (for filter dropdown)
 */
export async function getLearningUsers(orgId: string): Promise<string[]> {
	const query = `
    SELECT DISTINCT user_id
    FROM rudel.session_analytics
    WHERE last_interaction_date >= now64(3) - toIntervalDay({days:UInt32})
      AND has(slash_commands, 'compound:feedback')
      AND organization_id = {orgId:String}
    ORDER BY user_id
  `;

	const data = await queryClickhouse<{ user_id: string }>({
		query,
		query_params: {
			days: 90,
			orgId,
		},
	});
	return data.map((row) => row.user_id);
}

/**
 * Get unique projects that have compound:feedback (for filter dropdown)
 */
export async function getLearningProjects(orgId: string): Promise<string[]> {
	const query = `
    SELECT DISTINCT project_path
    FROM rudel.session_analytics
    WHERE last_interaction_date >= now64(3) - toIntervalDay({days:UInt32})
      AND has(slash_commands, 'compound:feedback')
      AND organization_id = {orgId:String}
    ORDER BY project_path
  `;

	const data = await queryClickhouse<{ project_path: string }>({
		query,
		query_params: {
			days: 90,
			orgId,
		},
	});
	return data.map((row) => row.project_path);
}

/**
 * Get learnings trend over time with splits by user_id or repository
 */
export async function getLearningsTrend(
	orgId: string,
	params: {
		days?: number;
		split_by: "user_id" | "repository";
	},
): Promise<LearningsTrendDataPoint[]> {
	const { days = 30, split_by } = params;
	const d = Number(days);

	const splitColumn =
		split_by === "repository"
			? "if(git_remote != '', git_remote, if(package_name != '', package_name, project_path))"
			: "user_id";

	const query = `
    SELECT
      toDate(last_interaction_date) as date,
      ${splitColumn} as split_key,
      count() as count
    FROM rudel.session_analytics
    WHERE last_interaction_date >= now64(3) - toIntervalDay({days:UInt32})
      AND has(slash_commands, 'compound:feedback')
      AND organization_id = {orgId:String}
    GROUP BY date, split_key
    ORDER BY date ASC, split_key ASC
  `;

	const rawData = await queryClickhouse<{
		date: string;
		split_key: string;
		count: number;
	}>({
		query,
		query_params: {
			days: d,
			orgId,
		},
	});

	// Transform data into chart-friendly format
	const dataByDate = new Map<string, Record<string, number>>();
	const allSplitKeys = new Set<string>();

	rawData.forEach((row) => {
		if (!dataByDate.has(row.date)) {
			dataByDate.set(row.date, {});
		}
		const entry = dataByDate.get(row.date);
		if (entry) entry[row.split_key] = row.count;
		allSplitKeys.add(row.split_key);
	});

	const chartData: LearningsTrendDataPoint[] = Array.from(dataByDate.entries())
		.map(([date, counts]) => {
			const dataPoint: LearningsTrendDataPoint = { date };
			allSplitKeys.forEach((key) => {
				dataPoint[key] = counts[key] || 0;
			});
			return dataPoint;
		})
		.sort((a, b) => (a.date as string).localeCompare(b.date as string));

	return chartData;
}
