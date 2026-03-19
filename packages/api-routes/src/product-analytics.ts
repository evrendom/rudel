import { z } from "zod";
import { SourceSchema } from "./schemas/source.js";

export const PRODUCT_ANALYTICS_EVENT_VERSION = 1 as const;

export const ProductAnalyticsSurfaceSchema = z.enum([
	"web",
	"cli",
	"hook",
	"api",
]);

export const ProductAnalyticsEnvironmentSchema = z.enum([
	"production",
	"staging",
	"development",
	"local",
]);

export const ProductAnalyticsUploadModeSchema = z.enum([
	"hook",
	"manual",
	"retry",
]);

export const ProductAnalyticsClientSurfaceSchema = z.enum(["cli", "hook"]);

export const ProductAnalyticsPlatformOsSchema = z.enum([
	"macos",
	"windows",
	"linux",
]);

export const ProductAnalyticsSignupMethodSchema = z.enum([
	"email_password",
	"google",
	"github",
]);

export const ProductAnalyticsAuthFlowSchema = z.literal("device_authorization");

export const ProductAnalyticsCliCommandNameSchema = z.enum([
	"login",
	"logout",
	"whoami",
	"upload",
	"enable",
	"disable",
	"set-org",
	"hooks",
	"dev",
	"help",
]);

export const ProductAnalyticsEntryPointSchema = z.enum([
	"homepage",
	"cli_device_login",
	"accept_invitation",
	"direct",
]);

export const ProductAnalyticsPageNameSchema = z.enum([
	"overview",
	"projects",
	"project_detail",
	"sessions",
	"session_detail",
	"developers",
	"errors",
	"learnings",
	"roi",
	"organization",
]);

export const ProductAnalyticsInsightTypeSchema = z.enum([
	"trend",
	"performer",
	"alert",
	"info",
]);

export const ProductAnalyticsInsightSeveritySchema = z.enum([
	"positive",
	"warning",
	"negative",
	"info",
]);

export const ProductAnalyticsOrganizationRoleSchema = z.enum([
	"owner",
	"admin",
	"member",
]);

export const ProductAnalyticsInviteRoleSchema = z.enum(["admin", "member"]);

export const ProductAnalyticsInviteChannelSchema = z.literal("email");

export const ProductAnalyticsInviteSourceSchema = z.literal("settings_members");

export const ProductAnalyticsJoinMethodSchema = z.literal("invite_accept");

export type ProductAnalyticsEnvironment = z.infer<
	typeof ProductAnalyticsEnvironmentSchema
>;
export type ProductAnalyticsSurface = z.infer<
	typeof ProductAnalyticsSurfaceSchema
>;
export type ProductAnalyticsUploadMode = z.infer<
	typeof ProductAnalyticsUploadModeSchema
>;
export type ProductAnalyticsClientSurface = z.infer<
	typeof ProductAnalyticsClientSurfaceSchema
>;
export type ProductAnalyticsPlatformOs = z.infer<
	typeof ProductAnalyticsPlatformOsSchema
>;

export const ProductAnalyticsDashboardQueryNameSchema = z.enum([
	"overview_kpis",
	"overview_usage_trend",
	"overview_model_tokens_trend",
	"overview_insights",
]);

export const ProductAnalyticsLoginFailureStageSchema = z.enum([
	"device_code_request",
	"browser_approval_timeout",
	"token_exchange",
	"api_key_create",
	"account_fetch",
]);

export const ProductAnalyticsEnableFailureStageSchema = z.enum([
	"auth_verify",
	"organization_fetch",
	"organization_select",
	"hook_install",
]);

export const ProductAnalyticsUploadFailureStageSchema = z.enum([
	"session_discovery",
	"read",
	"serialize",
	"auth",
	"network",
	"api",
	"validation",
	"rate_limit",
	"unknown",
]);

const RequiredCommonSchema = z.object({
	event_version: z.literal(PRODUCT_ANALYTICS_EVENT_VERSION),
	surface: ProductAnalyticsSurfaceSchema,
	environment: ProductAnalyticsEnvironmentSchema,
});

