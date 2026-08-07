import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	handleAgentationRequest,
	injectAgentation,
} from "../_agentation/server.mjs";

const rootUrl = new URL(".", import.meta.url);
const lensCaptureUrl = new URL(
	"../lens-xyz/lens-build.capture.html",
	import.meta.url,
);
const port = Number.parseInt(
	process.env.OPALINE_IMAGE_GEN_DOTS_REFERENCE_PORT || "4178",
	10,
);
const defaultSite = "image-gen-loading-state-dots";

const characterLabels = new Map([
	["cheaper", "Cheapest."],
	["security", "Secure."],
	["faster", "Fastest."],
	["scalable", "Scalable."],
]);

let characterIcons;

const readCharacterIcons = async () => {
	if (characterIcons) return characterIcons;

	const lensHtml = await readFile(lensCaptureUrl, "utf8");
	const icons = new Map();
	const iconPattern =
		/<div class="styles-module-scss-module__5YpdwW__icon">\s*(<svg[\s\S]*?<\/svg>)\s*<\/div>\s*<h5>([^<]+)/g;

	for (const match of lensHtml.matchAll(iconPattern)) {
		const [, svg, label] = match;
		icons.set(label, svg);
	}

	characterIcons = icons;
	return characterIcons;
};

const contentTypes = new Map([
	[".css", "text/css; charset=utf-8"],
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".svg", "image/svg+xml"],
]);

createServer(async (request, response) => {
	const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);
	const sessionStoryRoute = ["/session-story", "/session-story/"].includes(
		requestUrl.pathname,
	);
	const site = sessionStoryRoute ? "opaline-session-story" : defaultSite;
	if (
		await handleAgentationRequest({
			request,
			response,
			requestUrl,
			site,
		})
	) {
		return;
	}

	if (!["GET", "HEAD"].includes(request.method || "")) {
		response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
		response.end("Only GET and HEAD are supported.\n");
		return;
	}

	const characterMatch = requestUrl.pathname.match(
		/^\/session-story\/assets\/character-(cheaper|security|faster|scalable)\.svg$/,
	);
	if (characterMatch) {
		const label = characterLabels.get(characterMatch[1]);
		const icons = await readCharacterIcons();
		const svg = label ? icons.get(label) : undefined;

		if (!svg) {
			response.writeHead(404, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end("Character icon not found.\n");
			return;
		}

		response.writeHead(200, {
			"cache-control": "no-store",
			"content-type": "image/svg+xml",
		});
		if (request.method === "HEAD") response.end();
		else response.end(svg);
		return;
	}

	const pointerRoute = [
		"/image-gen-loading-state-dots/pointer",
		"/image-gen-loading-state-dots/pointer/",
	].includes(requestUrl.pathname);
	const lensHeroRoute = [
		"/image-gen-loading-state-dots/lens-hero",
		"/image-gen-loading-state-dots/lens-hero/",
	].includes(requestUrl.pathname);
	let relativePath = requestUrl.pathname.slice(1);
	if (
		requestUrl.pathname === "/" ||
		requestUrl.pathname === "/image-gen-loading-state-dots" ||
		pointerRoute
	) {
		relativePath = "index.html";
	} else if (lensHeroRoute) {
		relativePath = "lens-hero.html";
	} else if (sessionStoryRoute) {
		relativePath = "session-story.html";
	}
	const fileUrl = new URL(relativePath, rootUrl);
	const filePath = fileURLToPath(fileUrl);

	if (
		!fileUrl.href.startsWith(rootUrl.href) ||
		!existsSync(filePath) ||
		!statSync(filePath).isFile()
	) {
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		response.end("Not found.\n");
		return;
	}

	const contentType =
		contentTypes.get(extname(fileUrl.pathname)) || "application/octet-stream";
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": contentType,
	});

	if (request.method === "HEAD") {
		response.end();
		return;
	}

	if (fileUrl.pathname.endsWith(".html")) {
		const sourceHtml = await readFile(filePath, "utf8");
		const html =
			pointerRoute && fileUrl.pathname.endsWith("index.html")
				? sourceHtml
						.replace(
							"Image generation loading dots reference",
							"Pointer-controlled image generation loading dots",
						)
						.replace("/animation.js", "/animation-pointer.js")
				: sourceHtml;
		response.end(injectAgentation(html, site));
		return;
	}

	createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
	console.log(
		`Image generation loading dots: http://127.0.0.1:${port}/image-gen-loading-state-dots`,
	);
	console.log(
		`Pointer iteration: http://127.0.0.1:${port}/image-gen-loading-state-dots/pointer`,
	);
	console.log(
		`Lens hero iteration: http://127.0.0.1:${port}/image-gen-loading-state-dots/lens-hero`,
	);
	console.log(`Opaline session story: http://127.0.0.1:${port}/session-story`);
	console.log("Press Ctrl+C to stop.");
});
