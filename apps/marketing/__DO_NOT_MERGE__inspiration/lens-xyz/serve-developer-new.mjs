import { existsSync, statSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
	handleAgentationRequest,
	injectAgentation,
} from "../_agentation/server.mjs";

const rootUrl = new URL(".", import.meta.url);
const port = Number.parseInt(
	process.env.OPALINE_LENS_DEVELOPER_REFERENCE_PORT || "4177",
	10,
);
const defaultFile = "lens-developer-new.capture.html";
const capturePath = fileURLToPath(new URL(defaultFile, rootUrl));
const temporaryCapturePath = fileURLToPath(
	new URL(`${defaultFile}.tmp`, rootUrl),
);
const maximumCaptureBytes = 16 * 1024 * 1024;
const lensDeveloperOrigin = "https://developer.lens.xyz";

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

const backgroundOnlyVariant = "background-only";
const backgroundOnlyStyles = `<style data-opaline-iteration="${backgroundOnlyVariant}">
.styles-module-scss-module__I1aGUW__card,
.styles-module-scss-module__YaVi2a__featuresContainer {
	display: none !important;
}
</style>`;

const transposedGridVariant = "transposed-grid";
const transposedGridBootstrap = `${backgroundOnlyStyles}<style data-opaline-pattern="transposed-grid">
.styles-module-scss-module__nKID7q__background {
	isolation: isolate;
	overflow: hidden !important;
}

canvas[data-opaline-transposed-grid] {
	position: absolute;
	z-index: 1;
	inset: 0;
	display: block;
	width: 100% !important;
	height: 100% !important;
	mix-blend-mode: multiply;
	pointer-events: none;
}
</style><script data-opaline-pattern-runtime>
(()=>{
	const mount=()=>{
		const source=document.querySelector('canvas[data-engine^="three.js"]');
		if(!source||source.dataset.opalineGridSource)return false;
		const overlay=document.createElement("canvas");
		overlay.dataset.opalineTransposedGrid="";
		overlay.setAttribute("aria-hidden","true");
		source.dataset.opalineGridSource="";
		source.parentElement.append(overlay);
		const context=overlay.getContext("2d",{alpha:true});
		if(!context){overlay.remove();return true}
		const probe=document.createElement("canvas");
		probe.width=1;
		probe.height=1;
		const probeContext=probe.getContext("2d",{alpha:true,willReadFrequently:true});
		let frame=0;
		const draw=()=>{
			if(!source.isConnected||!overlay.isConnected){cancelAnimationFrame(frame);return}
			const width=source.width;
			const height=source.height;
			if(width>0&&height>0){
				if(probeContext){
					probeContext.clearRect(0,0,1,1);
					probeContext.drawImage(source,Math.floor(width/2),Math.floor(height/2),1,1,0,0,1,1);
					if(probeContext.getImageData(0,0,1,1).data[3]===0){
						frame=requestAnimationFrame(draw);
						return;
					}
				}
				if(overlay.width!==width||overlay.height!==height){
					overlay.width=width;
					overlay.height=height;
				}
				context.clearRect(0,0,width,height);
				context.save();
				context.translate(width/2,height/2);
				context.rotate(Math.PI/2);
				const columnTiles=Math.ceil(width/height)+1;
				const rowTiles=Math.ceil(height/width)+1;
				for(let row=-rowTiles;row<=rowTiles;row+=1){
					for(let column=-columnTiles;column<=columnTiles;column+=1){
						context.drawImage(source,-width/2+row*width,-height/2+column*height);
					}
				}
				context.restore();
			}
			frame=requestAnimationFrame(draw);
		};
		frame=requestAnimationFrame(draw);
		return true;
	};
	const wait=()=>{if(!mount())setTimeout(wait,16)};
	setTimeout(wait,0);
})()
</script>`;

const iterationStyles = new Map([
	[backgroundOnlyVariant, backgroundOnlyStyles],
	[transposedGridVariant, transposedGridBootstrap],
]);

const iterationRoutes = new Map([
	["/iteration-01", backgroundOnlyVariant],
	["/iteration-01/", backgroundOnlyVariant],
	["/iteration-01/3", transposedGridVariant],
	["/iteration-01/3/", transposedGridVariant],
]);