const idSchema = z.string().min(1);
const nonEmptyStringSchema = z.string().min(1);

export const PRODUCT_ANALYTICS_EVENTS = {
	ACCOUNT_SIGNED_UP: "Account Signed Up",
	SIGN_UP_FAILED: "Sign Up Failed",
	CLI_FIRST_RUN: "CLI First Run",
	CLI_LOGIN_STARTED: "CLI Login Started",
	CLI_LOGIN_APPROVED: "CLI Login Approved",
	CLI_LOGIN_FAILED: "CLI Login Failed",
	AUTO_UPLOAD_ENABLED: "Auto Upload Enabled",
	AUTO_UPLOAD_ENABLE_FAILED: "Auto Upload Enable Failed",
	SESSION_UPLOAD_COMPLETED: "Session Upload Completed",
	DASHBOARD_VIEWED: "Dashboard Viewed",
	DASHBOARD_LOAD_FAILED: "Dashboard Load Failed",
	INSIGHT_CARD_CLICKED: "Insight Card Clicked",
	INVITE_SENT: "Invite Sent",
	ORGANIZATION_MEMBER_JOINED: "Organization Member Joined",
	ORGANIZATION_DELETED: "Organization Deleted",
} as const;

export type ProductAnalyticsEventName =
	(typeof PRODUCT_ANALYTICS_EVENTS)[keyof typeof PRODUCT_ANALYTICS_EVENTS];

export const AccountSignedUpEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("api"),
	user_id: idSchema,
	signup_method: ProductAnalyticsSignupMethodSchema,
	is_default_organization_ready: z.boolean(),
	organization_id: idSchema.optional(),
	is_invite_flow: z.boolean().optional(),
	entry_point: ProductAnalyticsEntryPointSchema.optional(),
}).strict();

export const SignUpFailedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("web"),
	signup_method: ProductAnalyticsSignupMethodSchema,
	failure_stage: z.enum([
		"form_submit",
		"provider_redirect",
		"provider_callback",
		"server_validation",
	]),
	error_code: nonEmptyStringSchema,
	is_invite_flow: z.boolean().optional(),
	entry_point: ProductAnalyticsEntryPointSchema.optional(),
}).strict();

export const CliFirstRunEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("cli"),
	cli_installation_id: idSchema,
	cli_version: nonEmptyStringSchema,
	platform_os: ProductAnalyticsPlatformOsSchema,
	command_name: ProductAnalyticsCliCommandNameSchema,
	is_authenticated: z.boolean(),
}).strict();

export const CliLoginStartedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("cli"),
	auth_flow: ProductAnalyticsAuthFlowSchema,
	cli_version: nonEmptyStringSchema,
	platform_os: ProductAnalyticsPlatformOsSchema,
	opened_browser: z.boolean(),
	attempt_number: z.number().int().positive(),
}).strict();

export const CliLoginApprovedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("cli"),
	user_id: idSchema,
	auth_flow: ProductAnalyticsAuthFlowSchema,
	cli_version: nonEmptyStringSchema,
	platform_os: ProductAnalyticsPlatformOsSchema,
	opened_browser: z.boolean().optional(),
}).strict();

export const CliLoginFailedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("cli"),
	auth_flow: ProductAnalyticsAuthFlowSchema,
	failure_stage: ProductAnalyticsLoginFailureStageSchema,
	failure_reason: nonEmptyStringSchema,
	cli_version: nonEmptyStringSchema,
	platform_os: ProductAnalyticsPlatformOsSchema,
	opened_browser: z.boolean().optional(),
	attempt_number: z.number().int().positive(),
}).strict();

export const AutoUploadEnabledEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("cli"),
	organization_id: idSchema,
	user_id: idSchema,
	agent_source: SourceSchema,
	cli_version: nonEmptyStringSchema,
	platform_os: ProductAnalyticsPlatformOsSchema,
	is_already_enabled: z.boolean().optional(),
}).strict();

