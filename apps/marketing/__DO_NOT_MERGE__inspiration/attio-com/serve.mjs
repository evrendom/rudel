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
	process.env.OPALINE_ATTIO_REFERENCE_PORT || "4180",
	10,
);
const defaultFile = "attio-home.capture.html";
const capturePath = fileURLToPath(new URL(defaultFile, rootUrl));
const temporaryCapturePath = fileURLToPath(
	new URL(`${defaultFile}.tmp`, rootUrl),
);
const maximumCaptureBytes = 24 * 1024 * 1024;
const attioOrigin = "https://attio.com";
const lensAtomsOrigin = "http://127.0.0.1:4175";
const lensAtomsCanvasSource = `${lensAtomsOrigin}/__lens-atoms/hero?opaline-layer=canvas`;
const interfereTitleSource = `${lensAtomsOrigin}/__lens-atoms/interfere-title`;
const agentSessionsTitleSource = `${interfereTitleSource}?opaline-copy=agent-sessions`;
const lensContentSource = `${lensAtomsOrigin}/build?opaline-source=lens-content`;
const linearNavbarOrigin = "http://127.0.0.1:4176";
const linearNavbarSource = `${linearNavbarOrigin}/next?opaline-source=navbar`;
const linearRudelNavbarSource = `${linearNavbarSource}&opaline-links=rudel`;
const lensAttioRoutes = new Set(["/lens-attio", "/lens-attio/"]);
const lensAttioLensRoutes = new Set(["/lens-attio-lens", "/lens-attio-lens/"]);
const attioHeroChunkPath = "/_next/static/chunks/0nbkc_oe2sf1x.js";
const attioHeroAutoplaySource =
	"let a=function(e){let[t,a]=(0,c.useState)(Z.HomeUiTabId.askAttio);return(0,c.useEffect)(()=>{if(!e)return;let r=window.setTimeout(()=>{a(e=>{let t;return t=(K.indexOf(e)+1)%K.length,K[t]})},U[t]);return()=>window.clearTimeout(r)},[t,e]),t}(!0);";
const attioHeroControlledSource =
	'let a=function(){let[e,a]=(0,c.useState)(()=>window.__opalineAttioScene||Z.HomeUiTabId.askAttio);return(0,c.useEffect)(()=>{let e=e=>{K.includes(e.detail)&&a(e.detail)};return window.addEventListener("opaline-attio-scene",e),()=>window.removeEventListener("opaline-attio-scene",e)},[]),e}();';

const patchAttioHeroChunk = (source) => {
	if (!source.includes(attioHeroAutoplaySource)) {
		console.warn(
			"Attio hero autoplay hook was not found; serving it unchanged.",
		);
		return source;
	}
	return source.replace(attioHeroAutoplaySource, attioHeroControlledSource);
};

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

const captureHeaders = {
	"cache-control": "no-store",
	"content-security-policy": [
		"default-src 'self'",
		"base-uri 'none'",
		"connect-src 'self'",
		"font-src 'self' https: data:",
		"frame-src 'none'",
		"img-src 'self' https: data: blob:",
		"media-src 'self' https: blob:",
		"object-src 'none'",
		"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
		"style-src 'self' 'unsafe-inline'",
		"worker-src 'self' blob:",
	].join("; "),
	"content-type": "text/html; charset=utf-8",
};

const lensAttioCaptureHeaders = {
	...captureHeaders,
	"content-security-policy": captureHeaders["content-security-policy"].replace(
		"frame-src 'none'",
		`frame-src 'self' ${lensAtomsOrigin} ${linearNavbarOrigin}`,
	),
};

const lensAttioRouteHeaders = {
	"cache-control": "no-store",
	"content-security-policy":
		"default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'",
	"content-type": "text/html; charset=utf-8",
};

const blockedScriptPattern =
	/(?:widget\.intercom\.io|(?:www\.)?gstatic\.com\/recaptcha|(?:www\.)?google\.com\/recaptcha|static\.claydar\.com|\/_vercel\/speed-insights\/)/i;

