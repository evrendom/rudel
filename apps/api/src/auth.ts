import { getLogger } from "@logtape/logtape";
import * as schema from "@rudel/sql-schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { fetchGitHubHandle, notifySignup } from "./slack.js";

const logger = getLogger(["rudel", "api", "auth"]);

export interface AuthConfig {
	appURL: string;
	secret?: string;
	socialProviders?: Record<string, { clientId: string; clientSecret: string }>;
	trustedOrigins?: string[];
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
			organization({
				allowUserToCreateOrganization: true,
				creatorRole: "owner",
				disableOrganizationDeletion: true,
			}),
		],
		session: {
			expiresIn: 60 * 60 * 24 * 30,
		},
		trustedOrigins,
		databaseHooks: {
			user: {
				create: {
					after: async (user, ctx) => {
						try {
							const adapter = ctx?.context?.adapter;
							if (!adapter) return;

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
							}

							if (config.slackWebhookUrl) {
								let githubHandle: string | null = null;
								const accounts = (await adapter.findMany({
									model: "account",
									where: [{ field: "userId", value: user.id }],
								})) as Array<{ providerId: string; accountId: string }>;
								const githubAccount = accounts.find(
									(a) => a.providerId === "github",
								);
								if (githubAccount) {
									githubHandle = await fetchGitHubHandle(
										githubAccount.accountId,
									);
								}
								await notifySignup(
									config.slackWebhookUrl,
									{ name: user.name, email: user.email },
									githubHandle,
								);
							}
						} catch (err) {
							logger.error(
								"Failed to create default organization for user {userId}: {error}",
								{ userId: user.id, error: err },
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
