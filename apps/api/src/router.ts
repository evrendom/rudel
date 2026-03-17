import { ORPCError } from "@orpc/server";
import { getAdapter } from "@rudel/agent-adapters";
import { PRODUCT_ANALYTICS_EVENTS } from "@rudel/api-routes";
import { apikey, member, organization, session } from "@rudel/sql-schema";
import { and, eq } from "drizzle-orm";
import { getClickhouse } from "./clickhouse.js";
import { db } from "./db.js";
import { analyticsRouter } from "./handlers/analytics/index.js";
import { captureApiProductAnalyticsEvent } from "./lib/product-analytics.js";
import { authMiddleware, ingestAuthMiddleware, os } from "./middleware.js";
import { checkIngestRateLimit } from "./rate-limit.js";
import {
	deleteOrgSessions,
	getOrgSessionCount,
	hasOrgUploadsInLastDays,
} from "./services/org-session.service.js";

const health = os.health.handler(() => {
	return {
		status: "ok" as const,
		timestamp: Date.now(),
	};
});

const me = os.me.use(authMiddleware).handler(({ context }) => {
	return {
		id: context.user.id,
		email: context.user.email,
		name: context.user.name,
		image: context.user.image ?? null,
		activeOrganizationId:
			((context.session as Record<string, unknown>).activeOrganizationId as
				| string
				| null) ?? null,
	};
});

const cliAuthStatus = os.cli.authStatus
	.use(ingestAuthMiddleware)
	.handler(({ context }) => {
		return {
			id: context.user.id,
			email: context.user.email,
			name: context.user.name,
		};
	});

const listMyOrganizations = os.listMyOrganizations
	.use(authMiddleware)
	.handler(async ({ context }) => {
		const memberships = await db
			.select({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
			})
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(eq(member.userId, context.user.id));

		return memberships.map((m) => ({
			id: m.id,
			name: m.name,
			slug: m.slug,
			logo: m.logo ?? null,
		}));
	});

const ingestSessionHandler = os.ingestSession
	.use(ingestAuthMiddleware)
	.handler(async ({ input, context }) => {
		const activeOrgId =
			context.session &&
			typeof (context.session as Record<string, unknown>)
				.activeOrganizationId === "string"
				? ((context.session as Record<string, unknown>)
						.activeOrganizationId as string)
				: null;

		await checkIngestRateLimit(context.user.id);

		const orgId = input.organizationId ?? activeOrgId ?? context.user.id;

		// Verify membership for any org that isn't the user's personal workspace
		if (orgId !== context.user.id) {
			const membership = await db
				.select({ id: member.id })
				.from(member)
				.where(
					and(
						eq(member.organizationId, orgId),
						eq(member.userId, context.user.id),
					),
				)
				.limit(1);

			if (membership.length === 0) {
				throw new ORPCError("FORBIDDEN", {
					message: "Not a member of the specified organization",
				});
			}
		}

		const adapter = getAdapter(input.source);
		await adapter.ingest(getClickhouse(), input, {
			userId: context.user.id,
			organizationId: orgId,
		});

		return {
			success: true as const,
			sessionId: input.sessionId,
		};
	});

const revokeCliToken = os.cli.revokeToken
	.use(ingestAuthMiddleware)
	.handler(async ({ context }) => {
		if (!context.apiKeyId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No API key in current authentication context",
			});
		}

		await db
			.update(apikey)
			.set({ enabled: false, updatedAt: new Date() })
			.where(
				and(
					eq(apikey.id, context.apiKeyId),
					eq(apikey.referenceId, context.user.id),
				),
			);

		return { success: true as const };
	});

const getOrganizationSessionCount = os.getOrganizationSessionCount
	.use(authMiddleware)
	.handler(async ({ input, context }) => {
		const membership = await db
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.organizationId, input.organizationId),
					eq(member.userId, context.user.id),
				),
			)
			.limit(1);

		if (membership.length === 0) {
			throw new ORPCError("FORBIDDEN", {
				message: "Not a member of this organization",
			});
		}

		const count = await getOrgSessionCount(input.organizationId);
		return { count };
	});

const deleteOrganization = os.deleteOrganization
	.use(authMiddleware)
	.handler(async ({ input, context }) => {
		const orgId = input.organizationId;
		const userId = context.user.id;
		console.log(`[deleteOrganization] user=${userId} org=${orgId}`);

		// Check user has more than one org
		const memberships = await db
			.select({ organizationId: member.organizationId })
			.from(member)
			.where(eq(member.userId, userId));

		if (memberships.length <= 1) {
			console.log(
				`[deleteOrganization] rejected: user=${userId} has only ${memberships.length} org(s)`,
			);
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot delete your only organization",
			});
		}

		// Verify user is owner of the target org
		const ownership = await db
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.organizationId, orgId),
					eq(member.userId, userId),
					eq(member.role, "owner"),
				),
			)
			.limit(1);

		if (ownership.length === 0) {
			console.log(
				`[deleteOrganization] rejected: user=${userId} is not owner of org=${orgId}`,
			);
			throw new ORPCError("FORBIDDEN", {
				message: "Only the organization owner can delete it",
			});
		}

		try {
			const [targetOrganization] = (await db
				.select({
					id: organization.id,
					createdAt: organization.createdAt,
				})
				.from(organization)
				.where(eq(organization.id, orgId))
				.limit(1)) as Array<{ id: string; createdAt: Date }>;
			const memberRows = await db
				.select({ id: member.id })
				.from(member)
				.where(eq(member.organizationId, orgId));
			let hadUploadsLast30d = false;
			try {
				hadUploadsLast30d = await hasOrgUploadsInLastDays(orgId, 30);
			} catch (analyticsError) {
				console.error(
					`[deleteOrganization] failed to inspect uploads for org=${orgId}:`,
					analyticsError,
				);
			}

			// Fire-and-forget: ClickHouse mutations are slow, don't block on them
			deleteOrgSessions(orgId);

			// Delete the organization from Postgres (cascade handles member + invitation)
			console.log(`[deleteOrganization] deleting org=${orgId} from Postgres`);
			await db.delete(organization).where(eq(organization.id, orgId));

			// Clear activeOrganizationId on user sessions that reference the deleted org
			console.log(
				`[deleteOrganization] clearing activeOrganizationId references for org=${orgId}`,
			);
			await db
				.update(session)
				.set({ activeOrganizationId: null })
				.where(eq(session.activeOrganizationId, orgId));

			captureApiProductAnalyticsEvent({
				distinctId: userId,
				event: PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_DELETED,
				payload: {
					organization_id: orgId,
					deleter_user_id: userId,
					organization_age_days: targetOrganization
						? Math.max(
								0,
								Math.floor(
									(Date.now() - targetOrganization.createdAt.getTime()) /
										(1000 * 60 * 60 * 24),
								),
							)
						: 0,
					organization_member_count: memberRows.length,
					had_uploads_last_30d: hadUploadsLast30d,
				},
			});

			console.log(`[deleteOrganization] success for org=${orgId}`);
			return { success: true as const };
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			console.error(`[deleteOrganization] failed for org=${orgId}:`, error);
			throw error;
		}
	});

export const router = os.router({
	health,
	me,
	cli: {
		authStatus: cliAuthStatus,
		revokeToken: revokeCliToken,
	},
	listMyOrganizations,
	ingestSession: ingestSessionHandler,
	getOrganizationSessionCount,
	deleteOrganization,
	analytics: analyticsRouter,
});
