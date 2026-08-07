import { existsSync, statSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
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
const rudelNpmUrl = "https://www.npmjs.com/package/rudel";
const rudelGithubUrl = "https://github.com/evrendom/rudel";
const rudelLoginUrl = "https://app.rudel.ai/";
const rudelProductHuntUrl = "https://www.producthunt.com/products/rudel";
const rudelHackerNewsUrl = "https://news.ycombinator.com/item?id=47350416";
const rudelNpmWeeklyDownloads = "401 weekly";
const rudelGithubStars = "289 stars";
const rudelProductHuntVotes = "180 upvotes";
const rudelHackerNewsScore = "144 points";

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

const navbarIsolationStyle = `<style data-linear-navbar-isolation>
	html,
	body {
		width: 100% !important;
		height: 100% !important;
		min-height: 0 !important;
		margin: 0 !important;
		overflow: hidden !important;
		background: transparent !important;
		overscroll-behavior: none !important;
	}

	body * {
		visibility: hidden !important;
	}

	header,
	header *,
	[data-linear-navbar-portal],
	[data-linear-navbar-portal] * {
		visibility: visible !important;
	}
</style>`;

const navbarBrandingScript = `<script data-opaline-branding>
	(() => {
		const favicon = document.createElement("link");
		favicon.rel = "icon";
		favicon.type = "image/svg+xml";
		favicon.href = new URL("/__opaline/favicon.svg", window.location.origin).href;
		favicon.dataset.opalineFavicon = "";
		document.head.append(favicon);
		import(new URL("/__opaline/branding.js", window.location.origin).href);
	})();
</script>`;

const rudelNavbarLinksStyle = `<style data-rudel-navbar-links>
	@media (min-width: 1280px) {
		[data-rudel-navbar-actions] {
			width: 837px !important;
			max-width: 837px !important;
			flex: 0 0 837px !important;
		}
	}

	[data-rudel-navbar-link-item] {
		display: flex !important;
		align-items: center !important;
		margin: 0 !important;
		padding: 0 !important;
	}

	[data-rudel-navbar-link] {
		display: inline-flex !important;
		width: auto !important;
		height: 32px !important;
		min-width: 32px !important;
		align-items: center !important;
		justify-content: center !important;
		gap: 6px !important;
		box-sizing: border-box !important;
		padding: 0 10px !important;
		border: 0 !important;
		border-radius: 999px !important;
		background: rgba(40, 42, 48, 0.06) !important;
		color: rgb(40, 42, 48) !important;
		font-family: inherit !important;
		font-size: 13px !important;
		font-weight: 500 !important;
		line-height: 1 !important;
		text-decoration: none !important;
		white-space: nowrap !important;
		transition:
			background-color 160ms ease,
			color 160ms ease !important;
	}

	[data-rudel-navbar-link]:hover {
		background: rgba(40, 42, 48, 0.11) !important;
	}

	[data-rudel-navbar-link]:focus-visible {
		outline: 2px solid rgb(40, 42, 48) !important;
		outline-offset: 2px !important;
	}

	[data-rudel-navbar-link] svg {
		display: block !important;
		width: 16px !important;
		height: 16px !important;
		flex: 0 0 16px !important;
	}

	[data-rudel-navbar-meta] {
		margin-left: -2px !important;
		color: rgba(40, 42, 48, 0.48) !important;
		font-size: 12px !important;
		font-weight: 450 !important;
	}

	@media (max-width: 1279px) {
		[data-rudel-navbar-link] {
			width: 32px !important;
			padding: 0 !important;
			gap: 0 !important;
		}

		[data-rudel-navbar-label] {
			position: absolute !important;
			width: 1px !important;
			height: 1px !important;
			margin: -1px !important;
			padding: 0 !important;
			overflow: hidden !important;
			clip: rect(0 0 0 0) !important;
			clip-path: inset(50%) !important;
			white-space: nowrap !important;
		}
	}

</style>`;

const rudelNavbarLinksScript = `<script data-rudel-navbar-links>
	(() => {
		const linksMarkup = ${JSON.stringify(`<li class="TZTsQG_buttonItem TZTsQG_item" data-rudel-navbar-link-item>
	<a data-rudel-navbar-link href="${rudelNpmUrl}" target="_blank" rel="noopener noreferrer" aria-label="Rudel on npm, ${rudelNpmWeeklyDownloads}" title="Rudel on npm">
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>
		<span data-rudel-navbar-label>npm</span>
		<span data-rudel-navbar-label data-rudel-navbar-meta>${rudelNpmWeeklyDownloads}</span>
	</a>
</li>
<li class="TZTsQG_buttonItem TZTsQG_item" data-rudel-navbar-link-item>
	<a data-rudel-navbar-link href="${rudelGithubUrl}" target="_blank" rel="noopener noreferrer" aria-label="Rudel on GitHub, ${rudelGithubStars}" title="Rudel on GitHub">
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.51v-1.84c-2.94.64-3.56-1.25-3.56-1.25-.48-1.22-1.17-1.55-1.17-1.55-.96-.65.07-.64.07-.64 1.06.08 1.62 1.09 1.62 1.09.94 1.61 2.47 1.15 3.08.88.09-.68.37-1.15.67-1.42-2.35-.27-4.82-1.17-4.82-5.19 0-1.15.41-2.08 1.08-2.82-.11-.27-.47-1.34.1-2.78 0 0 .88-.28 2.89 1.08A10.1 10.1 0 0 1 12 6.65c.89 0 1.79.12 2.63.35 2-1.36 2.89-1.08 2.89-1.08.57 1.44.21 2.51.1 2.78.67.74 1.08 1.67 1.08 2.82 0 4.03-2.48 4.92-4.83 5.18.38.33.72.97.72 1.96v2.79c0 .28.19.62.73.51A10.5 10.5 0 0 0 12 1.5Z"/></svg>
		<span data-rudel-navbar-label>GitHub</span>
		<span data-rudel-navbar-label data-rudel-navbar-meta>${rudelGithubStars}</span>
	</a>
</li>
<li class="TZTsQG_buttonItem TZTsQG_item" data-rudel-navbar-link-item>
	<a data-rudel-navbar-login href="${rudelLoginUrl}" target="_top" rel="noopener" aria-label="Log in to Rudel" class="S36ykG_root S36ykG_variant-invert S36ykG_size-small S36ykG_variant I_mUeq_root">Log in</a>
</li>
<!-- <li data-rudel-navbar-link-item>
	<a data-rudel-navbar-link href="${rudelProductHuntUrl}" target="_blank" rel="noopener noreferrer" aria-label="Rudel on Product Hunt, ${rudelProductHuntVotes}" title="Rudel on Product Hunt">
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path fill="white" d="M9.25 6.75h4.1a3.75 3.75 0 1 1 0 7.5h-1.6v3h-2.5V6.75Zm2.5 2.25v3h1.48a1.5 1.5 0 1 0 0-3h-1.48Z"/></svg>
		<span data-rudel-navbar-label>Product Hunt</span>
		<span data-rudel-navbar-label data-rudel-navbar-meta>${rudelProductHuntVotes}</span>
	</a>
</li>
<li data-rudel-navbar-link-item>
	<a data-rudel-navbar-link href="${rudelHackerNewsUrl}" target="_blank" rel="noopener noreferrer" aria-label="Rudel on Hacker News, ${rudelHackerNewsScore}" title="Rudel on Hacker News">
		<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor"/><path fill="white" d="M6.6 6.5h2.3l3.1 5 3.1-5h2.3l-4.3 6.8v4.2h-2.2v-4.2L6.6 6.5Z"/></svg>
		<span data-rudel-navbar-label>Hacker News</span>
		<span data-rudel-navbar-label data-rudel-navbar-meta>${rudelHackerNewsScore}</span>
	</a>
</li> -->`)};
		let scheduled = false;
		const ensureLinks = () => {
			scheduled = false;
			const header = document.querySelector("header");
			if (!(header instanceof HTMLElement)) {
				setTimeout(scheduleEnsure, 80);
				return;
			}
			const accountLink = [...header.querySelectorAll("a")].find((link) =>
				["Log in", "Sign up", "Open app"].includes(
					link.textContent?.trim() || "",
				),
			);
			const buttons =
				header.querySelector("ul[data-rudel-navbar-links]") ||
				accountLink?.closest("ul");
			if (!(buttons instanceof HTMLUListElement)) {
				setTimeout(scheduleEnsure, 80);
				return;
			}
			buttons.parentElement?.setAttribute("data-rudel-navbar-actions", "");
			const currentLinks = buttons.querySelectorAll(
				"[data-rudel-navbar-link], [data-rudel-navbar-login]",
			);
			if (currentLinks.length === 3) return;
			buttons.setAttribute("data-rudel-navbar-links", "");
			buttons.innerHTML = linksMarkup;
		};
		const scheduleEnsure = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(ensureLinks);
		};
		new MutationObserver(scheduleEnsure).observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		if (document.readyState === "loading") {
			addEventListener("DOMContentLoaded", scheduleEnsure, { once: true });
		} else {
			scheduleEnsure();
		}
	})();
</script>`;

const navbarIsolationScript = `<script data-linear-navbar-isolation>
	(() => {
		const collapsedHeight = 73;
		let scheduled = false;

		const reportFrame = () => {
			scheduled = false;
			const header = document.querySelector("header");
			if (!(header instanceof HTMLElement)) {
				setTimeout(scheduleReport, 80);
				return;
			}

			for (const openSurface of document.querySelectorAll(
				'[data-state="open"], [role="dialog"]',
			)) {
				if (header.contains(openSurface)) continue;
				let portal = openSurface;
				while (portal.parentElement && portal.parentElement !== document.body) {
					portal = portal.parentElement;
				}
				portal.setAttribute("data-linear-navbar-portal", "");
			}

			const mobileOpen = Boolean(
				header.querySelector(
					'button[aria-haspopup="dialog"][aria-expanded="true"]',
				),
			);
			const expanded = Boolean(
				mobileOpen ||
					header.querySelector('[data-state="open"], [aria-expanded="true"]'),
			);
			let height = collapsedHeight;
			if (expanded && !mobileOpen) {
				const visibleElements = [
					header,
					...header.querySelectorAll("*"),
					...document.querySelectorAll("[data-linear-navbar-portal]"),
				];
				for (const element of visibleElements) {
					const style = getComputedStyle(element);
					if (
						style.display === "none" ||
						style.visibility === "hidden" ||
						Number.parseFloat(style.opacity) === 0
					) {
						continue;
					}
					const rect = element.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						height = Math.max(height, Math.ceil(rect.bottom));
					}
				}
			}

			window.parent.postMessage(
				{
					type: "linear-navbar-frame",
					expanded,
					fullscreen: mobileOpen,
					height,
				},
				"*",
			);
		};

		const scheduleReport = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(reportFrame);
		};

		new MutationObserver(scheduleReport).observe(document.documentElement, {
			attributes: true,
			childList: true,
			subtree: true,
		});
		addEventListener("resize", scheduleReport);
		addEventListener(
			"wheel",
			(event) => {
				const multiplier =
					event.deltaMode === WheelEvent.DOM_DELTA_LINE
						? 16
						: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
							? innerHeight
							: 1;
				event.preventDefault();
				window.parent.postMessage(
					{
						type: "linear-navbar-scroll",
						deltaY: event.deltaY * multiplier,
					},
					"*",
				);
			},
			{ passive: false },
		);
		scheduleReport();
	})();
</script>`;

const composeNavbarHtml = (html, { rudelLinks = false } = {}) => {
	const withHead = html.replace(
		/<\/head>/i,
		`${navbarIsolationStyle}${rudelLinks ? rudelNavbarLinksStyle : ""}${navbarBrandingScript}</head>`,
	);
	return withHead.replace(
		/<\/body>/i,
		`${navbarIsolationScript}${rudelLinks ? rudelNavbarLinksScript : ""}</body>`,
	);
};

const serveNavbar = async (response, { rudelLinks = false } = {}) => {
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(
		composeNavbarHtml(await readFile(capturePath, "utf8"), { rudelLinks }),
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
		if (requestUrl.searchParams.get("opaline-source") === "navbar") {
			await serveNavbar(response, {
				rudelLinks: requestUrl.searchParams.get("opaline-links") === "rudel",
			});
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
	console.log(
		"Public Linear assets are proxied read-only; press Ctrl+C to stop.",
	);
});
