import { ORPCError } from "@orpc/server";
import { orgMiddleware, os } from "../../middleware";
import {
	getDeveloperDetails,
	getDeveloperErrors,
	getDeveloperFeatureUsage,
	getDeveloperList,
	getDeveloperProjects,
	getDeveloperSessions,
	getDeveloperTeamCards,
	getDeveloperTimeline,
	getDeveloperTrends,
} from "../../services/developer.service";

const list = os.analytics.developers.list
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperList(context.organizationId, input.days);
	});

const teamCards = os.analytics.developers.teamCards
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperTeamCards(context.organizationId, input.days);
	});

const details = os.analytics.developers.details
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		const result = await getDeveloperDetails(
			context.organizationId,
			input.userId,
			input.days,
		);
		if (!result) {
			throw new ORPCError("NOT_FOUND");
		}
		return result;
	});

const sessions = os.analytics.developers.sessions
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperSessions(context.organizationId, input.userId, {
			days: input.days,
			project_path: input.projectPath,
			outcome: input.outcome,
			limit: input.limit,
			offset: input.offset,
			sort_by: input.sortBy,
			sort_order: input.sortOrder,
		});
	});

const projects = os.analytics.developers.projects
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperProjects(
			context.organizationId,
			input.userId,
			input.days,
		);
	});

const timeline = os.analytics.developers.timeline
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperTimeline(
			context.organizationId,
			input.userId,
			input.days,
		);
	});

const features = os.analytics.developers.features
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperFeatureUsage(
			context.organizationId,
			input.userId,
			input.days,
		);
	});

const errors = os.analytics.developers.errors
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperErrors(context.organizationId, input.userId, input.days);
	});

const trends = os.analytics.developers.trends
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getDeveloperTrends(context.organizationId, input.days);
	});

export const developersRouter = os.analytics.developers.router({
	list,
	teamCards,
	details,
	sessions,
	projects,
	timeline,
	features,
	errors,
	trends,
});
