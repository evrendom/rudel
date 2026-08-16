import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	DashboardDrilldownOpenedCaptureInputSchema,
	DashboardFilterChangedCaptureInputSchema,
	DashboardViewedCaptureInputSchema,
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
	HistoricalSkillDetailInputSchema,
	HistoricalSkillDetailSchema,
	HistoricalSkillSummarySchema,
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
import { sessionDetailProcedureContracts } from "./session-detail-contract.js";

export * from "./avatar.js";
export * from "./device-flow.js";
export * from "./model-pricing.js";
export * from "./model-rate-card.js";
export * from "./product-analytics.js";
export { type RepoIdentity, resolveRepoIdentity } from "./repo-identity.js";
export * from "./safe-url.js";
export * from "./schemas/analytics.js";
export {
	SESSION_DETAIL_ACTIVITY_POINT_LIMIT,
	SESSION_DETAIL_PREVIEW_CODE_POINT_LIMIT,
	SESSION_DETAIL_REVISION_ERRORS,
	SESSION_DETAIL_STALE_REVISION_CODE,
	SESSION_DETAIL_STALE_REVISION_MESSAGE,
	SESSION_DETAIL_TURN_PAGE_LIMIT,
	type SessionDetailOverview,
	type SessionDetailOverviewInput,
	SessionDetailOverviewInputSchema,
	SessionDetailOverviewSchema,
	SessionDetailRevisionSchema,
	type SessionDetailStaleRevisionData,
	SessionDetailStaleRevisionDataSchema,
	type SessionDetailSubagent,
	type SessionDetailSubagentInput,
	SessionDetailSubagentInputSchema,
	SessionDetailSubagentSchema,
	type SessionDetailTraceItem,
	SessionDetailTraceItemSchema,
	type SessionDetailTurn,
	type SessionDetailTurnInput,
	SessionDetailTurnInputSchema,
	SessionDetailTurnSchema,
} from "./schemas/session-detail-payload.js";
export * from "./schemas/wrapped-decimal-claim.js";
export * from "./schemas/wrapped-resume.js";
export * from "./schemas/wrapped-share.js";
export { sessionDetailProcedureContracts } from "./session-detail-contract.js";
export {
	calculateSessionRequestCost,
	type SessionRequestCostEntry,
	type SessionRequestUsageEvent,
	type SessionRequestUsageSummary,
	summarizeSessionRequestUsage,
	sumSessionRequestCosts,
} from "./session-request-pricing.js";
export {
	type AssistantEntry,
	AssistantEntrySchema,
	AssistantMessageSchema,
	addUniqueEditedFiles,
	assignCompactionsBeforeTurns,
	buildConversationTrace,
	type Conversation,
	type ConversationExecutionMode,
	ConversationExecutionModeSchema,
	ConversationSchema,
	compactPreview,
	extractCodexTokenData,
	extractSessionCompactionMetadata,
	extractSessionTurnMetrics,
	extractTranscriptUsageMetrics,
	formatClockTime,
	formatTimeDelta,
	getClaudeMutationFiles,
	getCodexMutationFiles,
	getSessionTurnId,
	getSessionTurnMemberPreview,
	getSessionTurnMemberText,
	getSessionTurnPreview,
	getSessionTurnTiming,
	groupTraceIntoTurns,
	isCodexFormat,
	isSlashCommandMessage,
	type ParsedSlashCommand,
	parseCodexConversations,
	parseConversations,
	parseSlashCommand,
	type SessionCompaction,
	type SessionCompactionMetadata,
	type SessionTurn,
	type SessionTurnErrorEvent,
	type SessionTurnMetrics,
	type SessionTurnSkillEvent,
	type SummaryEntry,
	SummaryEntrySchema,
	type SystemEntry,
	SystemEntrySchema,
	type TextContent,
	TextContentSchema,
	type ThinkingContent,
	ThinkingContentSchema,
	type TokenUsageEvent,
	type ToolResultContent,
	ToolResultContentSchema,
	type ToolUseContent,
	ToolUseContentSchema,
	type TraceEvent,
	type TraceItem,
	type TraceSkillContent,
	type TraceSystemType,
	type TraceToolResult,
	toolResultText,
	type UserContent,
	type UserEntry,
	UserEntrySchema,
	UserMessageSchema,
	userContentText,
} from "./session-transcript/index.js";

