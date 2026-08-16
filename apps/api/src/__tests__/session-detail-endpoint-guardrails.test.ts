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
	test("compression wraps the matched RPC response path", async () => {
		const serverSource = await Bun.file(
			new URL("../index.ts", import.meta.url),
		).text();
		const rpcBranch = serverSource.slice(
			serverSource.indexOf("rpcHandler.handle(request"),
			serverSource.indexOf("// Static file serving"),
		);
		expect(rpcBranch).toContain("maybeCompressSessionDetailRpcResponse(");
		// The compressor only matches /rpc/... paths; wiring it anywhere else
		// (as previously happened on the /api/auth branch) is dead code.
		expect(
			serverSource.split("maybeCompressSessionDetailRpcResponse(").length,
		).toBe(2);
	});

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
				"throwSessionDetailRevisionError(error, errors)",
			);
		}
	});

	test("maps a body revision mismatch to the contract-defined 409 error", () => {
		// Mirrors the constructor map oRPC builds from SESSION_DETAIL_REVISION_ERRORS:
		// the declared status and defined=true must survive the mapping, since a
		// bare ORPCError would surface as an undefined 500 to clients.
		const errors = {
			STALE_REVISION: (options: {
				data: { currentRevision: string; requestedRevision: string };
			}) =>
				new ORPCError("STALE_REVISION", {
					data: options.data,
					defined: true,
					message: "The session detail revision is stale.",
					status: 409,
				}),
		};

		try {
			throwSessionDetailRevisionError(
				new SessionDetailStaleRevisionError(
					"2026-08-16T08:30:00.123Z",
					"2026-08-16T08:31:00.456Z",
				),
				errors,
			);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ORPCError);
			const rpcError = error as {
				code: string;
				data: unknown;
				defined: boolean;
				status: number;
			};
			expect(rpcError.code).toBe("STALE_REVISION");
			expect(rpcError.status).toBe(409);
			expect(rpcError.defined).toBe(true);
			expect(rpcError.data).toEqual({
				currentRevision: "2026-08-16T08:31:00.456Z",
				requestedRevision: "2026-08-16T08:30:00.123Z",
			});
		}
	});
});
