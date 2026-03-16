import { z } from "zod";
import { SourceSchema } from "./source.js";

// ── Common inputs ──────────────────────────────────────────────────

const MAX_DAYS = 365;
const MAX_LIMIT = 1000;

export const DaysInputSchema = z.object({
	days: z.number().int().positive().max(MAX_DAYS).default(7),
});

export const PaginatedDaysInputSchema = DaysInputSchema.extend({
	limit: z.number().int().positive().max(MAX_LIMIT).default(100),
	offset: z.number().int().nonnegative().default(0),
});

export const DateRangeInputSchema = z.object({
	startDate: z.string().date(),
	endDate: z.string().date(),
});

const MAX_ID_FILTER_LENGTH = 512;
const MAX_PATH_FILTER_LENGTH = 4096;

// ── Overview ───────────────────────────────────────────────────────

export const OverviewKPIsSchema = z.object({
	distinct_users: z.number(),
	distinct_sessions: z.number(),
	distinct_projects: z.number(),
	distinct_subagents: z.number(),
	distinct_skills: z.number(),
	distinct_slash_commands: z.number(),
	total_sessions: z.number(),
});

export const UsageTrendDataSchema = z.object({
	date: z.string(),
	sessions: z.number(),
	active_users: z.number(),
	total_hours: z.number(),
	total_tokens: z.number(),
});

export const ModelTokensTrendDataSchema = z.object({
	date: z.string(),
	model: z.string(),
	total_tokens: z.number(),
	input_tokens: z.number(),
	output_tokens: z.number(),
});

export const InsightSchema = z.object({
	type: z.enum(["trend", "performer", "alert", "info"]),
	severity: z.enum(["positive", "warning", "negative", "info"]),
	message: z.string(),
	link: z.string().optional(),
});

export const TeamSummaryComparisonSchema = z.object({
	current: z.object({
		total_sessions: z.number(),
		active_users: z.number(),
		avg_duration_min: z.number(),
		avg_sessions_per_user: z.number(),
	}),
	previous: z.object({
		total_sessions: z.number(),
		active_users: z.number(),
		avg_duration_min: z.number(),
		avg_sessions_per_user: z.number(),
	}),
	changes: z.object({
		total_sessions: z.number(),
		active_users: z.number(),
		avg_duration_min: z.number(),
		avg_sessions_per_user: z.number(),
	}),
});

export const SuccessRateSchema = z.object({
	current: z.object({
		high_quality_sessions: z.number(),
		total_sessions: z.number(),
		success_rate: z.number(),
	}),
	previous: z.object({
		high_quality_sessions: z.number(),
		total_sessions: z.number(),
		success_rate: z.number(),
	}),
	changes: z.object({
		success_rate: z.number(),
	}),
});

// ── Developers ─────────────────────────────────────────────────────

export const DeveloperSummarySchema = z.object({
	user_id: z.string(),
	total_sessions: z.number(),
	active_days: z.number(),
	total_tokens: z.number(),
	input_tokens: z.number(),
	output_tokens: z.number(),
	total_duration_min: z.number(),
	avg_session_duration_min: z.number(),
	last_active_date: z.string(),
	success_rate: z.number(),
	cost: z.number(),
	success_rate_trend: z.number(),
});

export const DeveloperDetailsSchema = DeveloperSummarySchema.extend({
	distinct_projects: z.number(),
	error_count: z.number(),
});

export const DeveloperSessionSchema = z.object({
	session_id: z.string(),
	session_date: z.string(),
	project_path: z.string(),
	git_remote: z.string().optional(),
	package_name: z.string().optional(),
	duration_min: z.number(),
	total_tokens: z.number(),
	has_subagents: z.boolean(),
	has_skills: z.boolean(),
	has_slash_commands: z.boolean(),
	has_errors: z.boolean(),
	likely_success: z.boolean(),
});

export const DeveloperProjectSchema = z.object({
	project_path: z.string(),
	git_remote: z.string().optional(),
	package_name: z.string().optional(),
	sessions: z.number(),
	total_duration_min: z.number(),
	total_tokens: z.number(),
	first_session: z.string(),
	last_session: z.string(),
});

export const DeveloperTimelineSchema = z.object({
	date: z.string(),
	sessions: z.number(),
	total_duration_min: z.number(),
	total_tokens: z.number(),
});

export const DeveloperTrendDataPointSchema = z.object({
	date: z.string(),
	user_id: z.string(),
	sessions: z.number(),
	total_hours: z.number(),
	total_tokens: z.number(),
	avg_success_rate: z.number(),
});

