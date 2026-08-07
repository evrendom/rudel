import { existsSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	handleAgentationRequest,
	serveCaptureWithAgentation,
} from "../_agentation/server.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number.parseInt(
	process.env.OPALINE_ATOMS_REFERENCE_PORT || "4179",
	10,
);
const defaultFile = "atoms-home.capture.html";
const capturePath = resolve(root, defaultFile);
const temporaryCapturePath = resolve(root, `${defaultFile}.tmp`);
const maximumCaptureBytes = 16 * 1024 * 1024;

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

const removeTracking = (html) =>
	html
		.replace(/\s*<!-- Initialize gtag[\s\S]*?<\/script>\s*/i, "\n")
		.replace(
			/\s*<!-- Global site tag[\s\S]*?<script[^>]+googletagmanager[^>]*><\/script>\s*/i,
			"\n",
		);

const readCapture = async (request) => {
	const declaredLength = Number.parseInt(
		request.headers["content-length"] || "0",
		10,
	);
	if (declaredLength > maximumCaptureBytes) {
		throw new Error("Capture exceeds 16 MiB.");
	}

	const chunks = [];
	let receivedBytes = 0;
	for await (const chunk of request) {
		receivedBytes += chunk.length;
		if (receivedBytes > maximumCaptureBytes) {
			throw new Error("Capture exceeds 16 MiB.");
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
};

const saveCapture = async (request, response) => {
	try {
		const html = removeTracking(await readCapture(request));
		if (
			!html.includes('data-framer-name="hero-section"') ||
			!html.includes('data-framer-name="companies-section"')
		) {
			throw new Error("The submitted document is not the Atoms homepage.");
		}

		await writeFile(temporaryCapturePath, html);
		await rename(temporaryCapturePath, capturePath);
		response.writeHead(201, {
			...corsHeaders,
			"content-type": "application/json; charset=utf-8",
		});
		response.end(
			JSON.stringify({
				bytes: Buffer.byteLength(html),
				ok: true,
				path: capturePath,
			}),
		);
		console.log(`Saved capture to ${capturePath}`);
	} catch (error) {
		response.writeHead(400, {
			...corsHeaders,
			"content-type": "application/json; charset=utf-8",
		});
		response.end(
			JSON.stringify({
				error: error instanceof Error ? error.message : String(error),
			}),
		);
	}
};

createServer(async (request, response) => {
	const requestUrl = new URL(request.url || "/", "http://localhost");

	if (
		await handleAgentationRequest({
			request,
			response,
			requestUrl,
			site: "atoms-co",
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
		await saveCapture(request, response);
		return;
	}

	if (
		["/", "/index.html"].includes(requestUrl.pathname) &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		if (!existsSync(capturePath)) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Capture https://atoms.co/ first.\n`,
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
		await serveCaptureWithAgentation(response, capturePath, "atoms-co");
		return;
	}

	response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
	response.end("Not found\n");
}).listen(port, "127.0.0.1", () => {
	console.log(`Atoms reference: http://127.0.0.1:${port}/`);
	console.log(`Captures save directly to ${capturePath}`);
	console.log("Press Ctrl+C to stop.");
});
