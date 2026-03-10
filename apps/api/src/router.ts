import { ORPCError } from "@orpc/server";
import { getAdapter } from "@rudel/agent-adapters";
import { revokeCliCredential } from "./cli-credentials.js";
import { getClickhouse } from "./clickhouse.js";
import { pgClient } from "./db.js";
import { analyticsRouter } from "./handlers/analytics/index.js";
import { enforceIngestRateLimit } from "./ingest-rate-limit.js";
import {
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
		const memberships = await pgClient<
			{
				id: string;
				name: string;
				slug: string;
				logo: string | null;
			}[]
		>`
			SELECT o.id, o.name, o.slug, o.logo
			FROM member m
			INNER JOIN organization o ON m.organization_id = o.id
			WHERE m.user_id = ${context.user.id}
		`;

		return memberships.map((m) => ({
			id: m.id,
			name: m.name,
			slug: m.slug,
			logo: m.logo ?? null,
		}));
	});

const revokeCurrentCliCredentialHandler = os.revokeCurrentCliCredential
	.use(authMiddleware)
	.handler(async ({ context }) => {
		if (context.session.kind !== "cli") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Current authentication is not a CLI credential",
			});
		}

		await revokeCliCredential(context.session.id, context.user.id);
		return { success: true as const };
	});

const ingestSessionHandler = os.ingestSession
	.use(authMiddleware)
	.handler(async ({ input, context }) => {
		await enforceIngestRateLimit(context.user.id);
		const ingestSecurity = getIngestSecurityConfig();
		validateIngestPayload(input, ingestSecurity);

		if (input.organizationId) {
			const membership = await pgClient<{ id: string }[]>`
				SELECT id
				FROM member
				WHERE organization_id = ${input.organizationId}
					AND user_id = ${context.user.id}
				LIMIT 1
			`;

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
		const membership = await pgClient<{ id: string }[]>`
			SELECT id
			FROM member
			WHERE organization_id = ${input.organizationId}
				AND user_id = ${context.user.id}
			LIMIT 1
		`;

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
		const memberships = await pgClient<{ organization_id: string }[]>`
			SELECT organization_id
			FROM member
			WHERE user_id = ${userId}
		`;

		if (memberships.length <= 1) {
			console.log(
				`[deleteOrganization] rejected: user=${userId} has only ${memberships.length} org(s)`,
			);
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot delete your only organization",
			});
		}

		// Verify user is owner of the target org
		const ownership = await pgClient<{ id: string }[]>`
			SELECT id
			FROM member
			WHERE organization_id = ${orgId}
				AND user_id = ${userId}
				AND role = 'owner'
			LIMIT 1
		`;

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
			await pgClient`
				DELETE FROM organization
				WHERE id = ${orgId}
			`;

			// Clear activeOrganizationId on user sessions that reference the deleted org
			console.log(
				`[deleteOrganization] clearing activeOrganizationId references for org=${orgId}`,
			);
			await pgClient`
				UPDATE "session"
				SET active_organization_id = NULL
				WHERE active_organization_id = ${orgId}
			`;

			await pgClient`
				UPDATE cli_credential
				SET active_organization_id = NULL
				WHERE active_organization_id = ${orgId}
			`;

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
	revokeCurrentCliCredential: revokeCurrentCliCredentialHandler,
	ingestSession: ingestSessionHandler,
	getOrganizationSessionCount,
	deleteOrganization,
	analytics: analyticsRouter,
});
