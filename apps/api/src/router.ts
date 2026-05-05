import { ORPCError } from "@orpc/server";
import { getAdapter } from "@rudel/agent-adapters";
import {
	type IngestSessionInput,
	PRODUCT_ANALYTICS_EVENTS,
} from "@rudel/api-routes";
import { getClickhouse } from "./clickhouse.js";
import { sqlClient } from "./db.js";
import { adminRouter } from "./handlers/admin/index.js";
import { analyticsRouter } from "./handlers/analytics/index.js";
import { profileRouter } from "./handlers/profile.js";
import { teamInviteLinkRouter } from "./handlers/team-invite-link.js";
import { wrappedDecimalClaimRouter } from "./handlers/wrapped-decimal-claim.js";
import { wrappedResumeRouter } from "./handlers/wrapped-resume.js";
import { wrappedShareRouter } from "./handlers/wrapped-share.js";
import {
	bucketContentSize,
	captureApiProductAnalyticsEvent,
	hashProjectPath,
} from "./lib/product-analytics.js";
import {
	authMiddleware,
	ingestAuthMiddleware,
	os,
	settingsMutationMiddleware,
} from "./middleware.js";
import {
	checkHookIngestRateLimit,
	checkManualIngestRateLimit,
} from "./rate-limit.js";
import {
	deleteOrgSessions,
	getOrgSessionCount,
	hasOrgUploadsInLastDays,
} from "./services/org-session.service.js";

function getSessionUploadCompletedPayload(
	input: IngestSessionInput,
	organizationId: string,
	userId: string,
) {
	if (!input.client_surface) {
		return null;
	}
	if (!input.upload_mode) {
		return null;
	}
	if (!input.cli_version) {
		return null;
	}
	if (!input.platform_os) {
		return null;
	}

	return {
		organization_id: organizationId,
		user_id: userId,
		client_surface: input.client_surface,
		upload_mode: input.upload_mode,
		agent_source: input.source,
		cli_version: input.cli_version,
		platform_os: input.platform_os,
		project_id_hash: hashProjectPath(input.projectPath),
		session_tag: input.tag,
		content_size_bucket: bucketContentSize(input.content.length),
	};
}

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

const cliSetupStatus = os.cli.setupStatus
	.use(authMiddleware)
	.handler(async ({ context }) => {
		const [status] = await sqlClient<Array<{ has_cli_login: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM apikey
				WHERE reference_id = ${context.user.id}
					AND name = 'rudel-cli-ingest'
					AND enabled = true
					AND (expires_at IS NULL OR expires_at > NOW())
			) AS has_cli_login
		`;

		return {
			hasCliLogin: status?.has_cli_login === true,
		};
	});

const listMyOrganizations = os.listMyOrganizations
	.use(authMiddleware)
	.handler(async ({ context }) => {
		const memberships = await sqlClient<
			Array<{
				id: string;
				logo: string | null;
				name: string;
				slug: string;
			}>
		>`
			SELECT
				o.id,
				o.name,
				o.slug,
				o.logo
			FROM member m
			INNER JOIN organization o
				ON m.organization_id = o.id
			WHERE m.user_id = ${context.user.id}
		`;

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

		if (input.upload_mode === "manual" || input.upload_mode === "retry") {
			checkManualIngestRateLimit(context.user.id, input.sessionId);
		} else {
			checkHookIngestRateLimit(context.user.id, input.sessionId);
		}

		const orgId = input.organizationId ?? activeOrgId ?? context.user.id;

		// Verify membership for any org that isn't the user's personal workspace
		if (orgId !== context.user.id) {
			const membership = await sqlClient<Array<{ id: string }>>`
				SELECT id
				FROM member
				WHERE organization_id = ${orgId}
					AND user_id = ${context.user.id}
				LIMIT 1
			`;

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

		const response = {
			success: true as const,
			sessionId: input.sessionId,
		};

		const uploadCompletedPayload = getSessionUploadCompletedPayload(
			input,
			orgId,
			context.user.id,
		);

		if (!uploadCompletedPayload) {
			return response;
		}

		captureApiProductAnalyticsEvent({
			distinctId: context.user.id,
			event: PRODUCT_ANALYTICS_EVENTS.SESSION_UPLOAD_COMPLETED,
			payload: uploadCompletedPayload,
		});

		return response;
	});

const revokeCliToken = os.cli.revokeToken
	.use(ingestAuthMiddleware)
	.handler(async ({ context }) => {
		if (!context.apiKeyId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No API key in current authentication context",
			});
		}

		await sqlClient`
			UPDATE apikey
			SET enabled = false, updated_at = ${new Date()}
			WHERE id = ${context.apiKeyId}
				AND reference_id = ${context.user.id}
		`;

		return { success: true as const };
	});

const getOrganizationSessionCount = os.getOrganizationSessionCount
	.use(authMiddleware)
	.handler(async ({ input, context }) => {
		const membership = await sqlClient<Array<{ id: string }>>`
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

		if (input.userId && input.userId !== context.user.id) {
			throw new ORPCError("FORBIDDEN", {
				message: "Cannot read another user's raw session count",
			});
		}

		const count = await getOrgSessionCount(input.organizationId, input.userId);
		return { count };
	});

const deleteOrganization = os.deleteOrganization
	.use(authMiddleware)
	.use(settingsMutationMiddleware)
	.handler(async ({ input, context }) => {
		const orgId = input.organizationId;
		const userId = context.user.id;
		console.log(`[deleteOrganization] user=${userId} org=${orgId}`);

		// Check user has more than one org
		const [membershipSummary] = await sqlClient<Array<{ count: number }>>`
			SELECT COUNT(*)::int AS count
			FROM member
			WHERE user_id = ${userId}
		`;
		const membershipCount = membershipSummary?.count ?? 0;

		if (membershipCount <= 1) {
			console.log(
				`[deleteOrganization] rejected: user=${userId} has only ${membershipCount} org(s)`,
			);
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot delete your only organization",
			});
		}

		// Verify user is owner of the target org
		const ownership = await sqlClient<Array<{ id: string }>>`
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
			const [targetOrganization] = await sqlClient<
				Array<{ createdAt: Date; id: string }>
			>`
				SELECT id, created_at AS "createdAt"
				FROM organization
				WHERE id = ${orgId}
				LIMIT 1
			`;
			const [memberCountResult] = await sqlClient<Array<{ count: number }>>`
				SELECT COUNT(*)::int AS count
				FROM member
				WHERE organization_id = ${orgId}
			`;
			const memberCount = memberCountResult?.count ?? 0;
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
			await sqlClient`
				DELETE FROM organization
				WHERE id = ${orgId}
			`;

			// Clear activeOrganizationId on user sessions that reference the deleted org
			console.log(
				`[deleteOrganization] clearing activeOrganizationId references for org=${orgId}`,
			);
			await sqlClient`
				UPDATE session
				SET active_organization_id = NULL
				WHERE active_organization_id = ${orgId}
			`;

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
					organization_member_count: memberCount,
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
	profile: profileRouter,
	cli: {
		authStatus: cliAuthStatus,
		revokeToken: revokeCliToken,
		setupStatus: cliSetupStatus,
	},
	listMyOrganizations,
	ingestSession: ingestSessionHandler,
	getOrganizationSessionCount,
	deleteOrganization,
	teamInviteLink: teamInviteLinkRouter,
	wrappedDecimalClaim: wrappedDecimalClaimRouter,
	wrappedResume: wrappedResumeRouter,
	wrappedShare: wrappedShareRouter,
	admin: adminRouter,
	analytics: analyticsRouter,
});
