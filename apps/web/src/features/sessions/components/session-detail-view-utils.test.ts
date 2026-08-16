import { describe, expect, test } from "vitest";
import { SessionDetailFastResponseError } from "./session-detail-fast-response";
import { getSessionDetailErrorState } from "./session-detail-view-utils";

describe("getSessionDetailErrorState", () => {
	test("keeps missing sessions distinct from server failures", () => {
		expect(getSessionDetailErrorState({ code: "NOT_FOUND" })).toEqual({
			description: undefined,
			title: "Session Not Found",
		});
		expect(
			getSessionDetailErrorState({ code: "INTERNAL_SERVER_ERROR" }),
		).toEqual({
			description: "The session could not be loaded. Please try again.",
			title: "Unable to Load Session",
		});
	});

	test("preserves the session ownership error", () => {
		expect(getSessionDetailErrorState({ code: "FORBIDDEN" })).toEqual({
			description: "You can only view your own session transcripts.",
			title: "Access Denied",
		});
	});

	test("identifies an invalid fast-path contract as unsupported data", () => {
		expect(
			getSessionDetailErrorState(
				new SessionDetailFastResponseError("invalid response", ["revision"]),
			),
		).toEqual({
			description:
				"The server returned session data in an unsupported format. Try again or check the deployment versions.",
			title: "Unexpected Session Data",
		});
	});

	test("returns no state when there is no error", () => {
		expect(getSessionDetailErrorState(undefined)).toBeUndefined();
	});
});
