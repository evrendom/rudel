import { os } from "../../middleware.js";
import { costsRouter } from "./costs.js";
import { developersRouter } from "./developers.js";
import { errorsRouter } from "./errors.js";
import { learningsRouter } from "./learnings.js";
import { overviewRouter } from "./overview.js";
import { projectsRouter } from "./projects.js";
import { roiRouter } from "./roi.js";
import { sessionsRouter } from "./sessions.js";

export const analyticsRouter = os.analytics.router({
	overview: overviewRouter,
	costs: costsRouter,
	developers: developersRouter,
	projects: projectsRouter,
	sessions: sessionsRouter,
	roi: roiRouter,
	errors: errorsRouter,
	learnings: learningsRouter,
});