export const DeveloperFeatureUsageSchema = z.object({
	subagents_adoption_rate: z.number(),
	skills_adoption_rate: z.number(),
	slash_commands_adoption_rate: z.number(),
	top_subagents: z.array(z.object({ name: z.string(), count: z.number() })),
	top_skills: z.array(z.object({ name: z.string(), count: z.number() })),
	top_slash_commands: z.array(
		z.object({ name: z.string(), count: z.number() }),
	),
});

export const DeveloperErrorSchema = z.object({
	error_pattern: z.string(),
	occurrences: z.number(),
	last_seen: z.string(),
});

// ── Developer input schemas ────────────────────────────────────────

export const DeveloperDetailsInputSchema = DaysInputSchema.extend({
	userId: z.string().max(MAX_ID_FILTER_LENGTH),
});

export const DeveloperSessionsInputSchema = DaysInputSchema.extend({
	userId: z.string().max(MAX_ID_FILTER_LENGTH),
	projectPath: z.string().max(MAX_PATH_FILTER_LENGTH).optional(),
	outcome: z.enum(["all", "success"]).default("all"),
	limit: z.number().int().positive().max(MAX_LIMIT).default(100),
	offset: z.number().int().nonnegative().default(0),
	sortBy: z.enum(["date", "duration", "tokens"]).default("date"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ── Projects ───────────────────────────────────────────────────────

export const ProjectInvestmentSchema = z.object({
	repository: z.string().nullable(),
	git_remote: z.string().optional(),
	project_path: z.string(),
	sessions: z.number(),
	unique_users: z.number(),
	total_duration_min: z.number(),
	total_tokens: z.number(),
	success_rate: z.number(),
	cost: z.number(),
	success_rate_trend: z.number(),
});

export const ProjectDetailDataSchema = z.object({
	project_path: z.string(),
	total_sessions: z.number(),
	total_tokens: z.number(),
	contributors_count: z.number(),
	errors_count: z.number(),
	avg_session_duration_min: z.number(),
	success_rate: z.number(),
	total_duration_min: z.number(),
	cost: z.number(),
});

export const ProjectContributorSchema = z.object({
	user_id: z.string(),
	sessions: z.number(),
	total_duration_min: z.number(),
	total_tokens: z.number(),
	contribution_percentage: z.number(),
});

export const ProjectFeatureUsageSchema = z.object({
	subagents_adoption_rate: z.number(),
	skills_adoption_rate: z.number(),
	slash_commands_adoption_rate: z.number(),
	top_subagents: z.array(z.object({ name: z.string(), count: z.number() })),
	top_skills: z.array(z.object({ name: z.string(), count: z.number() })),
	top_slash_commands: z.array(
		z.object({ name: z.string(), count: z.number() }),
	),
});

export const ProjectErrorSchema = z.object({
	error_pattern: z.string(),
	occurrences: z.number(),
	affected_users: z.number(),
	last_seen: z.string(),
});

export const ProjectTrendDataPointSchema = z.object({
	date: z.string(),
	project_path: z.string(),
	project_name: z.string(),
	sessions: z.number(),
	total_hours: z.number(),
	total_tokens: z.number(),
	avg_success_rate: z.number(),
});

export const ProjectDetailsInputSchema = DaysInputSchema.extend({
	projectPath: z.string().max(MAX_PATH_FILTER_LENGTH),
});

// ── Sessions ───────────────────────────────────────────────────────

export const SessionAnalyticsSchema = z.object({
	session_id: z.string(),
	user_id: z.string(),
	session_date: z.string(),
	project_path: z.string(),
	repository: z.string().nullable(),
	git_remote: z.string().optional(),
	duration_min: z.number(),
	total_tokens: z.number(),
	input_tokens: z.number(),
	output_tokens: z.number(),
	success_score: z.number(),
	total_interactions: z.number(),
	avg_period_sec: z.number(),
	subagent_types: z.array(z.string()),
	skills: z.array(z.string()),
	slash_commands: z.array(z.string()),
	has_commit: z.boolean(),
	session_archetype: z.string(),
	model_used: z.string(),
	used_plan_mode: z.boolean(),
	source: SourceSchema.optional(),
});

export const SessionAnalyticsSummarySchema = z.object({
	total_sessions: z.number(),
	avg_session_duration_min: z.number(),
	avg_response_time_sec: z.number(),
	subagents_adoption_rate: z.number(),
	skills_adoption_rate: z.number(),
	slash_commands_adoption_rate: z.number(),
});

export const SessionAnalyticsSummaryComparisonSchema = z.object({
	current: SessionAnalyticsSummarySchema,
	previous: SessionAnalyticsSummarySchema,
	changes: z.object({
		total_sessions: z.number(),
		avg_session_duration_min: z.number(),
		avg_response_time_sec: z.number(),
	}),
});

export const SessionListInputSchema = DaysInputSchema.extend({
	userId: z.string().max(MAX_ID_FILTER_LENGTH).optional(),
	projectPath: z.string().max(MAX_PATH_FILTER_LENGTH).optional(),
	repository: z.string().max(MAX_PATH_FILTER_LENGTH).optional(),
	source: SourceSchema.optional(),
	limit: z.number().int().positive().max(MAX_LIMIT).default(100),
	offset: z.number().int().nonnegative().default(0),
	sortBy: z
		.enum(["session_date", "duration_min", "total_tokens", "success_score"])
		.default("session_date"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const VALID_DIMENSIONS = [
	"user_id",
	"project_path",
	"repository",
	"session_archetype",
	"model_used",
	"has_commit",
	"used_plan_mode",
	"used_skills",
	"used_slash_commands",
	"used_subagents",
] as const;

const VALID_METRICS = [
	"session_count",
	"avg_duration",
	"total_duration",
	"avg_interactions",
	"total_interactions",
	"avg_response_time",
	"median_response_time",
	"avg_tokens",
	"total_tokens",
	"avg_success_score",
	"avg_errors",
	"total_errors",
] as const;

export const DimensionAnalysisInputSchema = DaysInputSchema.extend({
	dimension: z.enum(VALID_DIMENSIONS),
	metric: z.enum(VALID_METRICS),
	splitBy: z.enum(VALID_DIMENSIONS).optional(),
	limit: z.number().int().positive().max(MAX_LIMIT).default(20),
	userId: z.string().max(MAX_ID_FILTER_LENGTH).optional(),
	projectPath: z.string().max(MAX_PATH_FILTER_LENGTH).optional(),
});

export const DimensionAnalysisDataPointSchema = z.object({
	dimension_value: z.string(),
	metric_value: z.number().optional(),
	split_values: z.record(z.string(), z.number()).optional(),
});

export const SessionDetailSchema = z.object({
	session_id: z.string(),
	user_id: z.string(),
	session_date: z.string(),
	last_interaction_date: z.string(),
	project_path: z.string(),
	repository: z.string().nullable(),
	content: z.string(),
	subagents: z.record(z.string(), z.string()),
	skills: z.array(z.string()),
	slash_commands: z.array(z.string()),
	git_branch: z.string().nullable(),
	git_sha: z.string().nullable(),
	total_tokens: z.number(),
	input_tokens: z.number(),
	output_tokens: z.number(),
	success_score: z.number().optional(),
	duration_min: z.number().optional(),
	total_interactions: z.number().optional(),
	session_archetype: z.string().optional(),
	model_used: z.string().optional(),
	source: SourceSchema.optional(),
});

export const SessionDetailInputSchema = z.object({
	sessionId: z.string().max(MAX_ID_FILTER_LENGTH),
});

// ── ROI ────────────────────────────────────────────────────────────

export const ROIMetricsSchema = z.object({
	total_cost: z.number(),
	total_cost_change_pct: z.number(),
	cost_per_session: z.number(),
	cost_per_session_change_pct: z.number(),
	cost_per_commit: z.number(),
	cost_per_commit_change_pct: z.number(),
	total_tokens: z.number(),
	input_tokens: z.number(),
	output_tokens: z.number(),
	token_utilization_rate: z.number(),
	total_sessions: z.number(),
	total_commits: z.number(),
	total_hours: z.number(),
	active_developers: z.number(),
	avg_success_score: z.number(),
	commits_per_dollar: z.number(),
	sessions_per_dollar: z.number(),
	productivity_improvement_pct: z.number(),
	estimated_loc_generated: z.number(),
	dev_hours_saved: z.number(),
	dev_hours_saved_change_pct: z.number(),
	dollar_value_saved: z.number(),
	roi_percentage: z.number(),
	current_period_start: z.string(),
	current_period_end: z.string(),
	previous_period_start: z.string(),
	previous_period_end: z.string(),
});

export const ROITrendSchema = z.object({
	week_start: z.string(),
	total_cost: z.number(),
	total_sessions: z.number(),
	total_commits: z.number(),
	active_developers: z.number(),
	avg_success_score: z.number(),
	total_tokens: z.number(),
	output_tokens: z.number(),
	productivity_score: z.number(),
});

export const DeveloperCostBreakdownSchema = z.object({
	user_id: z.string(),
	sessions: z.number(),
	total_tokens: z.number(),
	cost: z.number(),
	cost_percentage: z.number(),
	avg_success_score: z.number(),
});

export const ProjectCostBreakdownSchema = z.object({
	project_path: z.string(),
	sessions: z.number(),
	total_tokens: z.number(),
	cost: z.number(),
	cost_percentage: z.number(),
	avg_success_score: z.number(),
});

// ── Errors ─────────────────────────────────────────────────────────

export const RecurringErrorSchema = z.object({
	error_pattern: z.string(),
	occurrences: z.number(),
	affected_sessions: z.number(),
	affected_users: z.number(),
	last_seen: z.string(),
	severity: z.enum(["high", "medium", "low"]),
	repositories: z.array(z.string()),
});

export const ErrorTrendDataPointSchema = z.object({
	date: z.string(),
	dimension: z.string(),
	avg_errors_per_interaction: z.number(),
	avg_errors_per_session: z.number(),
	total_errors: z.number(),
});

export const ErrorTrendsInputSchema = DateRangeInputSchema.extend({
	splitBy: z.enum(["project_path", "user_id", "model"]).default("project_path"),
});

export const RecurringErrorsInputSchema = DaysInputSchema.extend({
	minOccurrences: z.number().int().positive().default(2),
	limit: z.number().int().positive().max(MAX_LIMIT).default(20),
});

// ── Learnings ──────────────────────────────────────────────────────

export const LearningEntrySchema = z.object({
	session_id: z.string(),
	user_id: z.string(),
	created_at: z.string(),
	type: z.string(),
	content: z.string(),
	scope: z.string(),
	tags: z.array(z.string()),
	project_path: z.string(),
	repository: z.string().nullable(),
});

export const LearningsFeedStatsSchema = z.object({
	total_learnings: z.number(),
	unique_users: z.number(),
	unique_projects: z.number(),
	learnings_by_day: z.array(
		z.object({
			date: z.string(),
			count: z.number(),
		}),
	),
});

export const LearningsTrendDataPointSchema = z.record(
	z.string(),
	z.union([z.string(), z.number()]),
);

export const LearningsTrendInputSchema = DaysInputSchema.extend({
	splitBy: z.enum(["user_id", "repository"]),
});

// ── Type exports ───────────────────────────────────────────────────

export type OverviewKPIs = z.infer<typeof OverviewKPIsSchema>;
export type UsageTrendData = z.infer<typeof UsageTrendDataSchema>;
export type ModelTokensTrendData = z.infer<typeof ModelTokensTrendDataSchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type DeveloperSummary = z.infer<typeof DeveloperSummarySchema>;
export type DeveloperDetails = z.infer<typeof DeveloperDetailsSchema>;
export type DeveloperSession = z.infer<typeof DeveloperSessionSchema>;
export type DeveloperProject = z.infer<typeof DeveloperProjectSchema>;
export type DeveloperTrendDataPoint = z.infer<
	typeof DeveloperTrendDataPointSchema
>;
export type ProjectInvestment = z.infer<typeof ProjectInvestmentSchema>;
export type ProjectDetailData = z.infer<typeof ProjectDetailDataSchema>;
export type ProjectContributor = z.infer<typeof ProjectContributorSchema>;
export type ProjectTrendDataPoint = z.infer<typeof ProjectTrendDataPointSchema>;
export type SessionAnalytics = z.infer<typeof SessionAnalyticsSchema>;
export type SessionDetail = z.infer<typeof SessionDetailSchema>;
export type DimensionAnalysisDataPoint = z.infer<
	typeof DimensionAnalysisDataPointSchema
>;
export type ROIMetrics = z.infer<typeof ROIMetricsSchema>;
export type ROITrend = z.infer<typeof ROITrendSchema>;
export type DeveloperCostBreakdown = z.infer<
	typeof DeveloperCostBreakdownSchema
>;
export type ProjectCostBreakdown = z.infer<typeof ProjectCostBreakdownSchema>;
export type RecurringError = z.infer<typeof RecurringErrorSchema>;
export type ErrorTrendDataPoint = z.infer<typeof ErrorTrendDataPointSchema>;
export type LearningEntry = z.infer<typeof LearningEntrySchema>;
export type LearningsFeedStats = z.infer<typeof LearningsFeedStatsSchema>;
export type TeamSummaryComparison = z.infer<typeof TeamSummaryComparisonSchema>;
export type SuccessRate = z.infer<typeof SuccessRateSchema>;
export type DeveloperTimeline = z.infer<typeof DeveloperTimelineSchema>;
export type DeveloperFeatureUsage = z.infer<typeof DeveloperFeatureUsageSchema>;
export type DeveloperError = z.infer<typeof DeveloperErrorSchema>;
export type ProjectFeatureUsage = z.infer<typeof ProjectFeatureUsageSchema>;
export type ProjectError = z.infer<typeof ProjectErrorSchema>;
export type SessionAnalyticsSummary = z.infer<
	typeof SessionAnalyticsSummarySchema
>;
export type SessionAnalyticsSummaryComparison = z.infer<
	typeof SessionAnalyticsSummaryComparisonSchema
>;
export type LearningsTrendDataPoint = z.infer<
	typeof LearningsTrendDataPointSchema
>;
export type DimensionAnalysisInput = z.infer<
	typeof DimensionAnalysisInputSchema
>;
