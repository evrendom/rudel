import { apiKey } from "@better-auth/api-key";
import { getLogger } from "@logtape/logtape";
import { PRODUCT_ANALYTICS_EVENTS } from "@rudel/api-routes";
import * as schema from "@rudel/sql-schema";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import {
	bearer,
	deviceAuthorization,
	emailOTP,
	organization,
} from "better-auth/plugins";
import type { ResendConfig } from "./email.js";
import {
	sendEmailVerificationOtpEmail,
	sendOrganizationInvitationEmail,
	sendPasswordResetEmail,
	syncSignupContact,
} from "./email.js";
import { captureApiProductAnalyticsEvent } from "./lib/product-analytics.js";
import { fetchGitHubHandle, notifySignup } from "./slack.js";

const logger = getLogger(["rudel", "api", "auth"]);
const YC_REVIEW_SESSION_FORBIDDEN_MESSAGE =
	"YC review sessions cannot access settings";
const YC_REVIEW_RESTRICTED_AUTH_PATHS = [
	"/change-email",
	"/change-password",
	"/delete-user",
	"/link-social",
	"/organization/accept-invitation",
	"/organization/cancel-invitation",
	"/organization/create",
	"/organization/delete",
	"/organization/invite-member",
	"/organization/leave",
	"/organization/reject-invitation",
	"/organization/remove-member",
	"/organization/set-active",
	"/organization/update",
	"/organization/update-member-role",
	"/set-password",
	"/unlink-account",
	"/update-user",
] as const;

function inferSignupMethod(
	accounts: Array<{ providerId?: string | null }>,
	context?: { path?: string },
): "email_otp" | "email_password" | "google" | "github" {
	if (accounts.some((account) => account.providerId === "github")) {
		return "github";
	}
	if (accounts.some((account) => account.providerId === "google")) {
		return "google";
	}
	if (context?.path === "/sign-in/email-otp") {
		return "email_otp";
	}
	return "email_password";
}

function getEmailDomain(email: string) {
	const domain = email.split("@")[1]?.trim().toLowerCase();
	return domain && domain.length > 0 ? domain : "unknown";
}

function formatFallbackName(email: string) {
	const localPart = email.split("@")[0]?.trim();
	if (!localPart) {
		return "Rudel User";
	}

	const words = localPart
		.split(/[._-]+/)
		.map((word) => word.trim())
		.filter(Boolean);
	if (words.length === 0) {
		return localPart;
	}

	return words
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");
}

function getUserDisplayName(user: { email: string; name?: string | null }) {
	const trimmedName = user.name?.trim();
	return trimmedName && trimmedName.length > 0
		? trimmedName
		: formatFallbackName(user.email);
}

function toTrackedOrganizationRole(
	role: string | null | undefined,
): "admin" | "member" {
	return role === "admin" ? "admin" : "member";
}

export interface AuthConfig {
	appURL: string;
	frontendURL: string;
	secret?: string;
	resend?: ResendConfig;
	socialProviders?: Record<string, { clientId: string; clientSecret: string }>;
	trustedOrigins?: string[];
	cliDeviceVerificationUrl?: string;
	slackWebhookUrl?: string;
	ycLogin?: YcLoginConfig;
}

export interface YcLoginConfig {
	allowedEmails?: readonly string[];
	passwordHash?: string;
	targetEmail?: string;
}

interface NormalizedYcLoginConfig {
	allowedEmails: readonly string[];
	passwordHash: string;
	targetEmail: string;
}

interface YcLoginRequestBody {
	email: string;
	password: string;
	rememberMe: boolean | undefined;
}

function createOrganizationPlugin(config: AuthConfig) {
	const resend = config.resend ?? {};

	return organization({
		allowUserToCreateOrganization: true,
		creatorRole: "owner",
		disableOrganizationDeletion: true,
		async sendInvitationEmail(data) {
			await sendOrganizationInvitationEmail(resend, {
				frontendURL: config.frontendURL,
				invitationId: data.id,
				inviteeEmail: data.email,
				inviterName: data.inviter.user.name,
				organizationName: data.organization.name,
			});
		},
	});
}

export function getYcLoginConfigFromEnv(
	env: Record<string, string | undefined> = process.env,
): YcLoginConfig {
	return {
		allowedEmails: parseCommaSeparatedEmails(env.YC_LOGIN_ALLOWED_EMAILS),
		passwordHash: env.YC_LOGIN_PASSWORD_HASH?.trim(),
		targetEmail: normalizeEmail(env.YC_LOGIN_TARGET_EMAIL ?? ""),
	};
}

