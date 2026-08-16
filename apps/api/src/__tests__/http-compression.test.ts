import { describe, expect, test } from "bun:test";
import { gunzipSync } from "node:zlib";
import {
	maybeCompressSessionDetailRpcResponse,
	requestAcceptsGzip,
} from "../lib/http-compression.js";

describe("session detail HTTP compression", () => {
	test("serves a body endpoint with gzip headers and a measured byte reduction", async () => {
		const body = JSON.stringify({
			json: {
				content: "repeated subagent transcript line\n".repeat(20_000),
				revision: "2026-08-16T08:30:00.123Z",
				subagentId: "agent-1",
			},
		});
		const response = await maybeCompressSessionDetailRpcResponse({
			pathname: "/rpc/analytics/sessions/detailSubagent",
			requestHeaders: new Headers({ "Accept-Encoding": "br, gzip" }),
			response: new Response(body, {
				headers: {
					"Content-Type": "application/json",
					Vary: "Origin",
				},
			}),
		});
		const compressed = Buffer.from(await response.arrayBuffer());

		expect(response.headers.get("Content-Encoding")).toBe("gzip");
		expect(response.headers.get("Vary")).toBe("Origin, Accept-Encoding");
		expect(response.headers.get("Content-Length")).toBe(
			String(compressed.byteLength),
		);
		expect(compressed.byteLength).toBeLessThan(Buffer.byteLength(body, "utf8"));
		expect(gunzipSync(compressed).toString("utf8")).toBe(body);
	});

	test("compresses normalized turn bodies on the same transport boundary", async () => {
		const body = JSON.stringify({ json: { responseItems: [], userItems: [] } });
		const response = await maybeCompressSessionDetailRpcResponse({
			pathname: "/rpc/analytics/sessions/detailTurn",
			requestHeaders: new Headers({ "Accept-Encoding": "gzip" }),
			response: new Response(body),
		});
		expect(response.headers.get("Content-Encoding")).toBe("gzip");
		expect(gunzipSync(await response.arrayBuffer()).toString("utf8")).toBe(
			body,
		);
	});

	test("does not compress overview, error, or gzip-disabled responses", async () => {
		const overview = new Response("overview");
		expect(
			await maybeCompressSessionDetailRpcResponse({
				pathname: "/rpc/analytics/sessions/detailOverview",
				requestHeaders: new Headers({ "Accept-Encoding": "gzip" }),
				response: overview,
			}),
		).toBe(overview);

		const error = new Response("stale", { status: 409 });
		expect(
			await maybeCompressSessionDetailRpcResponse({
				pathname: "/rpc/analytics/sessions/detailTurn",
				requestHeaders: new Headers({ "Accept-Encoding": "gzip" }),
				response: error,
			}),
		).toBe(error);
		expect(
			requestAcceptsGzip(new Headers({ "Accept-Encoding": "gzip;q=0, *" })),
		).toBe(false);

		const uncompressed = new Response("body");
		expect(
			await maybeCompressSessionDetailRpcResponse({
				pathname: "/rpc/analytics/sessions/detailTurn",
				requestHeaders: new Headers(),
				response: uncompressed,
			}),
		).toBe(uncompressed);
		expect(uncompressed.headers.get("Vary")).toBe("Accept-Encoding");
	});
});
