import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	ProductAnalyticsClientSurfaceSchema,
	ProductAnalyticsPlatformOsSchema,
	ProductAnalyticsUploadModeSchema,
} from "./product-analytics.js";
import {
	DateRangeInputSchema,
	DaysInputSchema,
	DeveloperCostBreakdownSchema,
	DeveloperDetailsInputSchema,
	DeveloperDetailsSchema,
	DeveloperErrorSchema,
	DeveloperFeatureUsageSchema,
	DeveloperProjectSchema,
	DeveloperSessionSchema,
	DeveloperSessionsInputSchema,
	DeveloperSummarySchema,
	DeveloperTimelineSchema,
	DeveloperTrendDataPointSchema,
	DimensionAnalysisDataPointSchema,
	DimensionAnalysisInputSchema,
	ErrorTrendDataPointSchema,
	ErrorTrendsInputSchema,
	InsightSchema,
	LearningEntrySchema,
	LearningsFeedStatsSchema,
	LearningsTrendDataPointSchema,
	LearningsTrendInputSchema,
	ModelTokensTrendDataSchema,
	OverviewKPIsSchema,
	PaginatedDaysInputSchema,
	ProjectContributorSchema,
	ProjectCostBreakdownSchema,
	ProjectDetailDataSchema,
	ProjectDetailsInputSchema,
	ProjectErrorSchema,
	ProjectFeatureUsageSchema,
	ProjectInvestmentSchema,
	ProjectTrendDataPointSchema,
	RecurringErrorSchema,
	RecurringErrorsInputSchema,
	ROIMetricsSchema,
	ROITrendSchema,
	SessionAnalyticsSchema,
	SessionAnalyticsSummaryComparisonSchema,
	SessionAnalyticsSummarySchema,
	SessionDetailInputSchema,
	SessionDetailSchema,
	SessionListInputSchema,
	SuccessRateSchema,
	TeamSummaryComparisonSchema,
	UsageTrendDataSchema,
} from "./schemas/analytics.js";

export * from "./product-analytics.js";
export * from "./schemas/analytics.js";

export const HealthSchema = z.object({
	status: z.literal("ok"),
	timestamp: z.number(),
});

export const UserSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string(),
	image: z.string().nullable(),
	activeOrganizationId: z.string().nullable(),
});

export const CliUserSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string(),
});

export const OrganizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullable(),
});

export const SessionTagSchema = z.enum([
	"research",
	"new_feature",
	"bug_fix",
	"refactoring",
	"documentation",
	"tests",
	"other",
]);

export type { Source } from "./schemas/source.js";
export { SourceSchema } from "./schemas/source.js";

import { SourceSchema } from "./schemas/source.js";

export const SubagentFileSchema = z.object({
	agentId: z.string(),
	content: z.string(),
});

export const IngestSessionInputSchema = z.object({
	source: SourceSchema.default("claude_code"),
	sessionId: z.string().max(200),
	projectPath: z
		.string()
		.max(200)
		.transform((p) => p.replace(/\\/g, "/")),
	gitRemote: z.string().max(200).optional(),
	packageName: z.string().max(200).optional(),
	packageType: z.string().max(200).optional(),
	gitBranch: z.string().max(200).optional(),
	gitSha: z.string().max(200).optional(),
	tag: SessionTagSchema.optional(),
	content: z.string(),
	subagents: z.array(SubagentFileSchema).optional(),
	organizationId: z.string().max(200).optional(),
	client_surface: ProductAnalyticsClientSurfaceSchema.optional(),
	upload_mode: ProductAnalyticsUploadModeSchema.optional(),
	cli_version: z.string().max(200).optional(),
	platform_os: ProductAnalyticsPlatformOsSchema.optional(),
});

export const IngestSessionOutputSchema = z.object({
	success: z.literal(true),
	sessionId: z.string(),
});

export type IngestSessionInput = z.infer<typeof IngestSessionInputSchema>;

