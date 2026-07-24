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
	DeveloperTeamCardSchema,
	DeveloperTimelineSchema,
	DeveloperTrendDataPointSchema,
	DimensionAnalysisDataPointSchema,
	DimensionAnalysisInputSchema,
	ErrorsDashboardSchema,
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
	RepositoryDailyTrendDataSchema,
	ROIDashboardSchema,
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
	UserDailyTrendDataSchema,
	UserTokenUsageDataSchema,
	WrappedV1Schema,
} from "./schemas/analytics.js";
import {
	RedeemWrappedDecimalClaimInputSchema,
	RedeemWrappedDecimalClaimResultSchema,
	WrappedDecimalClaimEntitlementSchema,
} from "./schemas/wrapped-decimal-claim.js";
import {
	ConsumeWrappedResumeInputSchema,
	CreateWrappedResumeInputSchema,
	WrappedResumeConsumeResultSchema,
	WrappedResumeRecordSchema,
} from "./schemas/wrapped-resume.js";
import {
	CreateWrappedShareInputSchema,
	GetPublicWrappedShareInputSchema,
	PublicWrappedShareSchema,
	WrappedShareRecordSchema,
} from "./schemas/wrapped-share.js";

export * from "./avatar.js";
export * from "./model-pricing.js";
export * from "./product-analytics.js";
export * from "./schemas/analytics.js";
export * from "./schemas/wrapped-decimal-claim.js";
export * from "./schemas/wrapped-resume.js";
export * from "./schemas/wrapped-share.js";

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

export const CliSetupStatusSchema = z.object({
	hasCliLogin: z.boolean(),
});

export const OrganizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullable(),
});

export const TeamInviteLinkSchema = z.object({
	invite_url: z.string().url(),
	organization_id: z.string(),
	organization_name: z.string(),
});