export function createYcLoginPlugin(
	config: YcLoginConfig,
): BetterAuthPlugin | null {
	const normalizedConfig = normalizeYcLoginConfig(config);
	if (!normalizedConfig) {
		return null;
	}

	return {
		id: "rudel-yc-login",
		schema: {
			session: {
				fields: {
					ycReview: {
						type: "boolean",
						required: false,
						input: false,
						defaultValue: false,
					},
				},
			},
		},
		endpoints: {
			ycSignIn: createAuthEndpoint(
				"/yc/sign-in",
				{
					allowedMediaTypes: ["application/json"],
					method: "POST",
				},
				async (ctx) => {
					const body = parseYcLoginRequestBody(ctx.body);
					if (!body) {
						throw invalidYcLoginError();
					}

					const email = normalizeEmail(body.email);
					if (!normalizedConfig.allowedEmails.includes(email)) {
						await ctx.context.password.hash(body.password);
						throw invalidYcLoginError();
					}

					const isPasswordValid = await ctx.context.password
						.verify({
							hash: normalizedConfig.passwordHash,
							password: body.password,
						})
						.catch(() => false);
					if (!isPasswordValid) {
						throw invalidYcLoginError();
					}

					const user = await ctx.context.internalAdapter.findUserByEmail(
						normalizedConfig.targetEmail,
					);
					if (!user) {
						ctx.context.logger.error("YC login target user not found");
						throw invalidYcLoginError();
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.user.id,
						body.rememberMe === false,
						{ ycReview: true },
						true,
					);
					if (!session) {
						ctx.context.logger.error("Failed to create YC login session");
						throw invalidYcLoginError();
					}

					await setSessionCookie(
						ctx,
						{
							session,
							user: user.user,
						},
						body.rememberMe === false,
					);

					return ctx.json({
						redirect: false,
						token: session.token,
						url: null,
						user: user.user,
					});
				},
			),
		},
		hooks: {
			before: [
				{
					matcher(context) {
						return (
							typeof context.path === "string" &&
							isYcReviewRestrictedAuthPath(context.path)
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const session = await getSessionFromCtx(ctx).catch(() => null);
						if (!isYcReviewSessionRecord(session?.session)) {
							return;
						}

						throw new APIError("FORBIDDEN", {
							message: YC_REVIEW_SESSION_FORBIDDEN_MESSAGE,
						});
					}),
				},
			],
		},
	};
}

export function isYcReviewSessionRecord(value: unknown) {
	return isRecord(value) && value.ycReview === true;
}

function normalizeYcLoginConfig(
	config: YcLoginConfig,
): NormalizedYcLoginConfig | null {
	const allowedEmails = [...new Set(config.allowedEmails?.map(normalizeEmail))]
		.filter(isValidEmail)
		.sort();
	const targetEmail = normalizeEmail(config.targetEmail ?? "");
	const passwordHash = config.passwordHash?.trim();

	if (
		allowedEmails.length === 0 ||
		!isValidEmail(targetEmail) ||
		!passwordHash
	) {
		return null;
	}

	return {
		allowedEmails,
		passwordHash,
		targetEmail,
	};
}

function parseYcLoginRequestBody(value: unknown): YcLoginRequestBody | null {
	if (!isRecord(value)) {
		return null;
	}

	const { email, password, rememberMe } = value;
	if (typeof email !== "string" || typeof password !== "string") {
		return null;
	}

	return {
		email,
		password,
		rememberMe: typeof rememberMe === "boolean" ? rememberMe : undefined,
	};
}

function invalidYcLoginError() {
	return new APIError("UNAUTHORIZED", {
		message: "Invalid email or password",
	});
}

function parseCommaSeparatedEmails(value: string | undefined) {
	if (!value) {
		return [];
	}

	return value.split(",").map(normalizeEmail).filter(isValidEmail);
}

