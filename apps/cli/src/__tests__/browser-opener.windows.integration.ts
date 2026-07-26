import { expect, test } from "bun:test";
import { ok as assert } from "node:assert";
import { parseSafeBrowserUrl } from "@rudel/api-routes";
import { openUrl } from "../lib/browser-opener.js";

const BROWSER_REQUEST_TIMEOUT_MS = 30_000;

function waitWithTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(
				new Error(
					`Default browser did not request the verification URL within ${timeoutMs}ms`,
				),
			);
		}, timeoutMs);

		promise.then(
			(value) => {
				clearTimeout(timeout);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

test(
	"explorer.exe opens the complete verification URL without shell parsing",
	async () => {
		expect(process.platform).toBe("win32");

		const deviceRequest = Promise.withResolvers<URL>();
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				const url = new URL(request.url);
				if (url.pathname === "/device") {
					deviceRequest.resolve(url);
				}
				return new Response(
					"<!doctype html><title>Rudel browser opener probe</title>",
					{ headers: { "Content-Type": "text/html; charset=utf-8" } },
				);
			},
		});

		try {
			// Under the vulnerable `cmd /c start` implementation, `&ver` was parsed as
			// a second command and never reached the browser. explorer.exe must deliver
			// it to the loopback server as part of the URL.
			const result = parseSafeBrowserUrl(
				`http://127.0.0.1:${server.port}/device?user_code=X&ver`,
				{ allowPlaintext: false },
			);
			assert(result.ok);

			openUrl(result.url);

			const requestedUrl = await waitWithTimeout(
				deviceRequest.promise,
				BROWSER_REQUEST_TIMEOUT_MS,
			);
			expect(requestedUrl.pathname).toBe("/device");
			expect(requestedUrl.searchParams.get("user_code")).toBe("X");
			expect(requestedUrl.searchParams.has("ver")).toBe(true);
		} finally {
			await server.stop(true);
		}
		// Above Bun's 5s default so the browser wait inside the test expires first,
		// producing its descriptive error instead of a generic test timeout.
	},
	BROWSER_REQUEST_TIMEOUT_MS + 15_000,
);
