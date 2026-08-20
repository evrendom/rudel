import { shouldUsePersistentSkillAnalytics } from "../../lib/env.js";
import { orgMiddleware, os } from "../../middleware.js";
import {
	getHistoricalSkillDetail,
	listHistoricalSkills,
} from "../../services/historical-skills.service.js";
import {
	getLegacyHistoricalCodexSkillDetail,
	listLegacyHistoricalCodexSkills,
} from "../../services/legacy-historical-skills.service.js";

const list = os.analytics.skills.list
	.use(orgMiddleware)
	.handler(async ({ context }) => {
		return shouldUsePersistentSkillAnalytics(context.organizationId)
			? listHistoricalSkills(context.organizationId)
			: listLegacyHistoricalCodexSkills(context.organizationId);
	});

const detail = os.analytics.skills.detail
	.use(orgMiddleware)
	.handler(async ({ input, context }) => {
		return shouldUsePersistentSkillAnalytics(context.organizationId)
			? getHistoricalSkillDetail(context.organizationId, input.name)
			: getLegacyHistoricalCodexSkillDetail(context.organizationId, input.name);
	});

export const skillsRouter = os.analytics.skills.router({
	list,
	detail,
});
