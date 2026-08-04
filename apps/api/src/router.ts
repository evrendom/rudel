import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import {
	getAdapter,
	getMissingTranscriptTimestampMessage,
} from "@rudel/agent-adapters";
import {
	INGEST_AGGREGATE_CONTENT_MAX_BYTES,
	type IngestSessionInput,
	PRODUCT_ANALYTICS_EVENTS,
	REDACTION_BUDGET_EXCEEDED_CODE,
	REDACTION_DID_NOT_CONVERGE_CODE,
	SECRET_FILTER_JSON_INTEGRITY_CODE,
	SESSION_OWNERSHIP_CONFLICT_CODE,
	SESSION_UPLOAD_SHRINK_REJECTED_CODE,
} from "@rudel/api-routes";
import {
	FILTER_VERSION,
	getRedactionBudgetAnomaly,
	SecretFilterConvergenceError,
	SecretFilterJsonIntegrityError,
} from "@rudel/secret-filter";
import { getClickhouse } from "./clickhouse.js";
import { sqlClient } from "./db.js";
import { adminRouter } from "./handlers/admin/index.js";
import { analyticsRouter } from "./handlers/analytics/index.js";
import { chatwootRouter } from "./handlers/chatwoot.js";
import { profileRouter } from "./handlers/profile.js";
import { teamInviteLinkRouter } from "./handlers/team-invite-link.js";
import { wrappedDecimalClaimRouter } from "./handlers/wrapped-decimal-claim.js";
import { wrappedResumeRouter } from "./handlers/wrapped-resume.js";
import { wrappedShareRouter } from "./handlers/wrapped-share.js";
import { readBooleanEnv } from "./lib/env.js";
import { computeIngestContentHash } from "./lib/ingest-content-hash.js";
import {
	getIngestContentShape,
	isUnexpectedIngestShrink,
	resolvePreviousIngestContentShape,
} from "./lib/ingest-content-shape.js";
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
import { enqueueClickHousePurge } from "./services/clickhouse-purge.service.js";
import {
	filterSessionTextFieldsOffThread,
	IngestFilterQueueAbortedError,
	IngestFilterQueueClosedError,
	IngestFilterQueueFullError,
	IngestFilterQueueTimeoutError,
} from "./services/ingest-filter.service.js";
import { getNextIngestedAt } from "./services/ingest-timestamp.service.js";
import {
	getCachedOrgSessionCount,
	hasOrgUploadsInLastDays,
} from "./services/org-session.service.js";
import { hasRawSessionRow } from "./services/raw-session.service.js";
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

async function resolveIngestOrganizationId(
	requestedOrganizationId: string | null,
	userId: string,
): Promise<string> {
	if (requestedOrganizationId) {
		const membership = await sqlClient<Array<{ id: string }>>`
			SELECT id
			FROM member
			WHERE organization_id = ${requestedOrganizationId}
				AND user_id = ${userId}
			LIMIT 1
		`;

		if (membership.length === 0) {
			throw new ORPCError("FORBIDDEN", {
				message: "Not a member of the specified organization",
			});
		}
		return requestedOrganizationId;
	}

	// Two rows are enough to distinguish a sole membership from an ambiguous choice.
	// Prefer the personal workspace when it exists; creation time makes the fallback deterministic.
	const memberships = await sqlClient<Array<{ organization_id: string }>>`
		SELECT m.organization_id
		FROM member m
		INNER JOIN organization o
			ON o.id = m.organization_id
		WHERE m.user_id = ${userId}
		GROUP BY m.organization_id
		ORDER BY (m.organization_id = ${userId}) DESC, MIN(m.created_at) ASC
		LIMIT 2
	`;
	const personalWorkspace = memberships.find(
		(membership) => membership.organization_id === userId,
	);
	if (personalWorkspace) {
		return personalWorkspace.organization_id;
	}
	if (memberships.length === 1 && memberships[0]) {
		return memberships[0].organization_id;
	}
	if (memberships.length === 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: "No organization is available for this upload",
		});
	}

	throw new ORPCError("BAD_REQUEST", {
		message: "Choose an organization with --org or rudel set-org",
	});
}

