import { ORPCError } from "@orpc/server";
import { isYcReviewSessionRecord } from "../../auth.js";

export function assertSessionDetailAccessEnabled(session: unknown) {
	if (isYcReviewSessionRecord(session)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Session detail disabled for demo.",
		});
	}
}
