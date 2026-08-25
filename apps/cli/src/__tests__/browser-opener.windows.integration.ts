import { expect, test } from "bun:test";
import { ok as assert } from "node:assert";
import { parseSafeBrowserUrl } from "../contracts/index.js";
import { openUrl } from "../lib/browser-opener.js";

const BROWSER_REQUEST_TIMEOUT_MS = 30_000;
const BROWSER_LAUNCH_ATTEMPTS = 2;

function waitForBrowserRequest(
	promise: Promise<URL>,
	timeoutMs: number,
): Promise<URL | undefined> {
	return new Promise<URL | undefined>((resolve, reject) => {
		const timeout = setTimeout(() => {
			resolve(undefined);
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

async function openBrowserUntilRequested(
	verificationUrl: string,
	request: Promise<URL>,
): Promise<URL> {
	for (let attempt = 0; attempt < BROWSER_LAUNCH_ATTEMPTS; attempt += 1) {
		openUrl(verificationUrl);
		const requestedUrl = await waitForBrowserRequest(
			request,
			BROWSER_REQUEST_TIMEOUT_MS,
		);
		if (requestedUrl !== undefined) {
			return requestedUrl;
		}
	}

	throw new Error(
		`Default browser did not request the verification URL after ${BROWSER_LAUNCH_ATTEMPTS} launch attempts of ${BROWSER_REQUEST_TIMEOUT_MS}ms each`,
	);
}

test(
	"the Windows opener delivers the complete verification URL to the default browser",
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
			// a second command and never reached the browser. The opener must deliver
			// it to the loopback server as part of the URL.
			const result = parseSafeBrowserUrl(
				`http://127.0.0.1:${server.port}/device?user_code=X&ver`,
				{ allowPlaintext: false },
			);
			assert(result.ok);

			// A cold windows-2025 runner once failed to initialize its default browser
			// within 30s, while the immediate job rerun delivered this URL in 9.4s.
			// Relaunch once so one-time browser initialization cannot hide the real
			// end-to-end assertion or turn a persistent opener failure into a pass.
			const requestedUrl = await openBrowserUntilRequested(
				result.url,
				deviceRequest.promise,
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
	BROWSER_REQUEST_TIMEOUT_MS * BROWSER_LAUNCH_ATTEMPTS + 15_000,
);
