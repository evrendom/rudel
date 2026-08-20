import { ORPCError } from "@orpc/server";
import { orgMiddleware, os } from "../../middleware.js";
import {
	getSessionAnalytics,
	getSessionAnalyticsSummary,
	getSessionAnalyticsSummaryComparison,
	getSessionDetail,
	getSessionDimensionAnalysis,
} from "../../services/session-analytics.service.js";
import {
	getSessionDetailOverview,
	getSessionDetailSpine,
	getSessionDetailSubagent,
	getSessionDetailTurn,
	getSessionDetailWindow,
} from "../../services/session-detail.service.js";
import {
	InvalidSessionDetailCursorError,
	InvalidSessionDetailWindowCursorError,
} from "../../services/session-detail-derivation.service.js";
import { getSessionOwner } from "../../services/session-ownership.service.js";
import { requireSessionDetailOwnerAccess } from "./session-detail-access.js";
import {
	throwSessionDetailRevisionError,
	throwSessionDetailWindowError,
} from "./session-detail-errors.js";

const sortByMap: Record<string, "date" | "duration" | "interactions"> = {
	session_date: "date",
	duration_min: "duration",
	total_tokens: "date",
	success_score: "date",
};

const list = os.analytics.sessions.list
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getSessionAnalytics(context.organizationId, {
			days: input.days,
			start_date: input.startDate,
			end_date: input.endDate,
			user_id: input.userId,
			project_path: input.projectPath,
			repository: input.repository,
			source: input.source,
			limit: input.limit,
			offset: input.offset,
			sort_by: sortByMap[input.sortBy] ?? "date",
			sort_order: input.sortOrder,
		});
	});

const summary = os.analytics.sessions.summary
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getSessionAnalyticsSummary(context.organizationId, {
			days: input.days,
		});
	});

const summaryComparison = os.analytics.sessions.summaryComparison
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getSessionAnalyticsSummaryComparison(context.organizationId, {
			days: input.days,
		});
	});

const dimensionAnalysis = os.analytics.sessions.dimensionAnalysis
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getSessionDimensionAnalysis(context.organizationId, {
			days: input.days,
			dimension: input.dimension,
			metric: input.metric,
			split_by: input.splitBy,
			limit: input.limit,
			user_id: input.userId,
			project_path: input.projectPath,
		});
	});

const detail = os.analytics.sessions.detail
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		const ownerId = requireSessionDetailOwnerAccess(
			await getSessionOwner(context.organizationId, input.sessionId),
			{
				isOrgAdmin: context.isOrgAdmin,
				requesterUserId: context.user.id,
			},
		);

		const result = await getSessionDetail(
			context.organizationId,
			input.sessionId,
			ownerId,
		);
		if (!result) {
			throw new ORPCError("NOT_FOUND");
		}

		return result;
	});

const detailOverview = os.analytics.sessions.detailOverview
	.use(orgMiddleware)
	.handler(async ({ input, context, errors }) => {
		const ownerId = requireSessionDetailOwnerAccess(
			await getSessionOwner(context.organizationId, input.sessionId),
			{
				isOrgAdmin: context.isOrgAdmin,
				requesterUserId: context.user.id,
			},
		);

		try {
			const result = await getSessionDetailOverview({
				organizationId: context.organizationId,
				ownerId,
				sessionId: input.sessionId,
				turnCursor: input.turnCursor,
				turnLimit: input.turnLimit,
			});
			if (!result) {
				throw new ORPCError("NOT_FOUND");
			}
			return result;
		} catch (error) {
			if (error instanceof InvalidSessionDetailCursorError) {
				throw new ORPCError("BAD_REQUEST", {
					message: error.message,
				});
			}
			return throwSessionDetailRevisionError(error, errors);
		}
	});

const detailWindow = os.analytics.sessions.detailWindow
	.use(orgMiddleware)
	.handler(async ({ input, context, errors }) => {
		const ownerId = requireSessionDetailOwnerAccess(
			await getSessionOwner(context.organizationId, input.sessionId),
			{
				isOrgAdmin: context.isOrgAdmin,
				requesterUserId: context.user.id,
			},
		);

		try {
			const result = await getSessionDetailWindow({
				organizationId: context.organizationId,
				ownerId,
				request: input,
				sessionId: input.sessionId,
			});
			if (!result) {
				throw new ORPCError("NOT_FOUND");
			}
			return result;
		} catch (error) {
			if (error instanceof InvalidSessionDetailWindowCursorError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}
			return throwSessionDetailWindowError(error, errors);
		}
	});

const detailSpine = os.analytics.sessions.detailSpine
	.use(orgMiddleware)
	.handler(async ({ input, context, errors }) => {
		const ownerId = requireSessionDetailOwnerAccess(
			await getSessionOwner(context.organizationId, input.sessionId),
			{
				isOrgAdmin: context.isOrgAdmin,
				requesterUserId: context.user.id,
			},
		);

		try {
			const result = await getSessionDetailSpine({
				organizationId: context.organizationId,
				ownerId,
				revision: input.revision,
				sessionId: input.sessionId,
			});
			if (!result) {
				throw new ORPCError("NOT_FOUND");
			}
			return result;
		} catch (error) {
			return throwSessionDetailRevisionError(error, errors);
		}
	});

const detailTurn = os.analytics.sessions.detailTurn
	.use(orgMiddleware)
	.handler(async ({ input, context, errors }) => {
		const ownerId = requireSessionDetailOwnerAccess(
			await getSessionOwner(context.organizationId, input.sessionId),
			{
				isOrgAdmin: context.isOrgAdmin,
				requesterUserId: context.user.id,
			},
		);

		try {
			const result = await getSessionDetailTurn({
				organizationId: context.organizationId,
				ownerId,
				revision: input.revision,
				sessionId: input.sessionId,
				turnId: input.turnId,
			});
			if (!result) {
				throw new ORPCError("NOT_FOUND");
			}
			return result;
		} catch (error) {
			return throwSessionDetailRevisionError(error, errors);
		}
	});

const detailSubagent = os.analytics.sessions.detailSubagent
	.use(orgMiddleware)
	.handler(async ({ input, context, errors }) => {
		const ownerId = requireSessionDetailOwnerAccess(
			await getSessionOwner(context.organizationId, input.sessionId),
			{
				isOrgAdmin: context.isOrgAdmin,
				requesterUserId: context.user.id,
			},
		);

		try {
			const result = await getSessionDetailSubagent({
				organizationId: context.organizationId,
				ownerId,
				revision: input.revision,
				sessionId: input.sessionId,
				subagentId: input.subagentId,
			});
			if (!result) {
				throw new ORPCError("NOT_FOUND");
			}
			return result;
		} catch (error) {
			return throwSessionDetailRevisionError(error, errors);
		}
	});

export const sessionsRouter = os.analytics.sessions.router({
	detailOverview,
	detailSpine,
	detailSubagent,
	detailTurn,
	detailWindow,
	list,
	summary,
	summaryComparison,
	dimensionAnalysis,
	detail,
});