function normalizeEmail(value: string) {
	return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isYcReviewRestrictedAuthPath(path: string) {
	const authEndpointPath =
		path === "/api/auth"
			? "/"
			: path.startsWith("/api/auth/")
				? path.slice("/api/auth".length)
				: path;

	return YC_REVIEW_RESTRICTED_AUTH_PATHS.some(
		(restrictedPath) =>
			authEndpointPath === restrictedPath ||
			authEndpointPath.startsWith(`${restrictedPath}/`),
	);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzleAdapter accepts { [key: string]: any }
export function createAuth(db: object, config: AuthConfig) {
	const trustedOrigins = config.trustedOrigins ?? [];
	const resend = config.resend ?? {};
	const ycLoginPlugin = createYcLoginPlugin(config.ycLogin ?? {});
	if (!trustedOrigins.includes(config.appURL)) {
		trustedOrigins.push(config.appURL);
	}

	return betterAuth({
		baseURL: config.appURL,
		secret: config.secret,
		database: drizzleAdapter(db as Parameters<typeof drizzleAdapter>[0], {
			provider: "pg",
			schema,
		}),
		rateLimit: {
			window: 60,
			max: 30,
			customRules: {
				"/organization/set-active": {
					window: 10,
					max: 10,
				},
			},
		},
		emailAndPassword: {
			enabled: true,
			sendResetPassword: async ({ user, url }) => {
				void sendPasswordResetEmail(resend, {
					email: user.email,
					resetUrl: url,
				});
			},
		},
		socialProviders: config.socialProviders,
		plugins: [
			emailOTP({
				allowedAttempts: 5,
				expiresIn: 5 * 60,
				otpLength: 6,
				rateLimit: {
					window: 60,
					max: 5,
				},
				storeOTP: "hashed",
				sendVerificationOTP: async ({ email, otp, type }) => {
					const isSent = await sendEmailVerificationOtpEmail(resend, {
						email,
						otp,
						type,
					});
					if (!isSent) {
						throw new Error("Email verification code delivery is unavailable");
					}
				},
			}),
			bearer(),
			apiKey({
				keyExpiration: {
					defaultExpiresIn: null,
				},
				rateLimit: {
					enabled: false,
				},
				permissions: {
					defaultPermissions: {
						ingest: ["write"],
					},
				},
			}),
			deviceAuthorization({
				validateClient: async (clientId) => clientId === "rudel-cli",
				verificationUri: config.cliDeviceVerificationUrl,
			}),
			createOrganizationPlugin(config),
			...(ycLoginPlugin ? [ycLoginPlugin] : []),
		],
		session: {
			expiresIn: 60 * 60 * 24 * 365,
		},
		trustedOrigins,
		databaseHooks: {
			user: {
				create: {
					after: async (user, ctx) => {
						const adapter = ctx?.context?.adapter;
						let organizationId: string | undefined;
						let isDefaultOrganizationReady = false;
						let accounts: Array<{
							providerId: string;
							accountId: string;
						}> = [];

						try {
							const displayName = getUserDisplayName(user);
							if (adapter) {
								accounts = (await adapter.findMany({
									model: "account",
									where: [{ field: "userId", value: user.id }],
								})) as Array<{ providerId: string; accountId: string }>;

								const slug = `${user.email.split("@")[0]}-${user.id.slice(0, 8)}`;
								const org = await adapter.create({
									model: "organization",
									data: {
										id: user.id,
										name: `${displayName}'s Workspace`,
										slug,
										createdAt: new Date(),
									},
									forceAllowId: true,
								});

								if (org) {
									await adapter.create({
										model: "member",
										data: {
											organizationId: org.id,
											userId: user.id,
											role: "owner",
											createdAt: new Date(),
										},
									});
									organizationId = org.id;
									isDefaultOrganizationReady = true;
								}
							}
						} catch (err) {
							logger.error(
								"Failed to create default organization for user {userId}: {error}",
								{ userId: user.id, error: err },
							);
						}

						captureApiProductAnalyticsEvent({
							distinctId: user.id,
							event: PRODUCT_ANALYTICS_EVENTS.ACCOUNT_SIGNED_UP,
							payload: {
								user_id: user.id,
								signup_method: inferSignupMethod(accounts, ctx ?? undefined),
								is_default_organization_ready: isDefaultOrganizationReady,
								organization_id: organizationId,
							},
						});

						await syncSignupContact(resend, {
							email: user.email,
							name: getUserDisplayName(user),
						});

						if (!config.slackWebhookUrl || !adapter) {
							return;
						}

						try {
							let githubHandle: string | null = null;
							const githubAccount = accounts.find(
								(account) => account.providerId === "github",
							);
							if (githubAccount) {
								githubHandle = await fetchGitHubHandle(githubAccount.accountId);
							}
							await notifySignup(
								config.slackWebhookUrl,
								{
									email: user.email,
									name: getUserDisplayName(user),
								},
								githubHandle,
							);
						} catch (err) {
							logger.error(
								"Failed to notify signup for user {userId}: {error}",
								{
									userId: user.id,
									error: err,
								},
							);
						}
					},
				},
			},
			invitation: {
				create: {
					after: async (invitation: {
						organizationId: string;
						inviterId: string;
						role: string;
						email: string;
					}) => {
						captureApiProductAnalyticsEvent({
							distinctId: invitation.inviterId,
							event: PRODUCT_ANALYTICS_EVENTS.INVITE_SENT,
							payload: {
								organization_id: invitation.organizationId,
								inviter_user_id: invitation.inviterId,
								invite_channel: "email",
								invite_role: toTrackedOrganizationRole(invitation.role),
								invitee_email_domain: getEmailDomain(invitation.email),
								source: "settings_members",
							},
						});
					},
				},
			},
			member: {
				create: {
					after: async (
						createdMember: {
							organizationId: string;
							userId: string;
							role: string;
						},
						ctx: {
							context?: {
								adapter?: {
									findMany: (args: {
										model: string;
										where: Array<{ field: string; value: string }>;
									}) => Promise<unknown>;
								};
							};
						},
					) => {
						if (
							createdMember.role === "owner" ||
							createdMember.organizationId === createdMember.userId
						) {
							return;
						}

						const adapter = ctx?.context?.adapter;
						const members = adapter
							? ((await adapter.findMany({
									model: "member",
									where: [
										{
											field: "organizationId",
											value: createdMember.organizationId,
										},
									],
								})) as Array<{ id: string }>)
							: [];

						captureApiProductAnalyticsEvent({
							distinctId: createdMember.userId,
							event: PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_MEMBER_JOINED,
							payload: {
								organization_id: createdMember.organizationId,
								member_user_id: createdMember.userId,
								join_method: "invite_accept",
								role: toTrackedOrganizationRole(createdMember.role),
								organization_member_count: members.length,
							},
						});
					},
				},
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
