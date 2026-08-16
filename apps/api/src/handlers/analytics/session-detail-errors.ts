import type { ORPCError } from "@orpc/server";
import type { SessionDetailStaleRevisionData } from "@rudel/api-routes";
import { SessionDetailStaleRevisionError } from "../../services/session-detail.service.js";
import { StaleSessionDetailCursorError } from "../../services/session-detail-derivation.service.js";

type SessionDetailRevisionErrors = {
	STALE_REVISION: (options: {
		data: SessionDetailStaleRevisionData;
	}) => ORPCError<"STALE_REVISION", SessionDetailStaleRevisionData>;
};

export function throwSessionDetailRevisionError(
	error: unknown,
	errors: SessionDetailRevisionErrors,
): never {
	if (
		error instanceof StaleSessionDetailCursorError ||
		error instanceof SessionDetailStaleRevisionError
	) {
		throw errors.STALE_REVISION({
			data: {
				currentRevision: error.currentRevision,
				requestedRevision: error.requestedRevision,
			},
		});
	}
	throw error;
}