export const contract = {
	health: oc.output(HealthSchema),
	me: oc.output(UserSchema),
	cli: {
		authStatus: oc.output(CliUserSchema),
		revokeToken: oc.output(z.object({ success: z.literal(true) })),
	},
	listMyOrganizations: oc.output(z.array(OrganizationSchema)),
	ingestSession: oc
		.input(IngestSessionInputSchema)
		.output(IngestSessionOutputSchema),
	getOrganizationSessionCount: oc
		.input(z.object({ organizationId: z.string() }))
		.output(z.object({ count: z.number() })),
	deleteOrganization: oc
		.input(z.object({ organizationId: z.string() }))
		.output(z.object({ success: z.literal(true) })),
	analytics: {
		overview: {
			kpis: oc.input(DateRangeInputSchema).output(OverviewKPIsSchema),
			usageTrend: oc
				.input(DateRangeInputSchema)
				.output(z.array(UsageTrendDataSchema)),
			modelTokensTrend: oc
				.input(DateRangeInputSchema)
				.output(z.array(ModelTokensTrendDataSchema)),
			insights: oc.input(DateRangeInputSchema).output(z.array(InsightSchema)),
			teamSummaryComparison: oc
				.input(DateRangeInputSchema)
				.output(TeamSummaryComparisonSchema),
			successRate: oc.input(DateRangeInputSchema).output(SuccessRateSchema),
		},
		developers: {
			list: oc.input(DaysInputSchema).output(z.array(DeveloperSummarySchema)),
			details: oc
				.input(DeveloperDetailsInputSchema)
				.output(DeveloperDetailsSchema),
			sessions: oc
				.input(DeveloperSessionsInputSchema)
				.output(z.array(DeveloperSessionSchema)),
			projects: oc
				.input(DeveloperDetailsInputSchema)
				.output(z.array(DeveloperProjectSchema)),
			timeline: oc
				.input(DeveloperDetailsInputSchema)
				.output(z.array(DeveloperTimelineSchema)),
			features: oc
				.input(DeveloperDetailsInputSchema)
				.output(DeveloperFeatureUsageSchema),
			errors: oc
				.input(DeveloperDetailsInputSchema)
				.output(z.array(DeveloperErrorSchema)),
			trends: oc
				.input(DaysInputSchema)
				.output(z.array(DeveloperTrendDataPointSchema)),
		},
		projects: {
			investment: oc
				.input(DaysInputSchema)
				.output(z.array(ProjectInvestmentSchema)),
			trends: oc
				.input(DaysInputSchema)
				.output(z.array(ProjectTrendDataPointSchema)),
			details: oc
				.input(ProjectDetailsInputSchema)
				.output(ProjectDetailDataSchema),
			contributors: oc
				.input(ProjectDetailsInputSchema)
				.output(z.array(ProjectContributorSchema)),
			features: oc
				.input(ProjectDetailsInputSchema)
				.output(ProjectFeatureUsageSchema),
			errors: oc
				.input(ProjectDetailsInputSchema)
				.output(z.array(ProjectErrorSchema)),
		},
		sessions: {
			list: oc
				.input(SessionListInputSchema)
				.output(z.array(SessionAnalyticsSchema)),
			summary: oc.input(DaysInputSchema).output(SessionAnalyticsSummarySchema),
			summaryComparison: oc
				.input(DaysInputSchema)
				.output(SessionAnalyticsSummaryComparisonSchema),
			dimensionAnalysis: oc
				.input(DimensionAnalysisInputSchema)
				.output(z.array(DimensionAnalysisDataPointSchema)),
			detail: oc.input(SessionDetailInputSchema).output(SessionDetailSchema),
		},
		roi: {
			metrics: oc.input(DaysInputSchema).output(ROIMetricsSchema),
			trends: oc.input(DaysInputSchema).output(z.array(ROITrendSchema)),
			breakdownDevelopers: oc
				.input(DaysInputSchema)
				.output(z.array(DeveloperCostBreakdownSchema)),
			breakdownProjects: oc
				.input(DaysInputSchema)
				.output(z.array(ProjectCostBreakdownSchema)),
		},
		errors: {
			topRecurring: oc
				.input(RecurringErrorsInputSchema)
				.output(z.array(RecurringErrorSchema)),
			trends: oc
				.input(ErrorTrendsInputSchema)
				.output(z.array(ErrorTrendDataPointSchema)),
		},
		learnings: {
			list: oc
				.input(PaginatedDaysInputSchema)
				.output(z.array(LearningEntrySchema)),
			stats: oc.input(DaysInputSchema).output(LearningsFeedStatsSchema),
			users: oc.output(z.array(z.string())),
			projects: oc.output(z.array(z.string())),
			trend: oc
				.input(LearningsTrendInputSchema)
				.output(z.array(LearningsTrendDataPointSchema)),
		},
	},
};
