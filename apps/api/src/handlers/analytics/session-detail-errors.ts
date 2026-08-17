import type { ORPCError } from "@orpc/server";
import type {
	SessionDetailAnchorNotFoundData,
	SessionDetailStaleRevisionData,
} from "@rudel/api-routes";
import { SessionDetailStaleRevisionError } from "../../services/session-detail.service.js";
import {
	SessionDetailAnchorNotFoundError,
	StaleSessionDetailCursorError,
} from "../../services/session-detail-derivation.service.js";

type SessionDetailRevisionErrors = {
	STALE_REVISION: (options: {
		data: SessionDetailStaleRevisionData;
	}) => ORPCError<"STALE_REVISION", SessionDetailStaleRevisionData>;
};

interface SessionDetailWindowErrors extends SessionDetailRevisionErrors {
	ANCHOR_NOT_FOUND: (options: {
		data: SessionDetailAnchorNotFoundData;
	}) => ORPCError<"ANCHOR_NOT_FOUND", SessionDetailAnchorNotFoundData>;
}

export function throwSessionDetailWindowError(
	error: unknown,
	errors: SessionDetailWindowErrors,
): never {
	if (error instanceof SessionDetailAnchorNotFoundError) {
		throw errors.ANCHOR_NOT_FOUND({
			data: { revision: error.revision, turnId: error.turnId },
		});
	}
	return throwSessionDetailRevisionError(error, errors);
}

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
