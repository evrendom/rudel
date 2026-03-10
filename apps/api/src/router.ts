import { ORPCError } from "@orpc/server";
import { getAdapter } from "@rudel/agent-adapters";
import { member, organization, session } from "@rudel/sql-schema";
import { and, eq } from "drizzle-orm";
import { getClickhouse } from "./clickhouse.js";
import { db } from "./db.js";
import { analyticsRouter } from "./handlers/analytics/index.js";
import {
	enforceIngestRateLimit,
	getIngestSecurityConfig,
	validateIngestPayload,
} from "./ingest-security.js";
import {
	authMiddleware,
	os,
	resolveActiveOrganizationId,
} from "./middleware.js";
import {
	deleteOrgSessions,
	getOrgSessionCount,
} from "./services/org-session.service.js";

const health = os.health.handler(() => {
	return {
		status: "ok" as const,
		timestamp: Date.now(),
	};
});

const me = os.me.use(authMiddleware).handler(async ({ context }) => {
	const activeOrganizationId = await resolveActiveOrganizationId(
		context.user.id,
		context.session,
	);
	return {
		id: context.user.id,
		email: context.user.email,
		name: context.user.name,
		image: context.user.image ?? null,
		activeOrganizationId,
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
	.use(authMiddleware)
	.handler(async ({ input, context }) => {
		enforceIngestRateLimit(context.user.id);
		const ingestSecurity = getIngestSecurityConfig();
		validateIngestPayload(input, ingestSecurity);

		if (input.organizationId) {
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
					message: "Not a member of the specified organization",
				});
			}
		}

		const orgId =
			input.organizationId ??
			(await resolveActiveOrganizationId(context.user.id, context.session));

		const adapter = getAdapter(input.source);
		await adapter.ingest(getClickhouse(), input, {
			userId: context.user.id,
			organizationId: orgId,
			retentionPolicy: ingestSecurity.retentionPolicy,
		});

		return {
			success: true as const,
			sessionId: input.sessionId,
		};
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
	listMyOrganizations,
	ingestSession: ingestSessionHandler,
	getOrganizationSessionCount,
	deleteOrganization,
	analytics: analyticsRouter,
});
