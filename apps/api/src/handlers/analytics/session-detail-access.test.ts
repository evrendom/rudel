import { describe, expect, test } from "bun:test";
import assert from "node:assert";
import { ORPCError } from "@orpc/server";
import { requireSessionDetailOwnerAccess } from "./session-detail-access.js";

function captureExpectedError(action: () => unknown) {
	try {
		action();
	} catch (error) {
		return error;
	}

	throw new Error("Expected the access decision to reject the request");
}

describe("requireSessionDetailOwnerAccess", () => {
	test("does not reveal a session without a registered owner", () => {
		const error = captureExpectedError(() =>
			requireSessionDetailOwnerAccess(null, {
				isOrgAdmin: false,
				requesterUserId: "user-1",
			}),
		);

		assert(error instanceof ORPCError);
		expect(error.code).toBe("NOT_FOUND");
	});

	test("rejects a member reading another member's session", () => {
		const error = captureExpectedError(() =>
			requireSessionDetailOwnerAccess("owner-1", {
				isOrgAdmin: false,
				requesterUserId: "member-1",
			}),
		);

		assert(error instanceof ORPCError);
		expect(error.code).toBe("FORBIDDEN");
	});

	test("returns the registered owner for the owner and organization admins", () => {
		expect(
			requireSessionDetailOwnerAccess("owner-1", {
				isOrgAdmin: false,
				requesterUserId: "owner-1",
			}),
		).toBe("owner-1");
		expect(
			requireSessionDetailOwnerAccess("owner-1", {
				isOrgAdmin: true,
				requesterUserId: "admin-1",
			}),
		).toBe("owner-1");
	});
});