export const AutoUploadEnableFailedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("cli"),
	agent_source: z.union([SourceSchema, z.literal("unknown")]),
	failure_stage: ProductAnalyticsEnableFailureStageSchema,
	failure_reason: nonEmptyStringSchema,
	cli_version: nonEmptyStringSchema,
	platform_os: ProductAnalyticsPlatformOsSchema,
	organization_id: idSchema.optional(),
	user_id: idSchema.optional(),
}).strict();

export const SessionUploadCompletedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("api"),
	organization_id: idSchema,
	user_id: idSchema,
	client_surface: ProductAnalyticsClientSurfaceSchema,
	upload_mode: ProductAnalyticsUploadModeSchema,
	agent_source: SourceSchema,
	cli_version: nonEmptyStringSchema,
	platform_os: ProductAnalyticsPlatformOsSchema,
	project_id_hash: nonEmptyStringSchema.optional(),
	session_tag: nonEmptyStringSchema.optional(),
	content_size_bucket: nonEmptyStringSchema.optional(),
}).strict();

export const InviteSentEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("api"),
	organization_id: idSchema,
	inviter_user_id: idSchema,
	invite_channel: ProductAnalyticsInviteChannelSchema,
	invite_role: ProductAnalyticsInviteRoleSchema,
	invitee_email_domain: nonEmptyStringSchema,
	source: ProductAnalyticsInviteSourceSchema,
}).strict();

export const OrganizationMemberJoinedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("api"),
	organization_id: idSchema,
	member_user_id: idSchema,
	join_method: ProductAnalyticsJoinMethodSchema,
	role: ProductAnalyticsInviteRoleSchema,
	organization_member_count: z.number().int().nonnegative(),
}).strict();

export const OrganizationDeletedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("api"),
	organization_id: idSchema,
	deleter_user_id: idSchema,
	organization_age_days: z.number().int().nonnegative(),
	organization_member_count: z.number().int().nonnegative(),
	had_uploads_last_30d: z.boolean(),
}).strict();

export const DashboardViewedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("web"),
	organization_id: idSchema,
	user_id: idSchema,
	page_name: ProductAnalyticsPageNameSchema,
	has_data: z.boolean(),
	date_range_days: z.number().int().nonnegative(),
	insight_count: z.number().int().nonnegative(),
	is_first_dashboard_view: z.boolean().optional(),
	entry_point: nonEmptyStringSchema.optional(),
}).strict();

export const DashboardLoadFailedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("web"),
	organization_id: idSchema,
	user_id: idSchema,
	page_name: z.literal("overview"),
	query_name: ProductAnalyticsDashboardQueryNameSchema,
	error_code: nonEmptyStringSchema,
	date_range_days: z.number().int().nonnegative(),
	is_blocking: z.boolean(),
	http_status: z.number().int().positive().optional(),
}).strict();

export const InsightCardClickedEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("web"),
	organization_id: idSchema,
	user_id: idSchema,
	page_name: z.literal("overview"),
	insight_key: nonEmptyStringSchema,
	insight_type: ProductAnalyticsInsightTypeSchema,
	insight_severity: ProductAnalyticsInsightSeveritySchema,
	destination_path: nonEmptyStringSchema,
	position_index: z.number().int().nonnegative(),
	date_range_days: z.number().int().nonnegative(),
}).strict();

export const ProductAnalyticsEventSchemas = {
	[PRODUCT_ANALYTICS_EVENTS.ACCOUNT_SIGNED_UP]: AccountSignedUpEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.SIGN_UP_FAILED]: SignUpFailedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.CLI_FIRST_RUN]: CliFirstRunEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.CLI_LOGIN_STARTED]: CliLoginStartedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.CLI_LOGIN_APPROVED]: CliLoginApprovedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.CLI_LOGIN_FAILED]: CliLoginFailedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.AUTO_UPLOAD_ENABLED]: AutoUploadEnabledEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.AUTO_UPLOAD_ENABLE_FAILED]:
		AutoUploadEnableFailedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.SESSION_UPLOAD_COMPLETED]:
		SessionUploadCompletedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_VIEWED]: DashboardViewedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_LOAD_FAILED]:
		DashboardLoadFailedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.INSIGHT_CARD_CLICKED]:
		InsightCardClickedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.INVITE_SENT]: InviteSentEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_MEMBER_JOINED]:
		OrganizationMemberJoinedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_DELETED]:
		OrganizationDeletedEventSchema,
} satisfies Record<ProductAnalyticsEventName, z.ZodTypeAny>;

