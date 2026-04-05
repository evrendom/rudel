import { ORPCError } from "@orpc/server";
import { orgMiddleware, os } from "../../middleware.js";
import {
	getProjectContributors,
	getProjectDetails,
	getProjectErrors,
	getProjectFeatureUsage,
	getProjectInvestment,
	getProjectTrends,
} from "../../services/project.service.js";

const investment = os.analytics.projects.investment
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getProjectInvestment(context.organizationId, {
			days: input.days,
			limit: input.limit,
			offset: input.offset,
		});
	});

const trends = os.analytics.projects.trends
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getProjectTrends(context.organizationId, input.days);
	});

const details = os.analytics.projects.details
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		const result = await getProjectDetails(
			context.organizationId,
			input.projectPath,
			input.days,
		);
		if (!result) {
			throw new ORPCError("NOT_FOUND");
		}
		return result;
	});

const contributors = os.analytics.projects.contributors
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getProjectContributors(
			context.organizationId,
			input.projectPath,
			input.days,
		);
	});

const features = os.analytics.projects.features
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getProjectFeatureUsage(
			context.organizationId,
			input.projectPath,
			input.days,
		);
	});

const errors = os.analytics.projects.errors
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getProjectErrors(
			context.organizationId,
			input.projectPath,
			input.days,
		);
	});

export const projectsRouter = os.analytics.projects.router({
	investment,
	trends,
	details,
	contributors,
	features,
	errors,
});
