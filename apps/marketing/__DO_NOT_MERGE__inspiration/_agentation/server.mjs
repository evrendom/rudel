import { createReadStream, existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const overlayPath = fileURLToPath(new URL("overlay.js", import.meta.url));
const brandingScriptPath = fileURLToPath(
	new URL("opaline-branding.js", import.meta.url),
);
const brandingAssets = new Map([
	[
		"/__opaline/wordmark.svg",
		fileURLToPath(new URL("../../public/opaline-wordmark.svg", import.meta.url)),
	],
	[
		"/__opaline/icon.svg",
		fileURLToPath(new URL("../../public/opaline-icon.svg", import.meta.url)),
	],
	[
		"/__opaline/favicon.svg",
		fileURLToPath(new URL("../../public/favicon.svg", import.meta.url)),
	],
]);
const maximumEventBytes = 1024 * 1024;

export const injectAgentation = (html, site) => {
	const overlayPath = `/__agentation/overlay.js?site=${encodeURIComponent(site)}`;
	const head = `<script data-opaline-branding>(()=>{const favicon=document.createElement("link");favicon.rel="icon";favicon.type="image/svg+xml";favicon.href=new URL("/__opaline/favicon.svg",window.location.origin).href;favicon.dataset.opalineFavicon="";document.head.append(favicon);import(new URL("/__opaline/branding.js",window.location.origin).href)})()</script>`;
	const script = `<script type="module" data-opaline-agentation>import(new URL(${JSON.stringify(overlayPath)}, window.location.origin).href)</script>`;
	const brandedHtml = /<\/head>/i.test(html)
		? html.replace(/<\/head>/i, `${head}</head>`)
		: `${head}${html}`;
	return /<\/body>/i.test(brandedHtml)
		? brandedHtml.replace(/<\/body>/i, `${script}</body>`)
		: `${brandedHtml}${script}`;
};

export const serveCaptureWithAgentation = async (
	response,
	capturePath,
	site,
) => {
	const html = await readFile(capturePath, "utf8");
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(injectAgentation(html, site));
};

const readEventBody = async (request) => {
	const chunks = [];
	let receivedBytes = 0;
	for await (const chunk of request) {
		receivedBytes += chunk.length;
		if (receivedBytes > maximumEventBytes) {
			throw new Error("Agentation event exceeds 1 MiB.");
		}
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

export const handleAgentationRequest = async ({
	request,
	response,
	requestUrl,
	site,
}) => {
	if (
		requestUrl.pathname === "/__opaline/branding.js" &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		response.writeHead(200, {
			"cache-control": "no-store",
			"content-type": "text/javascript; charset=utf-8",
		});
		if (request.method === "HEAD") response.end();
		else createReadStream(brandingScriptPath).pipe(response);
		return true;
	}

	const brandingAssetPath = brandingAssets.get(requestUrl.pathname);
	if (
		brandingAssetPath &&
		["GET", "HEAD"].includes(request.method || "")
	) {
		response.writeHead(200, {
			"cache-control": "no-store",
			"content-type": "image/svg+xml",
		});
		if (request.method === "HEAD") response.end();
		else createReadStream(brandingAssetPath).pipe(response);
		return true;
	}

	if (
		requestUrl.pathname === "/__agentation/overlay.js" &&
		request.method === "GET"
	) {
		if (!existsSync(overlayPath)) {
			response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
			response.end("Agentation bundle is missing. Run _agentation/build.mjs.\n");
			return true;
		}
		response.writeHead(200, {
			"cache-control": "no-store",
			"content-type": "text/javascript; charset=utf-8",
		});
		createReadStream(overlayPath).pipe(response);
		return true;
	}

	if (
		requestUrl.pathname === "/__agentation/events" &&
		request.method === "POST"
	) {
		try {
			const event = await readEventBody(request);
			const eventPath = fileURLToPath(
				new URL(`${encodeURIComponent(site)}.annotations.jsonl`, import.meta.url),
			);
			await appendFile(
				eventPath,
				`${JSON.stringify({ ...event, site, receivedAt: new Date().toISOString() })}\n`,
			);
			response.writeHead(204);
			response.end();
		} catch (error) {
			response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
			response.end(
				JSON.stringify({
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
		return true;
	}

	return false;
};
