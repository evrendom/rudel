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

export const PRODUCT_ANALYTICS_DASHBOARD_PAGE_NAMES = [
	"overview",
	"developers",
	"developer_detail",
	"projects",
	"project_detail",
	"sessions",
	"session_detail",
	"errors",
	"learnings",
	"roi",
	"organization",
	"organization_create",
	"invitations",
	"profile",
] as const;

export const PRODUCT_ANALYTICS_APP_PAGE_NAMES = [
	...PRODUCT_ANALYTICS_DASHBOARD_PAGE_NAMES,
	"login",
	"signup",
	"accept_invitation",
	"device_login",
] as const;

export type ProductAnalyticsDashboardPageName =
	(typeof PRODUCT_ANALYTICS_DASHBOARD_PAGE_NAMES)[number];
export type ProductAnalyticsPageName =
	(typeof PRODUCT_ANALYTICS_APP_PAGE_NAMES)[number];

export const ProductAnalyticsDashboardPageNameSchema = z.enum(
	PRODUCT_ANALYTICS_DASHBOARD_PAGE_NAMES,
);
export const ProductAnalyticsPageNameSchema = z.enum(
	PRODUCT_ANALYTICS_APP_PAGE_NAMES,
);

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
const webEventValueSchema = z.union([
	nonEmptyStringSchema,
	z.number(),
	z.boolean(),
	z.null(),
]);

const WebEventSchema = RequiredCommonSchema.extend({
	surface: z.literal("web"),
	page_name: ProductAnalyticsPageNameSchema,
	organization_id: idSchema.optional(),
	user_id: idSchema.optional(),
	date_range_days: z.number().int().nonnegative().optional(),
	source_component: nonEmptyStringSchema.optional(),
});

const DashboardWebEventSchema = WebEventSchema.extend({
	page_name: ProductAnalyticsDashboardPageNameSchema,
	organization_id: idSchema,
	user_id: idSchema,
});

const ProductAnalyticsActionResultSchema = z.enum([
	"started",
	"succeeded",
	"failed",
]);

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
	DASHBOARD_NAVIGATION_CLICKED: "Dashboard Navigation Clicked",
	DASHBOARD_FILTER_CHANGED: "Dashboard Filter Changed",
	DASHBOARD_DRILLDOWN_OPENED: "Dashboard Drilldown Opened",
	CHART_EXPORT_TRIGGERED: "Chart Export Triggered",
	ORGANIZATION_ACTION_TRIGGERED: "Organization Action Triggered",
	AUTHENTICATION_ACTION_TRIGGERED: "Authentication Action Triggered",
	UI_UTILITY_USED: "UI Utility Used",
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

export const DashboardViewedEventSchema = DashboardWebEventSchema.extend({
	has_data: z.boolean(),
	date_range_days: z.number().int().nonnegative(),
	insight_count: z.number().int().nonnegative().nullable(),
}).catchall(webEventValueSchema);

export const DashboardLoadFailedEventSchema = DashboardWebEventSchema.extend({
	query_name: nonEmptyStringSchema,
	error_code: nonEmptyStringSchema,
	date_range_days: z.number().int().nonnegative(),
	is_blocking: z.boolean(),
	http_status: z.number().int().positive().optional(),
}).strict();

export const DashboardNavigationClickedEventSchema = WebEventSchema.extend({
	nav_type: nonEmptyStringSchema,
	to_page_name: ProductAnalyticsPageNameSchema.optional(),
	target_path: nonEmptyStringSchema.optional(),
	target_type: nonEmptyStringSchema.optional(),
	target_id: nonEmptyStringSchema.optional(),
	rank: z.number().int().nonnegative().optional(),
}).strict();

export const DashboardFilterChangedEventSchema = DashboardWebEventSchema.extend(
	{
		filter_name: nonEmptyStringSchema,
		filter_category: nonEmptyStringSchema,
		change_action: nonEmptyStringSchema,
		selection_count: z.number().int().nonnegative().optional(),
		value_key: nonEmptyStringSchema.optional(),
		affected_scope: nonEmptyStringSchema.optional(),
	},
).strict();