const ingestSessionHandler = os.ingestSession
	.use(ingestAuthMiddleware)
	.handler(async ({ input, context, errors, signal }) => {
		if (readBooleanEnv("SESSION_INGEST_QUIESCED", false)) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				data: { reason: "session_ingest_quiesced" },
				message:
					"Session uploads are temporarily paused for an analytics rebuild. Retry shortly.",
			});
		}
		checkIngestRequestRateLimit(context.user.id);
		const aggregateBytes = enforceIngestAggregateSize(
			input,
			INGEST_AGGREGATE_CONTENT_MAX_BYTES,
		);
		checkIngestByteRateLimit(context.user.id, aggregateBytes);
		const filteredText = await filterSessionTextFieldsOffThread({
			bytes: aggregateBytes,
			fields: {
				content: input.content,
				subagents: input.subagents,
			},
			signal,
			userId: context.user.id,
		}).catch((error: unknown) => {
			if (error instanceof SecretFilterConvergenceError) {
				throw errors[REDACTION_DID_NOT_CONVERGE_CODE]({
					data: { maxPasses: error.maxPasses },
				});
			}
			if (error instanceof SecretFilterJsonIntegrityError) {
				throw errors[SECRET_FILTER_JSON_INTEGRITY_CODE]();
			}
			if (error instanceof IngestFilterQueueFullError) {
				throw new ORPCError("SERVICE_UNAVAILABLE", {
					data: {
						reason: "ingest_filter_queue_full",
						limit: error.limit,
						retryAfterMs: error.retryAfterMs,
					},
					message: error.message,
				});
			}
			if (error instanceof IngestFilterQueueClosedError) {
				throw new ORPCError("SERVICE_UNAVAILABLE", {
					data: {
						reason: "ingest_filter_queue_closed",
						retryAfterMs: error.retryAfterMs,
					},
					message: error.message,
				});
			}
			if (error instanceof IngestFilterQueueTimeoutError) {
				throw new ORPCError("GATEWAY_TIMEOUT", {
					data: {
						reason: "ingest_filter_queue_timeout",
						retryAfterMs: error.retryAfterMs,
					},
					message: error.message,
				});
			}
			if (error instanceof IngestFilterQueueAbortedError) {
				throw new ORPCError("CLIENT_CLOSED_REQUEST", {
					message: error.message,
				});
			}
			throw error;
		});
		const redactionBudgetAnomaly = getRedactionBudgetAnomaly(
			filteredText.redactedBytes,
			aggregateBytes,
			filteredText.counts,
		);
		if (redactionBudgetAnomaly) {
			throw errors[REDACTION_BUDGET_EXCEEDED_CODE]({
				data: {
					...redactionBudgetAnomaly,
					ruleIds: [...redactionBudgetAnomaly.ruleIds],
				},
			});
		}
		const filteredInput: IngestSessionInput = {
			...input,
			content: filteredText.content,
			subagents: filteredText.subagents
				? [...filteredText.subagents]
				: undefined,
			filter_version: FILTER_VERSION,
		};
		const adapter = getAdapter(filteredInput.source);
		const timestamps = adapter.extractTimestamps(filteredInput.content);

		if (!timestamps) {
			throw new ORPCError("BAD_REQUEST", {
				message: getMissingTranscriptTimestampMessage(filteredInput.source),
			});
		}

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

		const orgId = await resolveIngestOrganizationId(
			input.organizationId ?? activeOrgId,
			context.user.id,
		);

		const ownership = await claimSessionIngestOwnership(
			orgId,
			input.sessionId,
			context.user.id,
		);
		if (!ownership.owned) {
			throw errors[SESSION_OWNERSHIP_CONFLICT_CODE]();
		}
		const contentShape = getIngestContentShape(filteredInput);
		const previousContentShape = resolvePreviousIngestContentShape(ownership);
		if (
			!input.force_replace &&
			(ownership.lastFilterVersion === null ||
				ownership.lastFilterVersion === FILTER_VERSION) &&
			previousContentShape !== null &&
			isUnexpectedIngestShrink(previousContentShape, contentShape, {
				compareTotalsOnly: ownership.lastContentShape === null,
			})
		) {
			logger.warn(
				"Refusing smaller session re-upload (organization_id={organizationId} session_id={sessionId} previous_content_bytes={previousContentBytes} current_content_bytes={currentContentBytes} previous_assistant_lines={previousAssistantLineCount} current_assistant_lines={currentAssistantLineCount})",
				{
					currentAssistantLineCount: contentShape.assistantLineCount,
					currentContentBytes: contentShape.contentBytes,
					organizationId: orgId,
					previousAssistantLineCount: previousContentShape.assistantLineCount,
					previousContentBytes: previousContentShape.contentBytes,
					sessionId: input.sessionId,
				},
			);
			throw errors[SESSION_UPLOAD_SHRINK_REJECTED_CODE]({
				data: {
					currentAssistantLineCount: contentShape.assistantLineCount,
					currentContentBytes: contentShape.contentBytes,
					previousAssistantLineCount: previousContentShape.assistantLineCount,
					previousContentBytes: previousContentShape.contentBytes,
				},
			});
		}

		// Hash the exact bytes and filter version stored by the server. This makes
		// an old unfiltered CLI upload and a current pre-filtered CLI upload
		// converge after server filtering instead of creating duplicate rows.
		const contentHash = computeIngestContentHash(filteredInput);
		const response = {
			success: true as const,
			sessionId: input.sessionId,
			redacted: filteredText.counts,
			redactedBytes: filteredText.redactedBytes,
		};

		// This is a best-effort cost optimization, not a cross-instance
		// security control. Concurrent identical requests can both reach the
		// ClickHouse insert before either records its successful hash.
		if (
			ownership.lastContentSha256 === contentHash &&
			(await hasRawSessionRow({
				organizationId: orgId,
				sessionDate: ownership.lastSessionDate,
				sessionId: input.sessionId,
				table: adapter.rawTableName,
				userId: context.user.id,
			}))
		) {
			logger.info(
				"Skipping duplicate session ingest (organization_id={organizationId} session_id={sessionId})",
				{ organizationId: orgId, sessionId: input.sessionId },
			);
			return response;
		}

		// Acknowledged async inserts can batch concurrent requests into one part.
		// Give each request a distinct millisecond RMT version even when the
		// process clock has not advanced, so FINAL and hash bookkeeping agree.
		const ingestedAt = getNextIngestedAt();
		await adapter.ingest(getClickhouse(), filteredInput, {
			ingestedAt,
			userId: context.user.id,
			organizationId: orgId,
			timestamps,
		});

		try {
			await recordSessionIngestContent(
				orgId,
				input.sessionId,
				contentHash,
				contentShape,
				FILTER_VERSION,
				new Date(timestamps.sessionDate),
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
			filteredInput,
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

				await enqueueClickHousePurge(
					{ targetId: orgId, targetType: "organization" },
					transaction,
				);
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
				"Organization deletion committed; ClickHouse purge queued (user_id={userId} organization_id={organizationId})",
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
	chatwoot: chatwootRouter,
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
