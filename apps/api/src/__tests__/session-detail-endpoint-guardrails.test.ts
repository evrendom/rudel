import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { throwSessionDetailRevisionError } from "../handlers/analytics/session-detail-errors.js";
import { SessionDetailStaleRevisionError } from "../services/session-detail.service.js";

const handlersSource = await Bun.file(
	new URL("../handlers/analytics/sessions.ts", import.meta.url),
).text();

function handlerSource(
	name: "detailOverview" | "detailSubagent" | "detailTurn",
) {
	const start = handlersSource.indexOf(`const ${name} =`);
	const end = handlersSource.indexOf("\nconst ", start + 1);
	return handlersSource.slice(start, end === -1 ? undefined : end);
}

describe("session detail endpoint guardrails", () => {
	for (const name of [
		"detailOverview",
		"detailSubagent",
		"detailTurn",
	] as const) {
		test(`${name} performs organization membership and session ownership checks`, () => {
			const source = handlerSource(name);
			expect(source).toContain(".use(orgMiddleware)");
			expect(source).toContain("await getSessionOwner(");
			expect(source).toContain("requireSessionDetailOwnerAccess(");
		});
	}

	test("each body endpoint forwards the caller-bound revision", () => {
		for (const name of ["detailSubagent", "detailTurn"] as const) {
			expect(handlerSource(name)).toContain("revision: input.revision");
			expect(handlerSource(name)).toContain(
				"throwSessionDetailRevisionError(error)",
			);
		}
	});

	test("maps a body revision mismatch to the typed 409 error payload", () => {
		try {
			throwSessionDetailRevisionError(
				new SessionDetailStaleRevisionError(
					"2026-08-16T08:30:00.123Z",
					"2026-08-16T08:31:00.456Z",
				),
			);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ORPCError);
			const rpcError = error as {
				code: string;
				data: unknown;
			};
			expect(rpcError.code).toBe("STALE_REVISION");
			expect(rpcError.data).toEqual({
				currentRevision: "2026-08-16T08:31:00.456Z",
				requestedRevision: "2026-08-16T08:30:00.123Z",
			});
		}
	});
});