const stabilizeCapture = (html) => {
	const withoutThirdPartyScripts = html.replace(
		/<script\b([^>]*)>\s*<\/script>/gi,
		(fullTag, attributes) => {
			const source = attributes.match(/\bsrc=(['"])(.*?)\1/i)?.[2];
			return source && blockedScriptPattern.test(source) ? "" : fullTag;
		},
	);
	const localReferenceStyle = `<style data-attio-local-reference>
		.grecaptcha-badge,
		#intercom-frame,
		.intercom-lightweight-app {
			display: none !important;
		}
	</style>`;
	return withoutThirdPartyScripts.replace(
		/<\/head>/i,
		`${localReferenceStyle}</head>`,
	);
};

const attioDashboardSourceStyle = `<style data-attio-dashboard-source>
	:root,
	body,
	body > .flex.min-h-screen.max-w-screen,
	main,
	main > section:first-of-type {
		background: transparent !important;
	}

	html {
		width: 100% !important;
		height: 100% !important;
		margin: 0 !important;
		overflow-x: hidden !important;
		overflow-y: auto !important;
		scroll-behavior: auto !important;
		scrollbar-width: none;
	}

	body {
		width: 100% !important;
		height: auto !important;
		min-height: 100% !important;
		margin: 0 !important;
		overflow: visible !important;
		opacity: 0;
	}

	html::-webkit-scrollbar {
		display: none;
	}

	body::after {
		content: "";
		display: block;
		height: 100svh;
	}

	html[data-attio-dashboard-ready] body {
		opacity: 1;
	}

	body > .flex.min-h-screen.max-w-screen > .sticky:first-child,
	main > :not(section:first-of-type),
	footer {
		display: none !important;
	}

	main > section:first-of-type {
		margin-top: var(--site-header-height) !important;
		border-color: transparent !important;
		background: transparent !important;
		pointer-events: none !important;
	}

	main > section:first-of-type > * {
		visibility: hidden !important;
	}

	main > section:first-of-type [data-attio-dashboard-layer] {
		visibility: hidden !important;
		pointer-events: none !important;
	}

	main > section:first-of-type
		[data-attio-dashboard-layer]
		> :not([data-attio-dashboard]),
	main > section:first-of-type
		[data-attio-dashboard-layer]
		> :not([data-attio-dashboard]) * {
		visibility: hidden !important;
	}

	main > section:first-of-type [data-attio-dashboard] {
		visibility: visible !important;
		pointer-events: auto !important;
		translate: 0 var(--attio-dashboard-layout-shift, 0px);
		will-change: transform, translate;
	}

</style>`;

const attioDashboardSourceScript = `<script data-attio-dashboard-source>
	(() => {
		let scheduled = false;
		let dashboards = [];
		let requestedScrollY = 0;
		let layoutTargetTop = null;
		let layoutShift = 0;
		let layoutScheduled = false;
		const applyDashboardShift = () => {
			const progress = Math.min(1, requestedScrollY / 240);
			const shift = layoutShift * (1 - progress);
			for (const dashboard of dashboards) {
				dashboard.style.setProperty(
					"--attio-dashboard-layout-shift",
					shift + "px",
				);
			}
		};
		const measureDashboardLayout = () => {
			layoutScheduled = false;
			if (!Number.isFinite(layoutTargetTop) || dashboards.length === 0) return;
			for (const dashboard of dashboards) {
				dashboard.style.setProperty("--attio-dashboard-layout-shift", "0px");
			}
			const windows = dashboards.flatMap((dashboard) =>
				Array.from(dashboard.querySelectorAll(".touch-none")),
			);
			const primaryWindow = windows
				.map((element) => ({ element, rect: element.getBoundingClientRect() }))
				.filter(({ rect }) => rect.width > 0 && rect.height > 0)
				.sort(
					(a, b) =>
						b.rect.width * b.rect.height - a.rect.width * a.rect.height,
				)[0];
			if (!primaryWindow) return;
			layoutShift = layoutTargetTop - primaryWindow.rect.top;
			applyDashboardShift();
		};
		const scheduleDashboardLayout = () => {
			if (layoutScheduled) return;
			layoutScheduled = true;
			requestAnimationFrame(measureDashboardLayout);
		};
		const markDashboard = () => {
			scheduled = false;
			const hero = document.querySelector("main > section:first-of-type");
			if (!(hero instanceof HTMLElement)) return;
			const desktopRoot = hero.children[0]?.firstElementChild;
			const desktopLayer = desktopRoot?.children[1];
			const desktopDashboard = desktopLayer?.children[1];
			const mobileLayer =
				hero.children[1]?.firstElementChild?.firstElementChild
					?.firstElementChild;
			const mobileDashboard = mobileLayer?.children[3];
			let marked = false;
			for (const [layer, dashboard] of [
				[desktopLayer, desktopDashboard],
				[mobileLayer, mobileDashboard],
			]) {
				if (
					!(layer instanceof HTMLElement) ||
					!(dashboard instanceof HTMLElement)
				) {
					continue;
				}
				layer.setAttribute("data-attio-dashboard-layer", "");
				dashboard.setAttribute("data-attio-dashboard", "");
				marked = true;
			}
			if (marked) {
				dashboards = Array.from(
					document.querySelectorAll("[data-attio-dashboard]"),
				);
				document.documentElement.setAttribute("data-attio-dashboard-ready", "");
				scheduleDashboardLayout();
			}
		};
		const scheduleMark = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(markDashboard);
		};
		let scrollScheduled = false;
		const applyScroll = () => {
			scrollScheduled = false;
			window.scrollTo(0, requestedScrollY);
			applyDashboardShift();
		};
		addEventListener("message", (event) => {
			if (
				event.source !== parent ||
				event.origin !== ${JSON.stringify(lensAtomsOrigin)}
			) {
				return;
			}
			if (event.data?.type === "attio-dashboard-layout") {
				const titleBottom = Number(event.data.titleBottom);
				const gap = Number(event.data.gap);
				if (Number.isFinite(titleBottom) && Number.isFinite(gap)) {
					layoutTargetTop = titleBottom + gap;
					scheduleDashboardLayout();
				}
				return;
			}
			if (event.data?.type !== "attio-dashboard-scroll") return;
			requestedScrollY = Math.max(0, Number(event.data.scrollY) || 0);
			if (scrollScheduled) return;
			scrollScheduled = true;
			requestAnimationFrame(applyScroll);
		});
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
				parent.postMessage(
					{
						type: "attio-dashboard-scroll-request",
						deltaY: event.deltaY * multiplier,
					},
					${JSON.stringify(lensAtomsOrigin)},
				);
			},
			{ capture: true, passive: false },
		);
		new MutationObserver(scheduleMark).observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		addEventListener("resize", scheduleDashboardLayout);
		if (document.readyState === "loading") {
			addEventListener("DOMContentLoaded", scheduleMark, { once: true });
		} else {
			scheduleMark();
		}
	})();
</script>`;

const composeAttioDashboardSourceHtml = (html) =>
	html
		.replace(
			/<title>[\s\S]*?<\/title>/i,
			"<title>Attio dashboard source · Opaline</title>",
		)
		.replace(
			/<\/head>/i,
			`${attioDashboardSourceStyle}${attioDashboardSourceScript}</head>`,
		);

const lensAttioStyle = `<style data-lens-attio-composition>
	html,
	body {
		--site-header-height: 116px !important;
		background: rgb(255, 255, 255) !important;
	}

	body {
		overflow-x: hidden;
	}

	#lens-attio-canvas-source {
		--lens-attio-clip-bottom: 0px;
		position: fixed;
		z-index: 0;
		inset: 0;
		display: block;
		width: 100%;
		height: 100svh;
		border: 0;
		background: rgb(255, 255, 255);
		clip-path: inset(0 0 var(--lens-attio-clip-bottom) 0);
		pointer-events: none;
		will-change: clip-path;
	}

	#lens-attio-navbar-source {
		position: fixed;
		z-index: 30;
		top: 0;
		left: 0;
		display: block;
		width: 100%;
		height: 73px;
		border: 0;
		background: transparent;
	}

	body > .flex.min-h-screen.max-w-screen {
		position: relative;
		z-index: 1;
		min-height: 0 !important;
		background: transparent !important;
	}

	body > .flex.min-h-screen.max-w-screen > .sticky:first-child {
		height: var(--site-header-height) !important;
		min-height: var(--site-header-height) !important;
		visibility: hidden !important;
		pointer-events: none !important;
	}

	main > section:first-of-type {
		position: relative;
		z-index: 1;
		margin-top: 0 !important;
		border-color: transparent !important;
		background: transparent !important;
	}

	main > section:first-of-type [data-lens-attio-background] {
		visibility: hidden !important;
		pointer-events: none !important;
	}

	main > section:first-of-type [data-lens-attio-title-slot] {
		overflow: visible !important;
	}

	main > section:first-of-type
		[data-lens-attio-title-slot]
		> :not(#lens-attio-title-source) {
		visibility: hidden !important;
		pointer-events: none !important;
	}

	#lens-attio-title-source {
		position: absolute;
		z-index: 1;
		top: calc(50% - 108px);
		left: 0;
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
	}

	main > section:first-of-type [data-opaline-claude-window] {
		background: rgb(20, 20, 20) !important;
	}

	main > section:first-of-type
		[data-opaline-claude-window]
		> :not([data-opaline-claude-code]) {
		visibility: hidden !important;
	}

	main > section:first-of-type [data-opaline-claude-code] {
		position: absolute;
		z-index: 20;
		inset: 0;
		overflow: hidden;
		padding: 0 3px 3px;
		border-radius: inherit;
		background: rgb(20, 20, 20);
		pointer-events: none;
	}

	main > section:first-of-type [data-opaline-claude-code],
	main > section:first-of-type [data-opaline-claude-code] * {
		visibility: visible !important;
	}

	main > section:not(:first-of-type),
	footer {
		position: relative;
		z-index: 2;
	}

	html:has(#feedback-cursor-styles) #lens-attio-navbar-source,
	html:has(#feedback-cursor-styles) #lens-attio-title-source {
		pointer-events: none;
	}

	@media (max-width: 767px) {
		html,
		body {
			--site-header-height: 100px !important;
		}

		#lens-attio-title-source {
			top: calc(50% - 112px);
		}
	}

	@media (min-width: 1024px) {
		main > section:first-of-type [data-opaline-claude-code] {
			padding: 0 6px 6px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		#lens-attio-canvas-source {
			will-change: auto;
		}
	}
</style>`;

const lensAttioFrame = `<iframe
		id="lens-attio-canvas-source"
		src="${lensAtomsCanvasSource}"
		title="Opaline animated canvas"
		fetchpriority="high"
	></iframe>
	<iframe
		id="lens-attio-navbar-source"
		src="${linearNavbarSource}"
		title="Opaline navigation"
	></iframe>`;

const lensAttioTitleFrame = `<iframe
		id="lens-attio-title-source"
		src="${interfereTitleSource}"
		title="More time building, less time fixing"
	></iframe>`;

const lensAttioLensTitleFrame = `<iframe
		id="lens-attio-title-source"
		src="${agentSessionsTitleSource}"
		title="Pull back the curtain on your agent sessions."
	></iframe>`;

const lensAttioScript = `<script data-lens-attio-composition>
	(() => {
		const frameMarkup = ${JSON.stringify(lensAttioFrame)};
		const titleMarkup =
			new URLSearchParams(location.search).get("opaline-composition") ===
			"lens-attio-lens"
				? ${JSON.stringify(lensAttioLensTitleFrame)}
				: ${JSON.stringify(lensAttioTitleFrame)};
		let canvas = null;
		let navbar = null;
		let title = null;
		let hero = null;
		let scheduled = false;
		const render = () => {
			scheduled = false;
			if (!canvas?.isConnected || !navbar?.isConnected || !hero?.isConnected) {
				scheduleEnsure();
				return;
			}
			const heroBottom = hero.getBoundingClientRect().bottom;
			const visibleHeight = Math.min(innerHeight, Math.max(0, heroBottom));
			const clipBottom = Math.max(0, innerHeight - visibleHeight) + "px";
			canvas.style.setProperty("--lens-attio-clip-bottom", clipBottom);
			canvas.dataset.heroVisible = String(heroBottom > 0);
			if (title) title.style.pointerEvents = scrollY < 80 ? "auto" : "none";
		};
		const scheduleRender = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(render);
		};
		const installClaudeCodeWindows = (dashboard) => {
			if (!(dashboard instanceof HTMLElement)) return;
			const terminal = dashboard.querySelector(
				'[data-home-hero="desktop-window"][data-home-hero-app="terminal"]',
			);
			if (!(terminal instanceof HTMLElement)) return;
			const replacements = dashboard.querySelectorAll(
				'[data-home-hero="desktop-window"]:not([data-home-hero-app="terminal"])',
			);
			for (const target of replacements) {
				if (!(target instanceof HTMLElement)) continue;
				target.dataset.opalineClaudeWindow = "";
				target.classList.remove(
					"bg-white-300/80",
					"group-data-hero-scrolling/hero:bg-white-300",
				);
				target.classList.add(
					"dark",
					"bg-black-0/80",
					"group-data-hero-scrolling/hero:bg-black-0",
				);
				if (target.querySelector(":scope > [data-opaline-claude-code]")) {
					continue;
				}
				const overlay = document.createElement("div");
				overlay.dataset.opalineClaudeCode = "";
				overlay.setAttribute("aria-hidden", "true");
				overlay.setAttribute("inert", "");
				for (const child of terminal.children) {
					const clone = child.cloneNode(true);
					if (clone instanceof HTMLElement) {
						clone.removeAttribute("id");
						for (const element of clone.querySelectorAll("[id]")) {
							element.removeAttribute("id");
						}
					}
					overlay.append(clone);
				}
				target.append(overlay);
			}
		};
		let ensureScheduled = false;
		const ensure = () => {
			ensureScheduled = false;
			if (!document.body) return;
			canvas = document.getElementById("lens-attio-canvas-source");
			navbar = document.getElementById("lens-attio-navbar-source");
			if (
				!(canvas instanceof HTMLIFrameElement) ||
				!(navbar instanceof HTMLIFrameElement)
			) {
				document
					.querySelectorAll(
						"#lens-attio-canvas-source, #lens-attio-navbar-source",
					)
					.forEach((element) => element.remove());
				document.body.insertAdjacentHTML("afterbegin", frameMarkup);
				canvas = document.getElementById("lens-attio-canvas-source");
				navbar = document.getElementById("lens-attio-navbar-source");
			}
			hero = document.querySelector("main > section:first-of-type");
			if (
				!(canvas instanceof HTMLIFrameElement) ||
				!(navbar instanceof HTMLIFrameElement) ||
				!(hero instanceof HTMLElement)
			) {
				return;
			}
			const desktopRoot = hero.children[0]?.firstElementChild;
			const desktopBackground = desktopRoot?.children[0];
			const desktopContent = desktopRoot?.children[1];
			const desktopTitle = desktopContent?.children[0];
			const desktopDashboard = desktopContent?.children[1];
			const mobileLayer =
				hero.children[1]?.firstElementChild?.firstElementChild
					?.firstElementChild;
			const mobileBackground = mobileLayer?.children[0];
			const mobilePattern = mobileLayer?.children[1];
			const mobileTitle = mobileLayer?.children[2];
			for (const background of [
				desktopBackground,
				mobileBackground,
				mobilePattern,
			]) {
				if (background instanceof HTMLElement) {
					background.dataset.lensAttioBackground = "";
				}
			}
			for (const slot of [desktopTitle, mobileTitle]) {
				if (slot instanceof HTMLElement) slot.dataset.lensAttioTitleSlot = "";
			}
			installClaudeCodeWindows(desktopDashboard);
			const activeTitle = matchMedia("(min-width: 768px)").matches
				? desktopTitle
				: mobileTitle;
			if (!(activeTitle instanceof HTMLElement)) return;
			title = document.getElementById("lens-attio-title-source");
			if (!(title instanceof HTMLIFrameElement)) {
				activeTitle.insertAdjacentHTML("beforeend", titleMarkup);
				title = document.getElementById("lens-attio-title-source");
			} else if (title.parentElement !== activeTitle) {
				activeTitle.append(title);
			}
			document.title = "Lens × Attio · Opaline";
			scheduleRender();
		};
		const scheduleEnsure = () => {
			if (ensureScheduled) return;
			ensureScheduled = true;
			requestAnimationFrame(ensure);
		};

		addEventListener("scroll", scheduleRender, { passive: true });
		addEventListener("resize", () => {
			scheduleEnsure();
			scheduleRender();
		});
		addEventListener("message", (event) => {
			if (
				event.source === title?.contentWindow &&
				event.origin === ${JSON.stringify(lensAtomsOrigin)} &&
				event.data?.type === "interfere-title-scroll"
			) {
				window.scrollBy(0, Number(event.data.deltaY) || 0);
				return;
			}
			if (
				event.source !== navbar?.contentWindow ||
				event.origin !== ${JSON.stringify(linearNavbarOrigin)}
			) {
				return;
			}
			if (event.data?.type === "linear-navbar-scroll") {
				window.scrollBy(0, Number(event.data.deltaY) || 0);
				return;
			}
			if (event.data?.type !== "linear-navbar-frame") return;
			const height = event.data.fullscreen
				? innerHeight
				: Math.min(innerHeight, Math.max(73, Number(event.data.height) || 73));
			navbar.style.height = height + "px";
		});
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

const lensAttioLensStyle = `<style data-lens-attio-lens-composition>
	main > section:first-of-type ~ *,
	footer {
		display: none !important;
	}

	#lens-attio-lens-content-stage {
		position: relative;
		z-index: 2;
		width: 100%;
		height: var(--lens-content-height, 4200px);
		background: rgb(255, 255, 255);
	}

	#lens-attio-lens-content-source {
		position: sticky;
		top: 73px;
		display: block;
		width: 100%;
		height: calc(100svh - 73px);
		border: 0;
		background: rgb(255, 255, 255);
	}

	main > section:first-of-type [data-home-hero="attio-window"] {
		will-change: transform, scale !important;
	}

	[data-opaline-use-case-strip] {
		position: absolute;
		z-index: 25;
		bottom: calc(100% + 14px);
		left: 50%;
		display: flex;
		align-items: center;
		gap: 4px;
		width: max-content;
		max-width: min(720px, calc(100vw - 32px));
		padding: 4px;
		translate: -50% 0;
		border: 1px solid rgba(17, 18, 20, 0.08);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.88);
		box-shadow:
			0 1px 2px rgba(17, 18, 20, 0.04),
			0 8px 24px rgba(17, 18, 20, 0.06);
		backdrop-filter: blur(16px);
		pointer-events: auto;
	}

	[data-opaline-use-case-label] {
		padding: 0 8px 0 10px;
		color: rgba(17, 18, 20, 0.46);
		font-size: 12px;
		font-weight: 500;
		line-height: 32px;
		white-space: nowrap;
	}

	[data-opaline-use-case-divider] {
		width: 1px;
		height: 16px;
		margin-right: 2px;
		background: rgba(17, 18, 20, 0.1);
	}

	[data-opaline-use-case-tabs] {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	[data-opaline-use-case] {
		height: 32px;
		padding: 0 11px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: rgba(17, 18, 20, 0.58);
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		line-height: 32px;
		white-space: nowrap;
		cursor: pointer;
	}

	[data-opaline-use-case]:hover {
		background: rgba(17, 18, 20, 0.05);
		color: rgb(17, 18, 20);
	}

	[data-opaline-use-case][aria-selected="true"] {
		background: rgb(24, 25, 27);
		color: rgb(255, 255, 255);
	}

	[data-opaline-use-case]:focus-visible {
		outline: 2px solid rgb(59, 130, 246);
		outline-offset: 2px;
	}

	main > section:first-of-type [data-lens-attio-title-slot] {
		filter: none !important;
		opacity: 1 !important;
	}

	#lens-attio-title-source {
		opacity: var(--lens-attio-atoms-title-opacity, 1);
		scale: var(--lens-attio-atoms-title-scale, 1);
		transform-origin: center !important;
		will-change: opacity, scale;
	}

	@media (max-width: 767px) {
		[data-opaline-use-case-strip] {
			bottom: calc(100% + 10px);
			max-width: calc(100vw - 24px);
			overflow-x: auto;
			border-radius: 14px;
			scrollbar-width: none;
		}

		[data-opaline-use-case-strip]::-webkit-scrollbar {
			display: none;
		}

		[data-opaline-use-case-label],
		[data-opaline-use-case-divider] {
			display: none;
		}

		[data-opaline-use-case] {
			height: 36px;
			padding: 0 12px;
			font-size: 13px;
			line-height: 36px;
		}
	}
