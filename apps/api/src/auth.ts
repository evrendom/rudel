import { apiKey } from "@better-auth/api-key";
import { getLogger } from "@logtape/logtape";
import { PRODUCT_ANALYTICS_EVENTS } from "@rudel/api-routes";
import * as schema from "@rudel/sql-schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization, organization } from "better-auth/plugins";
import { captureApiProductAnalyticsEvent } from "./lib/product-analytics.js";
import { fetchGitHubHandle, notifySignup } from "./slack.js";

const logger = getLogger(["rudel", "api", "auth"]);

function inferSignupMethod(
	accounts: Array<{ providerId?: string | null }>,
): "email_password" | "google" | "github" {
	if (accounts.some((account) => account.providerId === "github")) {
		return "github";
	}
	if (accounts.some((account) => account.providerId === "google")) {
		return "google";
	}
	return "email_password";
}

export interface AuthConfig {
	appURL: string;
	secret?: string;
	socialProviders?: Record<string, { clientId: string; clientSecret: string }>;
	trustedOrigins?: string[];
	cliDeviceVerificationUrl?: string;
	slackWebhookUrl?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzleAdapter accepts { [key: string]: any }
export function createAuth(db: object, config: AuthConfig) {
	const trustedOrigins = config.trustedOrigins ?? [];
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
		emailAndPassword: {
			enabled: true,
		},
		socialProviders: config.socialProviders,
		plugins: [
			bearer(),
			apiKey({
				keyExpiration: {
					defaultExpiresIn: null,
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
			organization({
				allowUserToCreateOrganization: true,
				creatorRole: "owner",
				disableOrganizationDeletion: true,
			}),
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
										name: `${user.name}'s Workspace`,
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
								signup_method: inferSignupMethod(accounts),
								is_default_organization_ready: isDefaultOrganizationReady,
								organization_id: organizationId,
							},
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
								{ name: user.name, email: user.email },
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
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