export type AccountSignedUpEvent = z.infer<typeof AccountSignedUpEventSchema>;
export type SignUpFailedEvent = z.infer<typeof SignUpFailedEventSchema>;
export type CliFirstRunEvent = z.infer<typeof CliFirstRunEventSchema>;
export type CliLoginStartedEvent = z.infer<typeof CliLoginStartedEventSchema>;
export type CliLoginApprovedEvent = z.infer<typeof CliLoginApprovedEventSchema>;
export type CliLoginFailedEvent = z.infer<typeof CliLoginFailedEventSchema>;
export type AutoUploadEnabledEvent = z.infer<
	typeof AutoUploadEnabledEventSchema
>;
export type AutoUploadEnableFailedEvent = z.infer<
	typeof AutoUploadEnableFailedEventSchema
>;
export type SessionUploadCompletedEvent = z.infer<
	typeof SessionUploadCompletedEventSchema
>;
export type DashboardViewedEvent = z.infer<typeof DashboardViewedEventSchema>;
export type DashboardLoadFailedEvent = z.infer<
	typeof DashboardLoadFailedEventSchema
>;
export type InsightCardClickedEvent = z.infer<
	typeof InsightCardClickedEventSchema
>;
export type InviteSentEvent = z.infer<typeof InviteSentEventSchema>;
export type OrganizationMemberJoinedEvent = z.infer<
	typeof OrganizationMemberJoinedEventSchema
>;
export type OrganizationDeletedEvent = z.infer<
	typeof OrganizationDeletedEventSchema
>;

export interface ProductAnalyticsEventPayloadMap {
	[PRODUCT_ANALYTICS_EVENTS.ACCOUNT_SIGNED_UP]: AccountSignedUpEvent;
	[PRODUCT_ANALYTICS_EVENTS.SIGN_UP_FAILED]: SignUpFailedEvent;
	[PRODUCT_ANALYTICS_EVENTS.CLI_FIRST_RUN]: CliFirstRunEvent;
	[PRODUCT_ANALYTICS_EVENTS.CLI_LOGIN_STARTED]: CliLoginStartedEvent;
	[PRODUCT_ANALYTICS_EVENTS.CLI_LOGIN_APPROVED]: CliLoginApprovedEvent;
	[PRODUCT_ANALYTICS_EVENTS.CLI_LOGIN_FAILED]: CliLoginFailedEvent;
	[PRODUCT_ANALYTICS_EVENTS.AUTO_UPLOAD_ENABLED]: AutoUploadEnabledEvent;
	[PRODUCT_ANALYTICS_EVENTS.AUTO_UPLOAD_ENABLE_FAILED]: AutoUploadEnableFailedEvent;
	[PRODUCT_ANALYTICS_EVENTS.SESSION_UPLOAD_COMPLETED]: SessionUploadCompletedEvent;
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_VIEWED]: DashboardViewedEvent;
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_LOAD_FAILED]: DashboardLoadFailedEvent;
	[PRODUCT_ANALYTICS_EVENTS.INSIGHT_CARD_CLICKED]: InsightCardClickedEvent;
	[PRODUCT_ANALYTICS_EVENTS.INVITE_SENT]: InviteSentEvent;
	[PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_MEMBER_JOINED]: OrganizationMemberJoinedEvent;
	[PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_DELETED]: OrganizationDeletedEvent;
}

export type ProductAnalyticsEventPayload<
	Name extends ProductAnalyticsEventName,
> = ProductAnalyticsEventPayloadMap[Name];

export function parseProductAnalyticsEvent<
	Name extends ProductAnalyticsEventName,
>(event: Name, payload: unknown): ProductAnalyticsEventPayload<Name> {
	const schema = ProductAnalyticsEventSchemas[event] as unknown as z.ZodType<
		ProductAnalyticsEventPayload<Name>
	>;
	return schema.parse(payload);
}