</style>`;

const lensAttioLensFrame = `<div id="lens-attio-lens-content-stage">
	<iframe
		id="lens-attio-lens-content-source"
		src="${lensContentSource}"
		title="Lens website content"
		loading="eager"
	></iframe>
</div>`;

const lensAttioLensScript = `<script data-lens-attio-lens-composition>
	(() => {
		let mainWindow = null;
		let observedMainWindow = null;
		let titleFrame = null;
		let titleSlot = null;
		let content = null;
		let scaleFrame = 0;
		let contentScheduled = false;
		let contentScrollScheduled = false;
		let contentHeight = 4200;
		const useCaseScenes = [
			{ id: "Ask Attio", label: "Ask Attio" },
			{ id: "Data model", label: "Data" },
			{ id: "Workflows", label: "Workflows" },
			{ id: "Reporting", label: "Reporting" },
		];
		window.__opalineAttioScene ||= useCaseScenes[0].id;
		const scaleObserver = new MutationObserver(() => applyMainWindowScale());
		const updateUseCaseStrip = (strip) => {
			if (!(strip instanceof HTMLElement)) return;
			for (const button of strip.querySelectorAll("[data-opaline-use-case]")) {
				const selected =
					button.getAttribute("data-opaline-use-case") ===
					window.__opalineAttioScene;
				button.setAttribute("aria-selected", String(selected));
				button.tabIndex = selected ? 0 : -1;
			}
		};
		const selectUseCase = (sceneId, { focus = false } = {}) => {
			if (!useCaseScenes.some((scene) => scene.id === sceneId)) return;
			window.__opalineAttioScene = sceneId;
			window.dispatchEvent(
				new CustomEvent("opaline-attio-scene", { detail: sceneId }),
			);
			const strip = document.querySelector("[data-opaline-use-case-strip]");
			updateUseCaseStrip(strip);
			if (focus && strip instanceof HTMLElement) {
				strip
					.querySelector(
						'[data-opaline-use-case="' + CSS.escape(sceneId) + '"]',
					)
					?.focus();
			}
		};
		const createUseCaseStrip = () => {
			const strip = document.createElement("div");
			strip.dataset.opalineUseCaseStrip = "";
			strip.setAttribute("aria-label", "Dashboard use case");
			const label = document.createElement("span");
			label.dataset.opalineUseCaseLabel = "";
			label.textContent = "Use case";
			const divider = document.createElement("span");
			divider.dataset.opalineUseCaseDivider = "";
			divider.setAttribute("aria-hidden", "true");
			const tabs = document.createElement("div");
			tabs.dataset.opalineUseCaseTabs = "";
			tabs.setAttribute("role", "tablist");
			for (const scene of useCaseScenes) {
				const button = document.createElement("button");
				button.type = "button";
				button.dataset.opalineUseCase = scene.id;
				button.setAttribute("role", "tab");
				button.setAttribute("aria-controls", "opaline-attio-use-case-panel");
				button.textContent = scene.label;
				button.addEventListener("click", () => selectUseCase(scene.id));
				button.addEventListener("keydown", (event) => {
					if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
						return;
					}
					event.preventDefault();
					const currentIndex = useCaseScenes.findIndex(
						(candidate) => candidate.id === window.__opalineAttioScene,
					);
					const nextIndex =
						event.key === "Home"
							? 0
							: event.key === "End"
								? useCaseScenes.length - 1
								: (currentIndex + (event.key === "ArrowRight" ? 1 : -1) +
										useCaseScenes.length) %
									useCaseScenes.length;
					selectUseCase(useCaseScenes[nextIndex].id, { focus: true });
				});
				tabs.append(button);
			}
			strip.append(label, divider, tabs);
			updateUseCaseStrip(strip);
			return strip;
		};
		const ensureUseCaseStrip = () => {
			const shell = document.querySelector(
				'main > section:first-of-type [data-home-hero="attio-window-shell"]',
			);
			if (!(shell instanceof HTMLElement)) return;
			let strip = document.querySelector("[data-opaline-use-case-strip]");
			if (!(strip instanceof HTMLElement)) strip = createUseCaseStrip();
			if (strip.parentElement !== shell) shell.append(strip);
			const panel = shell.querySelector("[data-home-hero-preview-tab]");
			if (panel instanceof HTMLElement) {
				panel.id = "opaline-attio-use-case-panel";
				panel.setAttribute("role", "tabpanel");
			}
			updateUseCaseStrip(strip);
		};
		const syncContentScroll = () => {
			contentScrollScheduled = false;
			if (!(content instanceof HTMLIFrameElement)) return;
			const stage = document.getElementById("lens-attio-lens-content-stage");
			if (!(stage instanceof HTMLElement)) return;
			const offset = Math.min(
				Math.max(0, contentHeight - content.clientHeight),
				Math.max(0, 73 - stage.getBoundingClientRect().top),
			);
			content.contentWindow?.postMessage(
				{ type: "lens-content-progress", offset },
				${JSON.stringify(lensAtomsOrigin)},
			);
		};
		const scheduleContentScroll = () => {
			if (contentScrollScheduled) return;
			contentScrollScheduled = true;
			requestAnimationFrame(syncContentScroll);
		};
		const requestContentMeasure = () => {
			content?.contentWindow?.postMessage(
				{ type: "lens-content-measure" },
				${JSON.stringify(lensAtomsOrigin)},
			);
		};
		const ensureContent = () => {
			contentScheduled = false;
			ensureUseCaseStrip();
			const navbar = document.getElementById("lens-attio-navbar-source");
			if (
				navbar instanceof HTMLIFrameElement &&
				navbar.src !== ${JSON.stringify(linearRudelNavbarSource)}
			) {
				navbar.src = ${JSON.stringify(linearRudelNavbarSource)};
			}
			content = document.getElementById("lens-attio-lens-content-source");
			if (!(content instanceof HTMLIFrameElement)) {
				document.body.insertAdjacentHTML("beforeend", ${JSON.stringify(lensAttioLensFrame)});
				content = document.getElementById("lens-attio-lens-content-source");
			}
			if (
				content instanceof HTMLIFrameElement &&
				content.dataset.lensContentMeasure !== "ready"
			) {
				content.dataset.lensContentMeasure = "ready";
				content.addEventListener("load", requestContentMeasure);
				requestContentMeasure();
			}
			scheduleContentScroll();
		};
		const scheduleContent = () => {
			if (contentScheduled || !document.body) return;
			contentScheduled = true;
			requestAnimationFrame(ensureContent);
		};
		function applyMainWindowScale() {
			if (!(mainWindow instanceof HTMLElement) || !mainWindow.isConnected) {
				mainWindow = document.querySelector(
					'main > section:first-of-type [data-home-hero="attio-window"]',
				);
			}
			if (mainWindow instanceof HTMLElement) {
				if (observedMainWindow !== mainWindow) {
					scaleObserver.disconnect();
					scaleObserver.observe(mainWindow, {
						attributes: true,
						attributeFilter: ["style"],
					});
					observedMainWindow = mainWindow;
				}
				const transform = getComputedStyle(mainWindow).transform;
				let animatedScale = 1;
				if (transform !== "none") {
					const matrix = new DOMMatrixReadOnly(transform);
					animatedScale = Math.hypot(matrix.a, matrix.b) || 1;
				}
				const inverseScale = (1 / animatedScale).toFixed(6);
				if (mainWindow.style.scale !== inverseScale) {
					mainWindow.style.scale = inverseScale;
				}
			}
		}
		function applyTitleScale() {
			if (!(titleFrame instanceof HTMLIFrameElement) || !titleFrame.isConnected) {
				titleFrame = document.getElementById("lens-attio-title-source");
				titleSlot = null;
			}
			if (!(titleFrame instanceof HTMLIFrameElement)) return;
			if (!(titleSlot instanceof HTMLElement) || !titleSlot.isConnected) {
				titleSlot = titleFrame.closest("[data-lens-attio-title-slot]");
			}
			if (!(titleSlot instanceof HTMLElement)) return;
			const progress = Math.min(1, Math.max(0, (scrollY - 20) / 180));
			const opacity = 1 - progress;
			const atomsScale = 0.9 + opacity * 0.1;
			titleFrame.style.setProperty(
				"--lens-attio-atoms-title-opacity",
				opacity.toFixed(6),
			);
			titleFrame.style.setProperty(
				"--lens-attio-atoms-title-scale",
				atomsScale.toFixed(6),
			);
		}
		const lockMainWindowScale = () => {
			applyMainWindowScale();
			applyTitleScale();
			scaleFrame = requestAnimationFrame(lockMainWindowScale);
		};
		const startScaleLock = () => {
			if (scaleFrame !== 0) return;
			scaleFrame = requestAnimationFrame(lockMainWindowScale);
		};
		addEventListener("message", (event) => {
			content = document.getElementById("lens-attio-lens-content-source");
			if (
				!(content instanceof HTMLIFrameElement) ||
				event.source !== content.contentWindow ||
				event.origin !== ${JSON.stringify(lensAtomsOrigin)}
			) {
				return;
			}
			if (event.data?.type === "lens-content-scroll") {
				window.scrollBy(0, Number(event.data.deltaY) || 0);
				return;
			}
			if (event.data?.type !== "lens-content-size") return;
			contentHeight = Math.min(
				20000,
				Math.max(innerHeight, Number(event.data.height) || innerHeight),
			);
			const stage = document.getElementById("lens-attio-lens-content-stage");
			stage?.style.setProperty("--lens-content-height", contentHeight + "px");
			scheduleContentScroll();
		});
		addEventListener("scroll", scheduleContentScroll, { passive: true });
		addEventListener("resize", () => {
			scheduleContentScroll();
			requestContentMeasure();
		});
		addEventListener("pagehide", () => {
			scaleObserver.disconnect();
			cancelAnimationFrame(scaleFrame);
			scaleFrame = 0;
		});
		new MutationObserver(scheduleContent).observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		if (document.readyState === "loading") {
			addEventListener(
				"DOMContentLoaded",
				() => {
					scheduleContent();
					startScaleLock();
				},
				{ once: true },
			);
		} else {
			scheduleContent();
			startScaleLock();
		}
	})();
