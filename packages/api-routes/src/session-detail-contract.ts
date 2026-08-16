import { oc } from "@orpc/contract";
import {
	SESSION_DETAIL_REVISION_ERRORS,
	SessionDetailOverviewInputSchema,
	SessionDetailOverviewSchema,
	SessionDetailSubagentInputSchema,
	SessionDetailSubagentSchema,
	SessionDetailTurnInputSchema,
	SessionDetailTurnSchema,
} from "./schemas/session-detail-payload.js";

export const sessionDetailProcedureContracts = {
	detailOverview: oc
		.input(SessionDetailOverviewInputSchema)
		.output(SessionDetailOverviewSchema)
		.errors(SESSION_DETAIL_REVISION_ERRORS),
	detailSubagent: oc
		.input(SessionDetailSubagentInputSchema)
		.output(SessionDetailSubagentSchema)
		.errors(SESSION_DETAIL_REVISION_ERRORS),
	detailTurn: oc
		.input(SessionDetailTurnInputSchema)
		.output(SessionDetailTurnSchema)
		.errors(SESSION_DETAIL_REVISION_ERRORS),
};
