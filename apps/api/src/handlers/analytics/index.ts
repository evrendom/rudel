import { os } from "../../middleware.js";
import { developersRouter } from "./developers.js";
import { errorsRouter } from "./errors.js";
import { learningsRouter } from "./learnings.js";
import { overviewRouter } from "./overview.js";
import { projectsRouter } from "./projects.js";
import { roiRouter } from "./roi.js";
import { sessionsRouter } from "./sessions.js";
import { skillsRouter } from "./skills.js";
import { wrappedRouter } from "./wrapped.js";

export const analyticsRouter = os.analytics.router({
	overview: overviewRouter,
	developers: developersRouter,
	projects: projectsRouter,
	sessions: sessionsRouter,
	skills: skillsRouter,
	roi: roiRouter,
	errors: errorsRouter,
	learnings: learningsRouter,
	wrapped: wrappedRouter,
});