export const DashboardDrilldownOpenedEventSchema =
	DashboardWebEventSchema.extend({
		drilldown_method: nonEmptyStringSchema,
		target_type: nonEmptyStringSchema,
		target_path: nonEmptyStringSchema.optional(),
		target_id: nonEmptyStringSchema.optional(),
		rank: z.number().int().nonnegative().optional(),
	}).strict();

export const ChartExportTriggeredEventSchema = DashboardWebEventSchema.extend({
	chart_id: nonEmptyStringSchema,
	export_type: z.enum(["copy_image", "download_png", "share_x"]),
	chart_kind: nonEmptyStringSchema.optional(),
	share_destination: nonEmptyStringSchema.optional(),
	visible_series_count: z.number().int().nonnegative().optional(),
}).strict();

export const OrganizationActionTriggeredEventSchema = WebEventSchema.extend({
	action_name: nonEmptyStringSchema,
	target_type: nonEmptyStringSchema,
	target_id: nonEmptyStringSchema.optional(),
	target_role: nonEmptyStringSchema.optional(),
	provider: nonEmptyStringSchema.optional(),
	result: ProductAnalyticsActionResultSchema.optional(),
	error_code: nonEmptyStringSchema.optional(),
	http_status: z.number().int().positive().optional(),
}).strict();

export const AuthenticationActionTriggeredEventSchema = WebEventSchema.extend({
	action_name: nonEmptyStringSchema,
	auth_method: nonEmptyStringSchema.optional(),
	entrypoint: nonEmptyStringSchema.optional(),
	target_id: nonEmptyStringSchema.optional(),
	result: ProductAnalyticsActionResultSchema.optional(),
	error_code: nonEmptyStringSchema.optional(),
	http_status: z.number().int().positive().optional(),
}).strict();

export const UiUtilityUsedEventSchema = WebEventSchema.extend({
	utility_name: nonEmptyStringSchema,
	component_id: nonEmptyStringSchema,
	utility_state: nonEmptyStringSchema.optional(),
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
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_NAVIGATION_CLICKED]:
		DashboardNavigationClickedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_FILTER_CHANGED]:
		DashboardFilterChangedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_DRILLDOWN_OPENED]:
		DashboardDrilldownOpenedEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.CHART_EXPORT_TRIGGERED]:
		ChartExportTriggeredEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_ACTION_TRIGGERED]:
		OrganizationActionTriggeredEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.AUTHENTICATION_ACTION_TRIGGERED]:
		AuthenticationActionTriggeredEventSchema,
	[PRODUCT_ANALYTICS_EVENTS.UI_UTILITY_USED]: UiUtilityUsedEventSchema,
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
export type DashboardNavigationClickedEvent = z.infer<
	typeof DashboardNavigationClickedEventSchema
>;
export type DashboardFilterChangedEvent = z.infer<
	typeof DashboardFilterChangedEventSchema
>;
export type DashboardDrilldownOpenedEvent = z.infer<
	typeof DashboardDrilldownOpenedEventSchema
>;
export type ChartExportTriggeredEvent = z.infer<
	typeof ChartExportTriggeredEventSchema
>;
export type OrganizationActionTriggeredEvent = z.infer<
	typeof OrganizationActionTriggeredEventSchema
>;
export type AuthenticationActionTriggeredEvent = z.infer<
	typeof AuthenticationActionTriggeredEventSchema
>;
export type UiUtilityUsedEvent = z.infer<typeof UiUtilityUsedEventSchema>;
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
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_NAVIGATION_CLICKED]: DashboardNavigationClickedEvent;
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_FILTER_CHANGED]: DashboardFilterChangedEvent;
	[PRODUCT_ANALYTICS_EVENTS.DASHBOARD_DRILLDOWN_OPENED]: DashboardDrilldownOpenedEvent;
	[PRODUCT_ANALYTICS_EVENTS.CHART_EXPORT_TRIGGERED]: ChartExportTriggeredEvent;
	[PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_ACTION_TRIGGERED]: OrganizationActionTriggeredEvent;
	[PRODUCT_ANALYTICS_EVENTS.AUTHENTICATION_ACTION_TRIGGERED]: AuthenticationActionTriggeredEvent;
	[PRODUCT_ANALYTICS_EVENTS.UI_UTILITY_USED]: UiUtilityUsedEvent;
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
