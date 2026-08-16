import { ORPCError } from "@orpc/server";
import { SessionDetailStaleRevisionError } from "../../services/session-detail.service.js";
import { StaleSessionDetailCursorError } from "../../services/session-detail-derivation.service.js";

export function throwSessionDetailRevisionError(error: unknown): never {
	if (
		error instanceof StaleSessionDetailCursorError ||
		error instanceof SessionDetailStaleRevisionError
	) {
		throw new ORPCError("STALE_REVISION", {
			data: {
				currentRevision: error.currentRevision,
				requestedRevision: error.requestedRevision,
			},
		});
	}
	throw error;
}
