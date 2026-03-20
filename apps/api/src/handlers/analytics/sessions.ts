import { ORPCError } from "@orpc/server";
import { orgMiddleware, os } from "../../middleware.js";
import {
	getSessionAnalytics,
	getSessionAnalyticsSummary,
	getSessionAnalyticsSummaryComparison,
	getSessionDetail,
	getSessionDimensionAnalysis,
} from "../../services/session-analytics.service.js";

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
			user_id: input.userId,
			project_path: input.projectPath,
			repository: input.repository,
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
		const result = await getSessionDetail(
			context.organizationId,
			input.sessionId,
		);
		if (!result) {
			throw new ORPCError("NOT_FOUND");
		}

		// Non-admin members can only view their own sessions
		if (!context.isOrgAdmin && result.user_id !== context.user.id) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only view your own sessions",
			});
		}

		return result;
	});

export const sessionsRouter = os.analytics.sessions.router({
	list,
	summary,
	summaryComparison,
	dimensionAnalysis,
	detail,
});