</script>`;

const composeLensAttioHtml = (html, { lensContent = false } = {}) => {
	const withSceneControl = lensContent
		? html.replace(
				/(\/_next\/static\/chunks\/0nbkc_oe2sf1x\.js\?dpl=dpl_[A-Za-z0-9_-]+)(?!&opaline-scene-control=1)/g,
				"$1&opaline-scene-control=1",
			)
		: html;
	const withTitle = withSceneControl.replace(
		/<title>[\s\S]*?<\/title>/i,
		"<title>Lens × Attio · Opaline</title>",
	);
	const withStyle = withTitle.replace(
		/<\/head>/i,
		`${lensAttioStyle}${lensContent ? lensAttioLensStyle : ""}${lensAttioScript}${lensContent ? lensAttioLensScript : ""}</head>`,
	);
	const withFrame = withStyle.replace(
		/<body([^>]*)>/i,
		(_body, attributes) => `<body${attributes}>${lensAttioFrame}`,
	);
	return withFrame;
};

const createLensAttioRouteHtml = ({ composition, title }) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<meta name="theme-color" content="#ffffff">
		<title>${title}</title>
		<style>
			html,
			body,
			iframe {
				width: 100%;
				height: 100%;
				margin: 0;
				border: 0;
			}
			html,
			body {
				overflow: hidden;
				background: #fff;
			}
			iframe {
				display: block;
				height: 100svh;
			}
		</style>
	</head>
	<body>
		<iframe
			src="/?opaline-composition=${composition}"
			title="Lens and Attio composition"
		></iframe>
	</body>
</html>`;

