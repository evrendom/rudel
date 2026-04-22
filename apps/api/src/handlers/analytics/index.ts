import { os } from "../../middleware";
import { developersRouter } from "./developers";
import { errorsRouter } from "./errors";
import { learningsRouter } from "./learnings";
import { overviewRouter } from "./overview";
import { projectsRouter } from "./projects";
import { roiRouter } from "./roi";
import { sessionsRouter } from "./sessions";
import { wrappedRouter } from "./wrapped";

export const analyticsRouter = os.analytics.router({
	overview: overviewRouter,
	developers: developersRouter,
	projects: projectsRouter,
	sessions: sessionsRouter,
	roi: roiRouter,
	errors: errorsRouter,
	learnings: learningsRouter,
	wrapped: wrappedRouter,
});
