import { orgMiddleware, os } from "../../middleware.js";
import {
	getModelTokensTrend,
	getOverviewInsights,
	getOverviewKPIs,
	getSuccessRateMetrics,
	getTeamSummaryWithComparison,
	getUsageTrendDetailed,
	getUsersDailyTrend,
	getUsersTokenUsage,
} from "../../services/overview.service.js";

const kpis = os.analytics.overview.kpis
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getOverviewKPIs(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

const usageTrend = os.analytics.overview.usageTrend
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getUsageTrendDetailed(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

const modelTokensTrend = os.analytics.overview.modelTokensTrend
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getModelTokensTrend(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

const usersTokenUsage = os.analytics.overview.usersTokenUsage
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getUsersTokenUsage(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

const usersDailyTrend = os.analytics.overview.usersDailyTrend
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getUsersDailyTrend(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

const insights = os.analytics.overview.insights
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getOverviewInsights(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

const teamSummaryComparison = os.analytics.overview.teamSummaryComparison
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getTeamSummaryWithComparison(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

const successRate = os.analytics.overview.successRate
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getSuccessRateMetrics(
			context.organizationId,
			input.startDate,
			input.endDate,
		);
	});

export const overviewRouter = os.analytics.overview.router({
	kpis,
	usageTrend,
	modelTokensTrend,
	usersTokenUsage,
	usersDailyTrend,
	insights,
	teamSummaryComparison,
	successRate,
});
