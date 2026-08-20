import { oc } from "@orpc/contract";
import {
	SESSION_DETAIL_REVISION_ERRORS,
	SESSION_DETAIL_WINDOW_ERRORS,
	SessionDetailOverviewInputSchema,
	SessionDetailOverviewSchema,
	SessionDetailSpineInputSchema,
	SessionDetailSpineSchema,
	SessionDetailSubagentInputSchema,
	SessionDetailSubagentSchema,
	SessionDetailTurnInputSchema,
	SessionDetailTurnSchema,
	SessionDetailWindowRequestSchema,
	SessionDetailWindowSchema,
} from "./schemas/session-detail-payload.js";

export const sessionDetailProcedureContracts = {
	detailOverview: oc
		.input(SessionDetailOverviewInputSchema)
		.output(SessionDetailOverviewSchema)
		.errors(SESSION_DETAIL_REVISION_ERRORS),
	detailSpine: oc
		.input(SessionDetailSpineInputSchema)
		.output(SessionDetailSpineSchema)
		.errors(SESSION_DETAIL_REVISION_ERRORS),
	detailSubagent: oc
		.input(SessionDetailSubagentInputSchema)
		.output(SessionDetailSubagentSchema)
		.errors(SESSION_DETAIL_REVISION_ERRORS),
	detailTurn: oc
		.input(SessionDetailTurnInputSchema)
		.output(SessionDetailTurnSchema)
		.errors(SESSION_DETAIL_REVISION_ERRORS),
	detailWindow: oc
		.input(SessionDetailWindowRequestSchema)
		.output(SessionDetailWindowSchema)
		.errors(SESSION_DETAIL_WINDOW_ERRORS),
};