export const TeamInviteAcceptResultSchema = z.object({
	organization_id: z.string(),
	organization_name: z.string(),
	status: z.enum(["already_member", "joined"]),
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

export const INGEST_AGGREGATE_CONTENT_MAX_BYTES = 128 * 1024 * 1024;
export const INGEST_MAX_SUBAGENT_COUNT = 512;
export const INGEST_LIMIT_REASONS = {
	requestLimit: "request_limit",
	byteLimit: "byte_limit",
	sessionLimit: "session_limit",
	transcriptTooLarge: "transcript_too_large",
} as const;
export type IngestLimitReason =
	(typeof INGEST_LIMIT_REASONS)[keyof typeof INGEST_LIMIT_REASONS];

const INGEST_CONTENT_MAX_CODE_UNITS = 160 * 1024 * 1024;

export const SubagentFileSchema = z.object({
	agentId: z.string().max(200),
	content: z.string().max(INGEST_CONTENT_MAX_CODE_UNITS),
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
	content: z.string().max(INGEST_CONTENT_MAX_CODE_UNITS),
	subagents: z
		.array(SubagentFileSchema)
		.max(INGEST_MAX_SUBAGENT_COUNT)
		.refine(
			(subagents) =>
				new Set(subagents.map((subagent) => subagent.agentId)).size ===
				subagents.length,
			{ message: "Subagent agentId values must be unique" },
		)
		.optional(),
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

export const SESSION_OWNERSHIP_CONFLICT_CODE = "SESSION_OWNERSHIP_CONFLICT";
export const SESSION_OWNERSHIP_CONFLICT_MESSAGE =
	"This session belongs to another organization member and cannot be replaced.";

export type IngestSessionInput = z.infer<typeof IngestSessionInputSchema>;

export const AdminUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
	createdAt: z.string(),
	organizationCount: z.number(),
});

export const UpdateProfileInputSchema = z.object({
	name: z.string().trim().min(1).max(100),
	image: z.string().nullable(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export const contract = {
	health: oc.output(HealthSchema),
	me: oc.output(UserSchema),
	profile: {
		updateMine: oc.input(UpdateProfileInputSchema).output(UserSchema),
		deleteMine: oc.output(z.object({ success: z.literal(true) })),
	},
	cli: {
		authStatus: oc.output(CliUserSchema),
		revokeToken: oc.output(z.object({ success: z.literal(true) })),
		setupStatus: oc.output(CliSetupStatusSchema),
	},
	listMyOrganizations: oc.output(z.array(OrganizationSchema)),
	ingestSession: oc
		.input(IngestSessionInputSchema)
		.output(IngestSessionOutputSchema)
		.errors({
			[SESSION_OWNERSHIP_CONFLICT_CODE]: {
				status: 409,
				message: SESSION_OWNERSHIP_CONFLICT_MESSAGE,
			},
		}),
	getOrganizationSessionCount: oc
		.input(
			z.object({ organizationId: z.string(), userId: z.string().optional() }),
		)
		.output(z.object({ count: z.number() })),
	deleteOrganization: oc
		.input(z.object({ organizationId: z.string() }))
		.output(z.object({ success: z.literal(true) })),
	teamInviteLink: {
		get: oc
			.input(z.object({ organizationId: z.string() }))
			.output(TeamInviteLinkSchema),
		accept: oc
			.input(z.object({ token: z.string().min(1) }))
			.output(TeamInviteAcceptResultSchema),
	},
	wrappedShare: {
		create: oc
			.input(CreateWrappedShareInputSchema)
			.output(WrappedShareRecordSchema),
		getPublic: oc
			.input(GetPublicWrappedShareInputSchema)
			.output(PublicWrappedShareSchema),
	},
	wrappedResume: {
		create: oc
			.input(CreateWrappedResumeInputSchema)
			.output(WrappedResumeRecordSchema),
		consume: oc
			.input(ConsumeWrappedResumeInputSchema)
			.output(WrappedResumeConsumeResultSchema),
	},
	wrappedDecimalClaim: {
		redeem: oc
			.input(RedeemWrappedDecimalClaimInputSchema)
			.output(RedeemWrappedDecimalClaimResultSchema),
		getMine: oc.output(WrappedDecimalClaimEntitlementSchema),
	},
	admin: {
		listUsers: oc
			.input(
				z.object({
					search: z.string().optional(),
					limit: z.number().min(1).max(100).default(50),
					offset: z.number().min(0).default(0),
				}),
			)
			.output(
				z.object({
					users: z.array(AdminUserSchema),
					total: z.number(),
				}),
			),
		deleteUser: oc
			.input(z.object({ userId: z.string() }))
			.output(z.object({ success: z.literal(true) })),
	},
	analytics: {
		overview: {
			kpis: oc.input(DateRangeInputSchema).output(OverviewKPIsSchema),
			usageTrend: oc
				.input(DateRangeInputSchema)
				.output(z.array(UsageTrendDataSchema)),
			modelTokensTrend: oc
				.input(DateRangeInputSchema)
				.output(z.array(ModelTokensTrendDataSchema)),
			usersTokenUsage: oc
				.input(DateRangeInputSchema)
				.output(z.array(UserTokenUsageDataSchema)),
			usersDailyTrend: oc
				.input(DateRangeInputSchema)
				.output(z.array(UserDailyTrendDataSchema)),
			repositoriesDailyTrend: oc
				.input(DateRangeInputSchema)
				.output(z.array(RepositoryDailyTrendDataSchema)),
			insights: oc.input(DateRangeInputSchema).output(z.array(InsightSchema)),
			teamSummaryComparison: oc
				.input(DateRangeInputSchema)
				.output(TeamSummaryComparisonSchema),
			successRate: oc.input(DateRangeInputSchema).output(SuccessRateSchema),
		},
		developers: {
			list: oc.input(DaysInputSchema).output(z.array(DeveloperSummarySchema)),
			teamCards: oc
				.input(DaysInputSchema)
				.output(z.array(DeveloperTeamCardSchema)),
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
			dashboard: oc.input(DateRangeInputSchema).output(ROIDashboardSchema),
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
			dashboard: oc.input(DateRangeInputSchema).output(ErrorsDashboardSchema),
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
		wrapped: {
			v1: oc.output(WrappedV1Schema),
		},
	},
};