export const HealthSchema = z.object({
	status: z.literal("ok"),
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

export const ChatwootIdentitySchema = z.object({
	identifier: z.string(),
	identifier_hash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const OrganizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullable(),
});

export const TeamInviteLinkSchema = z.object({
	expires_at: z.string().datetime(),
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
	filter_version: z.number().int().min(0).max(65_535).optional(),
	force_replace: z.boolean().optional(),
});

export const IngestSessionOutputSchema = z.object({
	success: z.literal(true),
	sessionId: z.string(),
	redacted: z.record(z.string(), z.number().int().nonnegative()).default({}),
	redactedBytes: z.number().int().nonnegative().optional(),
	usageChecksum: z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.optional(),
});

export const REDACTION_BUDGET_EXCEEDED_CODE = "REDACTION_BUDGET_EXCEEDED";
export const REDACTION_BUDGET_EXCEEDED_MESSAGE =
	"Known-pattern redaction exceeded the transcript safety budget.";
export const REDACTION_DID_NOT_CONVERGE_CODE = "REDACTION_DID_NOT_CONVERGE";
export const REDACTION_DID_NOT_CONVERGE_MESSAGE =
	"Known-pattern redaction did not converge within the safety limit.";
export const SECRET_FILTER_JSON_INTEGRITY_CODE = "SECRET_FILTER_JSON_INTEGRITY";
export const SECRET_FILTER_JSON_INTEGRITY_MESSAGE =
	"Secret filtering could not preserve transcript JSON integrity.";
export const SESSION_OWNERSHIP_CONFLICT_CODE = "SESSION_OWNERSHIP_CONFLICT";
export const SESSION_OWNERSHIP_CONFLICT_MESSAGE =
	"This session belongs to another organization member and cannot be replaced.";
export const SESSION_UPLOAD_SHRINK_REJECTED_CODE =
	"SESSION_UPLOAD_SHRINK_REJECTED";
export const SESSION_UPLOAD_SHRINK_REJECTED_MESSAGE =
	"This upload is smaller than the stored session and was refused to protect existing data. Inspect the transcript, then use `rudel upload --force-replace` only if the replacement is intentional. If your CLI does not recognize the flag, upgrade rudel first.";

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

const ProductAnalyticsCaptureResultSchema = z.object({
	success: z.literal(true),
});

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
	chatwoot: {
		identity: oc.output(ChatwootIdentitySchema.nullable()),
	},
	listMyOrganizations: oc.output(z.array(OrganizationSchema)),
	ingestSession: oc
		.input(IngestSessionInputSchema)
		.output(IngestSessionOutputSchema)
		.errors({
			[REDACTION_BUDGET_EXCEEDED_CODE]: {
				status: 422,
				message: REDACTION_BUDGET_EXCEEDED_MESSAGE,
				data: z.object({
					inputBytes: z.number().int().nonnegative(),
					redactedBytes: z.number().int().nonnegative(),
					ruleIds: z.array(z.string()),
				}),
			},
			[REDACTION_DID_NOT_CONVERGE_CODE]: {
				status: 422,
				message: REDACTION_DID_NOT_CONVERGE_MESSAGE,
				data: z.object({
					maxPasses: z.number().int().positive(),
				}),
			},
			[SECRET_FILTER_JSON_INTEGRITY_CODE]: {
				status: 422,
				message: SECRET_FILTER_JSON_INTEGRITY_MESSAGE,
			},
			[SESSION_OWNERSHIP_CONFLICT_CODE]: {
				status: 409,
				message: SESSION_OWNERSHIP_CONFLICT_MESSAGE,
			},
			[SESSION_UPLOAD_SHRINK_REJECTED_CODE]: {
				status: 409,
				message: SESSION_UPLOAD_SHRINK_REJECTED_MESSAGE,
				data: z.object({
					currentAssistantLineCount: z.number().int().nonnegative(),
					currentContentBytes: z.number().int().nonnegative(),
					previousAssistantLineCount: z.number().int().nonnegative(),
					previousContentBytes: z.number().int().nonnegative(),
				}),
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
		create: oc
			.input(z.object({ organizationId: z.string() }))
			.output(TeamInviteLinkSchema),
		revoke: oc
			.input(z.object({ organizationId: z.string() }))
			.output(z.object({ success: z.literal(true) })),
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
	productAnalytics: {
		dashboardViewed: oc
			.input(DashboardViewedCaptureInputSchema)
			.output(ProductAnalyticsCaptureResultSchema),
		dashboardFilterChanged: oc
			.input(DashboardFilterChangedCaptureInputSchema)
			.output(ProductAnalyticsCaptureResultSchema),
		dashboardDrilldownOpened: oc
			.input(DashboardDrilldownOpenedCaptureInputSchema)
			.output(ProductAnalyticsCaptureResultSchema),
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
			detailOverview: sessionDetailProcedureContracts.detailOverview,
			detailSubagent: sessionDetailProcedureContracts.detailSubagent,
			detailTurn: sessionDetailProcedureContracts.detailTurn,
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
		skills: {
			list: oc.output(z.array(HistoricalSkillSummarySchema)),
			detail: oc
				.input(HistoricalSkillDetailInputSchema)
				.output(HistoricalSkillDetailSchema),
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