const removedIterationRoutes = new Set([
	"/iteration-01/1",
	"/iteration-01/1/",
	"/iteration-01/2",
	"/iteration-01/2/",
]);

const serveLensDeveloperCapture = async (
	response,
	variant = null,
	displayPath = null,
) => {
	const html = await readFile(capturePath, "utf8");
	const consentBootstrap = `<script data-opaline-capture-bootstrap>try{localStorage.setItem("cookie-consent","denied")}catch{}</script>`;
	const routeBootstrap = displayPath
		? `<script data-opaline-route-bootstrap>(()=>{const replace=history.replaceState.bind(history);replace(null,"","/?variant=${encodeURIComponent(variant)}");addEventListener("load",()=>setTimeout(()=>replace(null,"",${JSON.stringify(displayPath)}),1200),{once:true})})()</script>`
		: "";
	const iterationBootstrap = iterationStyles.get(variant) || "";
	const initializedHtml = /<head>/i.test(html)
		? html.replace(
				/<head>/i,
				`<head>${consentBootstrap}${routeBootstrap}${iterationBootstrap}`,
			)
		: `${consentBootstrap}${routeBootstrap}${iterationBootstrap}${html}`;
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(
		injectAgentation(
			initializedHtml,
			iterationStyles.has(variant)
				? `lens-developer-${variant}`
				: "lens-developer-new",
		),
	);
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
		response.end(JSON.stringify({ error: "Capture exceeds 16 MiB." }));
		return;
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

	const body = Buffer.concat(chunks);
	const preview = body.subarray(0, 8192).toString("utf8");
	if (
		!/<html[\s>]/i.test(preview) ||
		!preview.includes("Lens Developer Dashboard")
	) {
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

const proxyLensDeveloperGet = async (request, response, requestUrl) => {
	const upstreamUrl = new URL(
		`${requestUrl.pathname}${requestUrl.search}`,
		lensDeveloperOrigin,
	);
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (
			value == null ||
			[
				"authorization",
				"connection",
				"cookie",
				"host",
				"origin",
				"referer",
			].includes(name)
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
		const redirected = new URL(location, lensDeveloperOrigin);
		responseHeaders.location =
			redirected.origin === lensDeveloperOrigin
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
			site: "lens-developer-new",
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
		requestUrl.pathname === "/"
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Missing ${defaultFile}. Run capture-lens-developer-new.js on https://developer.lens.xyz/.\n`,
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
		await serveLensDeveloperCapture(
			response,
			requestUrl.searchParams.get("variant"),
		);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		iterationRoutes.has(requestUrl.pathname)
	) {
		const variant = iterationRoutes.get(requestUrl.pathname);
		if (request.method === "HEAD") {
			response.writeHead(200, {
				"cache-control": "no-store",
				"content-type": "text/html; charset=utf-8",
			});
			response.end();
			return;
		}
		await serveLensDeveloperCapture(response, variant, requestUrl.pathname);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		removedIterationRoutes.has(requestUrl.pathname)
	) {
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		response.end("This iteration was removed.\n");
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		["/new", "/new/"].includes(requestUrl.pathname)
	) {
		response.writeHead(302, { location: "/" });
		response.end();
		return;
	}

	if (["GET", "HEAD"].includes(request.method || "")) {
		try {
			await proxyLensDeveloperGet(request, response, requestUrl);
		} catch (error) {
			response.writeHead(502, {
				"content-type": "text/plain; charset=utf-8",
			});
			response.end(
				`Lens Developer asset proxy failed: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
		return;
	}

	response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
	response.end("Only the local capture endpoint accepts writes.\n");
}).listen(port, "127.0.0.1", () => {
	console.log(`Lens Developer reference: http://127.0.0.1:${port}/`);
	console.log(
		`Background-only iteration: http://127.0.0.1:${port}/iteration-01`,
	);
	console.log(
		`Transposed-grid iteration: http://127.0.0.1:${port}/iteration-01/3`,
	);
	console.log(`Captures save directly to ${capturePath}`);
	console.log(
		"Public Lens Developer assets are proxied read-only; press Ctrl+C to stop.",
	);
});
