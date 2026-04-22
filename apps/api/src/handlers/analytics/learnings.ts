import { orgMiddleware, os } from "../../middleware";
import {
	getLearningProjects,
	getLearningsFeed,
	getLearningsFeedStats,
	getLearningsTrend,
	getLearningUsers,
} from "../../services/learnings.service";

const list = os.analytics.learnings.list
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getLearningsFeed(context.organizationId, {
			days: input.days,
			limit: input.limit,
			offset: input.offset,
		});
	});

const stats = os.analytics.learnings.stats
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getLearningsFeedStats(context.organizationId, {
			days: input.days,
		});
	});

const users = os.analytics.learnings.users
	.use(orgMiddleware)
	.handler(async ({ context }) => {
		return getLearningUsers(context.organizationId);
	});

const projects = os.analytics.learnings.projects
	.use(orgMiddleware)
	.handler(async ({ context }) => {
		return getLearningProjects(context.organizationId);
	});

const trend = os.analytics.learnings.trend
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getLearningsTrend(context.organizationId, {
			days: input.days,
			split_by: input.splitBy,
		});
	});

export const learningsRouter = os.analytics.learnings.router({
	list,
	stats,
	users,
	projects,
	trend,
});
