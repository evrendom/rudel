import { orgMiddleware, os } from "../../middleware.js";
import {
	getHistoricalCodexSkillDetail,
	listHistoricalCodexSkills,
} from "../../services/historical-skills.service.js";

const list = os.analytics.skills.list
	.use(orgMiddleware)
	.handler(async ({ context }) => {
		return listHistoricalCodexSkills(context.organizationId);
	});

const detail = os.analytics.skills.detail
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return getHistoricalCodexSkillDetail(context.organizationId, input.name);
	});

export const skillsRouter = os.analytics.skills.router({
	list,
	detail,
});
