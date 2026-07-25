import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { getAdapter } from "@rudel/agent-adapters";
import {
	INGEST_AGGREGATE_CONTENT_MAX_BYTES,
	type IngestSessionInput,
	PRODUCT_ANALYTICS_EVENTS,
	SESSION_OWNERSHIP_CONFLICT_CODE,
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
import { computeIngestContentHash } from "./lib/ingest-content-hash.js";
import { enforceIngestAggregateSize } from "./lib/ingest-size.js";
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
	checkIngestByteRateLimit,
	checkIngestRequestRateLimit,
	checkManualIngestRateLimit,
	checkOrganizationSessionCountRateLimit,
} from "./rate-limit.js";
import {
	deleteOrgSessions,
	getCachedOrgSessionCount,
	hasOrgUploadsInLastDays,
} from "./services/org-session.service.js";
import {
	claimSessionIngestOwnership,
	recordSessionIngestContent,
} from "./services/session-ownership.service.js";

const logger = getLogger(["rudel", "api", "router"]);

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
	.handler(async ({ input, context, errors }) => {
		checkIngestRequestRateLimit(context.user.id);
		const aggregateBytes = enforceIngestAggregateSize(
			input,
			INGEST_AGGREGATE_CONTENT_MAX_BYTES,
		);
		checkIngestByteRateLimit(context.user.id, aggregateBytes);

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

		const ownership = await claimSessionIngestOwnership(
			orgId,
			input.sessionId,
			context.user.id,
		);
		if (!ownership.owned) {
			throw errors[SESSION_OWNERSHIP_CONFLICT_CODE]();
		}

		const contentHash = computeIngestContentHash(input);
		const response = {
			success: true as const,
			sessionId: input.sessionId,
		};

		// This is a best-effort cost optimization, not a cross-instance
		// security control. Concurrent identical requests can both reach the
		// ClickHouse insert before either records its successful hash.
		if (ownership.lastContentSha256 === contentHash) {
			logger.info(
				"Skipping duplicate session ingest (organization_id={organizationId} session_id={sessionId})",
				{ organizationId: orgId, sessionId: input.sessionId },
			);
			return response;
		}

		const ingestedAt = new Date();
		const adapter = getAdapter(input.source);
		await adapter.ingest(getClickhouse(), input, {
			ingestedAt,
			userId: context.user.id,
			organizationId: orgId,
		});

		try {
			await recordSessionIngestContent(
				orgId,
				input.sessionId,
				contentHash,
				ingestedAt,
			);
		} catch (error) {
			logger.warn(
				"Session ingest succeeded but content hash bookkeeping failed (organization_id={organizationId} session_id={sessionId} error={error})",
				{
					error: String(error),
					organizationId: orgId,
					sessionId: input.sessionId,
				},
			);
		}

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
			SET enabled = false, updated_at = NOW()
			WHERE id = ${context.apiKeyId}
				AND reference_id = ${context.user.id}
		`;

		return { success: true as const };
	});

const getOrganizationSessionCount = os.getOrganizationSessionCount
	.use(authMiddleware)
	.handler(async ({ input, context }) => {
		if (input.userId && input.userId !== context.user.id) {
			throw new ORPCError("FORBIDDEN", {
				message: "Cannot read another user's raw session count",
			});
		}

		checkOrganizationSessionCountRateLimit(
			context.user.id,
			input.organizationId,
		);

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

		const count = await getCachedOrgSessionCount(
			input.organizationId,
			input.userId,
		);
		return { count };
	});

const deleteOrganization = os.deleteOrganization
	.use(authMiddleware)
	.use(settingsMutationMiddleware)
	.handler(async ({ input, context }) => {
		const orgId = input.organizationId;
		const userId = context.user.id;
		logger.info(
			"Deleting organization (user_id={userId} organization_id={organizationId})",
			{ organizationId: orgId, userId },
		);

		try {
			// These analytics pre-reads must stay before the transaction because the
			// post-commit ClickHouse purge destroys the source rows they inspect.
			const [targetOrganization] = await sqlClient<
				Array<{ ageDays: number; id: string }>
			>`
				SELECT
					id,
					GREATEST(
						0,
						FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)
					)::int AS "ageDays"
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
				logger.error(
					"Failed to inspect uploads before organization deletion (organization_id={organizationId} error={error})",
					{
						error: String(analyticsError),
						organizationId: orgId,
					},
				);
			}

			await sqlClient.begin(async (transaction) => {
				await transaction.unsafe(
					`
						SELECT id
						FROM "user"
						WHERE id = $1
						FOR UPDATE
					`,
					[userId],
				);

				const [membershipSummary] = await transaction.unsafe<
					Array<{ count: number }>
				>(
					`
						SELECT COUNT(*)::int AS count
						FROM member
						WHERE user_id = $1
					`,
					[userId],
				);
				const membershipCount = membershipSummary?.count ?? 0;

				if (membershipCount <= 1) {
					logger.info(
						"Rejected organization deletion because it is the user's only organization (user_id={userId} organization_id={organizationId} membership_count={membershipCount})",
						{
							membershipCount,
							organizationId: orgId,
							userId,
						},
					);
					throw new ORPCError("BAD_REQUEST", {
						message: "Cannot delete your only organization",
					});
				}

				const ownership = await transaction.unsafe<Array<{ id: string }>>(
					`
						SELECT id
						FROM member
						WHERE organization_id = $1
							AND user_id = $2
							AND role = 'owner'
						LIMIT 1
					`,
					[orgId, userId],
				);

				if (ownership.length === 0) {
					logger.info(
						"Rejected organization deletion because the user is not its owner (user_id={userId} organization_id={organizationId})",
						{ organizationId: orgId, userId },
					);
					throw new ORPCError("FORBIDDEN", {
						message: "Only the organization owner can delete it",
					});
				}

				await transaction.unsafe("DELETE FROM organization WHERE id = $1", [
					orgId,
				]);
				await transaction.unsafe(
					`
						UPDATE session
						SET active_organization_id = NULL
						WHERE active_organization_id = $1
					`,
					[orgId],
				);
			});

			// Postgres has already revoked API access. ClickHouse cleanup is
			// best-effort query-level masking, not confirmed physical erasure.
			await deleteOrgSessions(orgId);

			captureApiProductAnalyticsEvent({
				distinctId: userId,
				event: PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_DELETED,
				payload: {
					organization_id: orgId,
					deleter_user_id: userId,
					organization_age_days: targetOrganization?.ageDays ?? 0,
					organization_member_count: memberCount,
					had_uploads_last_30d: hadUploadsLast30d,
				},
			});

			logger.info(
				"Organization deletion completed (user_id={userId} organization_id={organizationId})",
				{ organizationId: orgId, userId },
			);
			return { success: true as const };
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			logger.error(
				"Organization deletion failed (user_id={userId} organization_id={organizationId} error={error})",
				{ error: String(error), organizationId: orgId, userId },
			);
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