const lensAttioRouteHtml = createLensAttioRouteHtml({
	composition: "lens-attio",
	title: "Lens × Attio · Opaline",
});

const lensAttioLensRouteHtml = createLensAttioRouteHtml({
	composition: "lens-attio-lens",
	title: "Lens × Attio × Lens · Opaline",
});

const readCaptureBody = async (request) => {
	const declaredLength = Number.parseInt(
		request.headers["content-length"] || "0",
		10,
	);
	if (declaredLength > maximumCaptureBytes) {
		throw new Error("Capture exceeds 24 MiB.");
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
	return Buffer.concat(chunks);
};

const writeCapture = async (request, response) => {
	const body = await readCaptureBody(request);
	const preview = body.subarray(0, 64 * 1024).toString("utf8");
	if (
		!/<html[\s>]/i.test(preview) ||
		!preview.includes("Attio") ||
		!preview.includes("/_next/static/")
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
		JSON.stringify({ ok: true, path: capturePath, bytes: body.byteLength }),
	);
	console.log(`Saved capture to ${capturePath}`);
};

const serveCapture = async (request, response) => {
	response.writeHead(200, captureHeaders);
	if (request.method === "HEAD") {
		response.end();
		return;
	}
	const html = await readFile(capturePath, "utf8");
	response.end(injectAgentation(stabilizeCapture(html), "attio-com"));
};

const serveLensAttioComposition = async (
	request,
	response,
	{ lensContent = false } = {},
) => {
	response.writeHead(200, lensAttioCaptureHeaders);
	if (request.method === "HEAD") {
		response.end();
		return;
	}
	const html = await readFile(capturePath, "utf8");
	response.end(
		injectAgentation(
			composeLensAttioHtml(stabilizeCapture(html), { lensContent }),
			"attio-com",
		),
	);
};

const serveAttioDashboardSource = async (request, response) => {
	response.writeHead(200, captureHeaders);
	if (request.method === "HEAD") {
		response.end();
		return;
	}
	const html = await readFile(capturePath, "utf8");
	response.end(composeAttioDashboardSourceHtml(stabilizeCapture(html)));
};

const serveLensAttioRoute = (request, response, html = lensAttioRouteHtml) => {
	response.writeHead(200, lensAttioRouteHeaders);
	response.end(request.method === "HEAD" ? undefined : html);
};

const proxyAttioGet = async (request, response, requestUrl) => {
	const upstreamUrl = new URL(
		`${requestUrl.pathname}${requestUrl.search}`,
		attioOrigin,
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
	const controlsAttioHero =
		requestUrl.pathname === attioHeroChunkPath &&
		requestUrl.searchParams.get("opaline-scene-control") === "1";
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
		const redirected = new URL(location, attioOrigin);
		responseHeaders.location =
			redirected.origin === attioOrigin
				? `${requestUrl.origin}${redirected.pathname}${redirected.search}${redirected.hash}`
				: redirected.href;
	}
	if (controlsAttioHero) {
		delete responseHeaders["accept-ranges"];
		delete responseHeaders["content-range"];
		delete responseHeaders.etag;
		delete responseHeaders["last-modified"];
		responseHeaders["cache-control"] = "no-store";
	}

	response.writeHead(upstream.status, responseHeaders);
	if (request.method === "HEAD" || !upstream.body) {
		response.end();
		return;
	}
	if (controlsAttioHero) {
		response.end(patchAttioHeroChunk(await upstream.text()));
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
			site: "attio-com",
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
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		lensAttioLensRoutes.has(requestUrl.pathname)
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-attio-page.js on https://attio.com/.\n`,
			);
			return;
		}
		serveLensAttioRoute(request, response, lensAttioLensRouteHtml);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		lensAttioRoutes.has(requestUrl.pathname)
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-attio-page.js on https://attio.com/.\n`,
			);
			return;
		}
		serveLensAttioRoute(request, response);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		requestUrl.pathname === "/" &&
		requestUrl.searchParams.get("opaline-source") === "attio-dashboard"
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-attio-page.js on https://attio.com/.\n`,
			);
			return;
		}
		await serveAttioDashboardSource(request, response);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		requestUrl.pathname === "/" &&
		["lens-attio", "lens-attio-lens"].includes(
			requestUrl.searchParams.get("opaline-composition"),
		)
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-attio-page.js on https://attio.com/.\n`,
			);
			return;
		}
		await serveLensAttioComposition(request, response, {
			lensContent:
				requestUrl.searchParams.get("opaline-composition") ===
				"lens-attio-lens",
		});
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		["/", "/index.html"].includes(requestUrl.pathname)
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-attio-page.js on https://attio.com/.\n`,
			);
			return;
		}
		await serveCapture(request, response);
		return;
	}

	if (["GET", "HEAD"].includes(request.method || "")) {
		try {
			await proxyAttioGet(request, response, requestUrl);
		} catch (error) {
			response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Attio asset proxy failed: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
		return;
	}

	response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
	response.end("Only the local capture endpoint accepts writes.\n");
}).listen(port, "127.0.0.1", () => {
	console.log(`Attio reference: http://127.0.0.1:${port}/`);
	console.log(`Lens × Attio: http://127.0.0.1:${port}/lens-attio`);
	console.log(
		`Lens × Attio with Lens content: http://127.0.0.1:${port}/lens-attio-lens`,
	);
	console.log(`Captures save directly to ${capturePath}`);
	console.log(
		"Public Attio assets are proxied read-only; press Ctrl+C to stop.",
	);
});
