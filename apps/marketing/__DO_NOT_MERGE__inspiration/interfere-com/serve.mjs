import { createReadStream, existsSync, statSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	handleAgentationRequest,
	serveCaptureWithAgentation,
} from "../_agentation/server.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number.parseInt(process.env.OPALINE_REFERENCE_PORT || "4174", 10);
const defaultFile = "interfere-engineers.capture.html";
const capturePath = resolve(root, defaultFile);
const temporaryCapturePath = resolve(root, `${defaultFile}.tmp`);
const maximumCaptureBytes = 128 * 1024 * 1024;

const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

createServer(async (request, response) => {
	const requestUrl = new URL(request.url || "/", "http://localhost");
	const requestPath = decodeURIComponent(requestUrl.pathname);

	if (
		await handleAgentationRequest({
			request,
			response,
			requestUrl,
			site: "interfere-com",
		})
	) {
		return;
	}

	if (requestPath === "/__capture" && request.method === "OPTIONS") {
		response.writeHead(204, corsHeaders);
		response.end();
		return;
	}

	if (requestPath === "/__capture" && request.method === "POST") {
		try {
			const declaredLength = Number.parseInt(
				request.headers["content-length"] || "0",
				10,
			);
			if (declaredLength > maximumCaptureBytes) {
				response.writeHead(413, {
					...corsHeaders,
					"content-type": "application/json; charset=utf-8",
				});
				response.end(JSON.stringify({ error: "Capture exceeds 128 MiB." }));
				return;
			}

			const chunks = [];
			let receivedBytes = 0;
			for await (const chunk of request) {
				receivedBytes += chunk.length;
				if (receivedBytes > maximumCaptureBytes) {
					throw new Error("Capture exceeds 128 MiB.");
				}
				chunks.push(chunk);
			}

			await writeFile(temporaryCapturePath, Buffer.concat(chunks));
			await rename(temporaryCapturePath, capturePath);
			response.writeHead(201, {
				...corsHeaders,
				"content-type": "application/json; charset=utf-8",
			});
			response.end(
				JSON.stringify({
					ok: true,
					path: capturePath,
					bytes: receivedBytes,
				}),
			);
			console.log(`Saved capture to ${capturePath}`);
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

	const relativePath = requestPath === "/" ? defaultFile : requestPath.slice(1);
	const filePath = resolve(root, normalize(relativePath));
	const resolvedRoot = resolve(root);
	const isInsideRoot =
		filePath === resolvedRoot || filePath.startsWith(`${resolvedRoot}${sep}`);

	if (!isInsideRoot || !existsSync(filePath) || !statSync(filePath).isFile()) {
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		response.end(
			requestPath === "/"
				? `Missing ${defaultFile}. Run capture-interfere-page.js on the live page and save the download here.\n`
				: "Not found\n",
		);
		return;
	}

	if (filePath === capturePath) {
		await serveCaptureWithAgentation(
			response,
			capturePath,
			"interfere-com",
		);
		return;
	}
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type":
			contentTypes[extname(filePath).toLowerCase()] ||
			"application/octet-stream",
	});
	createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
	console.log(`Interfere reference: http://127.0.0.1:${port}`);
	console.log(`Captures save directly to ${capturePath}`);
	console.log("Press Ctrl+C to stop.");
});
