import { existsSync, statSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
	handleAgentationRequest,
	serveCaptureWithAgentation,
} from "../_agentation/server.mjs";

const rootUrl = new URL(".", import.meta.url);
const port = Number.parseInt(
	process.env.OPALINE_LINEAR_REFERENCE_PORT || "4176",
	10,
);
const defaultFile = "linear-next-light.capture.html";
const capturePath = fileURLToPath(new URL(defaultFile, rootUrl));
const temporaryCapturePath = fileURLToPath(
	new URL(`${defaultFile}.tmp`, rootUrl),
);
const maximumCaptureBytes = 24 * 1024 * 1024;
const linearOrigin = "https://linear.app";

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

const writeCapture = async (request, response) => {
	const declaredLength = Number.parseInt(
		request.headers["content-length"] || "0",
		10,
	);
	if (declaredLength > maximumCaptureBytes) {
		response.writeHead(413, {
			...corsHeaders,
			"content-type": "application/json; charset=utf-8",
		});
		response.end(JSON.stringify({ error: "Capture exceeds 24 MiB." }));
		return;
	}

	const chunks = [];
	let receivedBytes = 0;
	for await (const chunk of request) {
		receivedBytes += chunk.length;
		if (receivedBytes > maximumCaptureBytes) {
			throw new Error("Capture exceeds 24 MiB.");
		}
		chunks.push(chunk);
	}

	const body = Buffer.concat(chunks);
	const preview = body.subarray(0, 8192).toString("utf8");
	if (!/<html[\s>]/i.test(preview) || !preview.includes("Linear")) {
		throw new Error("Receiver rejected an unexpected document.");
	}

	await writeFile(temporaryCapturePath, body);
	await rename(temporaryCapturePath, capturePath);
	response.writeHead(201, {
		...corsHeaders,
		"content-type": "application/json; charset=utf-8",
	});
	response.end(
		JSON.stringify({ ok: true, path: capturePath, bytes: receivedBytes }),
	);
	console.log(`Saved capture to ${capturePath}`);
};

const proxyLinearGet = async (request, response, requestUrl) => {
	const upstreamUrl = new URL(
		`${requestUrl.pathname}${requestUrl.search}`,
		linearOrigin,
	);
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (
			value == null ||
			["authorization", "connection", "cookie", "host", "origin", "referer"].includes(
				name,
			)
		) {
			continue;
		}
		headers.set(name, Array.isArray(value) ? value.join(", ") : value);
	}

	const upstream = await fetch(upstreamUrl, {
		method: request.method,
		headers,
		redirect: "manual",
	});
	const responseHeaders = {};
	for (const name of [
		"accept-ranges",
		"cache-control",
		"content-range",
		"content-type",
		"etag",
		"last-modified",
	]) {
		const value = upstream.headers.get(name);
		if (value) responseHeaders[name] = value;
	}

	const location = upstream.headers.get("location");
	if (location) {
		const redirected = new URL(location, linearOrigin);
		responseHeaders.location =
			redirected.origin === linearOrigin
				? `${requestUrl.origin}${redirected.pathname}${redirected.search}${redirected.hash}`
				: redirected.href;
	}

	response.writeHead(upstream.status, responseHeaders);
	if (request.method === "HEAD" || !upstream.body) {
		response.end();
		return;
	}
	Readable.fromWeb(upstream.body).pipe(response);
};

createServer(async (request, response) => {
	const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);
	if (
		await handleAgentationRequest({
			request,
			response,
			requestUrl,
			site: "linear-light-mode",
		})
	) {
		return;
	}

	if (requestUrl.pathname === "/__capture" && request.method === "OPTIONS") {
		response.writeHead(204, corsHeaders);
		response.end();
		return;
	}

	if (requestUrl.pathname === "/__capture" && request.method === "POST") {
		try {
			await writeCapture(request, response);
		} catch (error) {
			response.writeHead(500, {
				...corsHeaders,
				"content-type": "application/json; charset=utf-8",
			});
			response.end(
				JSON.stringify({
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		["/", "/next", "/next/"].includes(requestUrl.pathname)
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-linear-page.js on https://linear.app/next.\n`,
			);
			return;
		}

		if (request.method === "HEAD") {
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			});
			response.end();
			return;
		}
		await serveCaptureWithAgentation(
			response,
			capturePath,
			"linear-light-mode",
		);
		return;
	}

	if (["GET", "HEAD"].includes(request.method || "")) {
		try {
			await proxyLinearGet(request, response, requestUrl);
		} catch (error) {
			response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Linear asset proxy failed: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
		return;
	}

	response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
	response.end("Only the local capture endpoint accepts writes.\n");
}).listen(port, "127.0.0.1", () => {
	console.log(`Linear light reference: http://127.0.0.1:${port}/next`);
	console.log(`Captures save directly to ${capturePath}`);
	console.log("Public Linear assets are proxied read-only; press Ctrl+C to stop.");
});
