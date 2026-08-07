import { existsSync, statSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
	handleAgentationRequest,
	injectAgentation,
	serveCaptureWithAgentation,
} from "../_agentation/server.mjs";

const rootUrl = new URL(".", import.meta.url);
const port = Number.parseInt(
	process.env.OPALINE_LENS_REFERENCE_PORT || "4175",
	10,
);
const defaultFile = "lens-build.capture.html";
const capturePath = fileURLToPath(new URL(defaultFile, rootUrl));
const temporaryCapturePath = fileURLToPath(
	new URL(`${defaultFile}.tmp`, rootUrl),
);
const atomsCapturePath = fileURLToPath(
	new URL("../atoms-co/atoms-home.capture.html", rootUrl),
);
const interfereCapturePath = fileURLToPath(
	new URL("../interfere-com/interfere-engineers.capture.html", rootUrl),
);
const maximumCaptureBytes = 16 * 1024 * 1024;
const lensOrigin = "https://lens.xyz";

const corsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
	"access-control-allow-private-network": "true",
};

const opalineRevealRoutes = new Set([
	"/build/opaline-aperture",
	"/build/opaline-aperture/",
]);

const lensAtomsRoutes = new Set(["/build/lens-atoms", "/build/lens-atoms/"]);
const interfereTitleSourceRoute = "/__lens-atoms/interfere-title";
const lensAtomsHeroSourceRoute = "/__lens-atoms/hero";
const lensContentSourceRoute = "/__lens-atoms/content";
const attioDashboardOrigin = "http://127.0.0.1:4180";
const attioDashboardSource = `${attioDashboardOrigin}/?opaline-source=attio-dashboard`;

const interfereTitleSourceStyle = `<style data-interfere-title-isolation>
	:root,
	body {
		background: transparent !important;
	}

	html,
	body {
		width: 100% !important;
		height: 100% !important;
		min-height: 0 !important;
		margin: 0 !important;
		overflow: hidden !important;
	}

	body {
		opacity: 0 !important;
	}

	html[data-interfere-title-ready] body {
		opacity: 1 !important;
	}

	body > :not([data-interfere-title-source]) {
		display: none !important;
	}

	[data-interfere-title-source] {
		position: fixed !important;
		z-index: 1 !important;
		top: 50% !important;
		left: 50% !important;
		align-items: center !important;
		width: min(658.5px, calc(100vw - 32px)) !important;
		height: auto !important;
		min-height: 0 !important;
		aspect-ratio: 1 / 1 !important;
		margin: 0 !important;
		opacity: var(--atoms-hero-scroll-opacity, 1) !important;
		text-align: center !important;
		transform: translate(-50%, -50%)
			scale(var(--atoms-hero-scroll-scale, 1)) !important;
		transform-origin: center !important;
		will-change: transform, opacity;
	}

	[data-interfere-agent-sessions-heading] {
		width: min(620px, calc(100vw - 32px)) !important;
	}
</style>`;

const interfereLightThemeScript = `<script data-interfere-title-theme>
	try {
		localStorage.setItem("interfere-theme", "light");
	} catch {}
</script>`;

const interfereTitleSourceScript = `<script data-interfere-title-isolation>
	(() => {
		const directTitle = document.body.firstElementChild;
		const title = directTitle?.querySelector(":scope > h1[data-heading]")
			? directTitle
			: Array.from(
					document.querySelectorAll(
						".relative > .mx-auto > .relative > .relative",
					),
				).find((candidate) =>
					candidate.querySelector(":scope > h1[data-heading]"),
				);
		if (!(title instanceof HTMLElement)) return;
		const heading = title.querySelector(":scope > h1[data-heading]");
		if (!(heading instanceof HTMLHeadingElement)) return;
		if (
			new URLSearchParams(location.search).get("opaline-copy") ===
			"agent-sessions"
		) {
			heading.dataset.interfereAgentSessionsHeading = "";
			heading.replaceChildren(
				document.createTextNode("Pull back the curtain"),
				document.createElement("br"),
				document.createTextNode("on your agent sessions."),
			);
		}
		const eyebrow = title.firstElementChild;
		if (eyebrow && eyebrow !== heading) eyebrow.remove();

		document.documentElement.classList.remove("dark");
		document.documentElement.classList.add("light");
		document.documentElement.style.colorScheme = "light";
		title.dataset.interfereTitleSource = "";
		document.body.append(title);
		for (const child of Array.from(document.body.children)) {
			if (child !== title) child.remove();
		}
		Promise.resolve(document.fonts.ready).then(() => {
			document.documentElement.dataset.interfereTitleReady = "";
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
						type: "interfere-title-scroll",
						deltaY: event.deltaY * multiplier,
					},
					"*",
				);
			},
			{ capture: true, passive: false },
		);
	})();
</script>`;

const extractInterfereTitleElement = (html) => {
	const marker = 'data-interfere-capture-id="204"';
	const markerIndex = html.indexOf(marker);
	if (markerIndex === -1) {
		throw new Error("The Interfere title capture node is missing.");
	}
	const startIndex = html.lastIndexOf("<", markerIndex);
	const openingTag = /^<([a-z][\w:-]*)\b/i.exec(html.slice(startIndex));
	if (!openingTag) {
		throw new Error("The Interfere title opening tag is invalid.");
	}
	const tagName = openingTag[1];
	const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
	tagPattern.lastIndex = startIndex;
	let depth = 0;
	for (
		let match = tagPattern.exec(html);
		match;
		match = tagPattern.exec(html)
	) {
		const tag = match[0];
		if (tag.startsWith("</")) {
			depth -= 1;
		} else if (!/\/\s*>$/.test(tag)) {
			depth += 1;
		}
		if (depth === 0) return html.slice(startIndex, tagPattern.lastIndex);
	}
	throw new Error("The Interfere title closing tag is missing.");
};

const findInterfereCaptureTag = (html, pattern, label) => {
	const tag = html.match(pattern)?.[0];
	if (!tag) throw new Error(`The Interfere ${label} is missing.`);
	return tag;
};

const composeInterfereTitleSourceHtml = (html) => {
	const htmlTag = findInterfereCaptureTag(html, /<html\b[^>]*>/i, "HTML tag");
	const bodyTag = findInterfereCaptureTag(html, /<body\b[^>]*>/i, "body tag");
	const stylesheet = findInterfereCaptureTag(
		html,
		/<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\/globals-[^>]*\.css)[^>]*>/i,
		"global stylesheet",
	);
	const fontPreload = findInterfereCaptureTag(
		html,
		/<link\b(?=[^>]*\bas="font")(?=[^>]*\/InterVariable-[^>]*\.woff2)[^>]*>/i,
		"InterVariable preload",
	);
	const title = extractInterfereTitleElement(html);
	return `<!doctype html>${htmlTag}<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	${interfereLightThemeScript}
	${fontPreload}
	${stylesheet}
	${interfereTitleSourceStyle}
</head>${bodyTag}${title}${interfereTitleSourceScript}</body></html>`;
};

const lensAtomsStyle = `<style data-lens-atoms-composition>
	:root {
		--lens-surface: rgb(255, 255, 255);
		--lens-ink: color(display-p3 0.172549 0.176471 0.188235);
		--lens-ink-60: color(display-p3 0.172549 0.176471 0.188235 / 0.6);
		--lens-ink-40: rgba(55, 55, 55, 0.4);
		--lens-ink-30: color(display-p3 0.172549 0.176471 0.188235 / 0.3);
		--lens-ink-15: color(display-p3 0.172549 0.176471 0.188235 / 0.15);
		--interfere-title-size: min(658.5px, calc(100vw - 32px));
		background: var(--lens-surface);
	}

	body {
		--token-17ee1a2a-9134-45a3-a181-c959a2b2e2db: var(--lens-surface) !important;
		--token-78e420a8-7537-4a7a-9a10-5ea9e3c3a585: var(--lens-surface) !important;
		--token-92cd4611-0dcf-4144-8309-fc016f633972: var(--lens-ink) !important;
		--token-3195062b-fb09-43ae-88df-550bf158cc6e: var(--lens-ink) !important;
		--token-6fcba8bf-916b-4394-b4fe-3851ded5b5de: var(--lens-ink) !important;
		--token-16c898f5-811c-476f-a9e4-a9026be8182f: var(--lens-ink-60) !important;
		--token-bcee320f-7b8e-4850-b8fa-4e8aaec72d1e: var(--lens-ink-40) !important;
		--token-a4938314-8fef-4ed3-bf30-2c0c11958821: var(--lens-ink-15) !important;
		--token-7163beac-517c-48fb-a002-aa615cd5c132: var(--lens-ink-30) !important;
		--token-e09111c7-a01a-43e4-a1ea-a7a5d1636154: var(--lens-ink-15) !important;
		--token-3572ca36-cb96-4f38-b739-abc555b54bbe: var(--lens-ink-40) !important;
		--token-2c18a47d-be90-488e-9c22-53881d1f0c60: var(--lens-ink-60) !important;
		--token-080eaa8c-cdf0-4da1-b42d-e59c1edb208f: var(--lens-ink-60) !important;
		--token-7dcbe761-e0db-42de-a771-c876e00b0eaa: var(--lens-ink-60) !important;
		--token-5b62bdca-4887-4c07-9d58-72e078168e7e: var(--lens-ink-60) !important;
		--token-e46785f9-8389-488d-9a2a-28799122c3ac: var(--lens-ink-60) !important;
		--token-d7a42662-7531-427a-b53d-f6671746ba39: var(--lens-ink-60) !important;
		--token-249f53f9-21f7-48c2-8926-3adf217a0b83: var(--lens-ink-60) !important;
		--token-2c304521-04c0-4228-bbd8-baf31d2576ae: var(--lens-ink-60) !important;
		--token-3bce333a-0415-48dc-972b-13191cd937be: var(--lens-ink-60) !important;
		--token-63127556-6c81-4cf3-9782-f3f525ef497d: var(--lens-ink-60) !important;
	}

	html,
	body,
	#main,
	#main > div:not(#overlay),
	main[data-framer-name="main"] {
		background-color: transparent !important;
	}

	body {
		overflow-x: hidden;
	}

	#main > div:not(#overlay) {
		position: relative;
		z-index: 1;
		pointer-events: none;
	}

	#lens-canvas-source {
		position: fixed;
		z-index: 0;
		inset: 0;
		display: block;
		width: 100%;
		height: 100svh;
		border: 0;
		background: var(--lens-surface);
	}

	#lens-agentation-source {
		position: fixed;
		z-index: 0;
		inset: 0;
		pointer-events: none;
	}

	#interfere-title-source,
	#interfere-title-agentation-source {
		position: fixed;
		z-index: 1;
		inset: 0;
		display: block;
		width: 100%;
		height: 100svh;
		border: 0;
		clip-path: inset(
			max(0px, calc((100svh - var(--interfere-title-size)) / 2))
			max(0px, calc((100vw - var(--interfere-title-size)) / 2))
		);
	}

	#interfere-title-source {
		background: transparent;
		pointer-events: auto;
	}

	#interfere-title-agentation-source {
		pointer-events: none;
	}

	#linear-navbar-source {
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

	#linear-navbar-agentation-source {
		position: fixed;
		z-index: 31;
		top: 0;
		left: 0;
		width: 100%;
		height: 73px;
		pointer-events: none;
	}

	html:has(#feedback-cursor-styles) #lens-canvas-source,
	html:has(#feedback-cursor-styles) #interfere-title-source,
	html:has(#feedback-cursor-styles) #linear-navbar-source {
		pointer-events: none;
	}

	html:has(#feedback-cursor-styles) #lens-agentation-source,
	html:has(#feedback-cursor-styles) #interfere-title-agentation-source,
	html:has(#feedback-cursor-styles) #linear-navbar-agentation-source {
		pointer-events: auto;
	}

	main[data-framer-name="main"] {
		pointer-events: none;
	}

	[data-framer-name="hero-section"] {
		visibility: hidden !important;
		pointer-events: none !important;
	}

	nav,
	[data-framer-root] > div:has(+ main[data-framer-name="main"]) {
		visibility: hidden !important;
		pointer-events: none !important;
	}

	[data-framer-name="companies-section"],
	footer {
		width: calc(100% - 160px) !important;
		max-width: 1200px !important;
		margin-inline: auto !important;
		pointer-events: auto;
	}

	[data-framer-name="companies-section"] {
		align-self: center;
		background: linear-gradient(
			rgba(255, 255, 255, 0) 0%,
			var(--lens-surface) 25%
		) !important;
	}

	footer {
		position: relative;
		z-index: 2;
		background: var(--lens-surface) !important;
	}

	:is([data-framer-name="companies-section"], footer)
		[data-framer-component-type="RichTextContainer"],
	:is([data-framer-name="companies-section"], footer)
		[data-framer-component-type="RichTextContainer"] * {
		color: var(--lens-ink) !important;
		border-color: currentColor;
	}

	:is([data-framer-name="companies-section"], footer)
		[data-framer-component-type="SVG"],
	:is([data-framer-name="companies-section"], footer)
		[data-framer-component-type="SVG"] * {
		color: var(--lens-ink) !important;
		fill: var(--lens-ink) !important;
	}

	@media (max-width: 1199.98px) {
		[data-framer-name="companies-section"],
		footer {
			width: calc(100% - 80px) !important;
		}
	}

	@media (max-width: 809.98px) {
		[data-framer-name="companies-section"],
		footer {
			width: calc(100% - 32px) !important;
		}

		[data-framer-name="companies-section"] {
			background: linear-gradient(
				rgba(255, 255, 255, 0) 0%,
				var(--lens-surface) 7%
			) !important;
		}
	}
</style>`;

const lensAtomsFrame = `<iframe
		id="lens-canvas-source"
		src="/build?opaline-source=lens-canvas"
		title="Lens Build hero and WebGL canvas"
		fetchpriority="high"
	></iframe>
	<div
		id="lens-agentation-source"
		data-element="Lens Build hero and WebGL canvas"
		aria-label="Lens Build hero and WebGL canvas"
	></div>
	<iframe
		id="interfere-title-source"
		src="${interfereTitleSourceRoute}"
		title="Interfere title section"
		fetchpriority="low"
	></iframe>
	<div
		id="interfere-title-agentation-source"
		data-element="Interfere title section"
		aria-label="Interfere title section"
	></div>
	<iframe
		id="linear-navbar-source"
		src="http://127.0.0.1:4176/next?opaline-source=navbar"
		title="Linear navigation"
	></iframe>
	<div
		id="linear-navbar-agentation-source"
		data-element="Linear navigation"
		aria-label="Linear navigation"
	></div>`;

const lensAtomsScript = `<script data-lens-atoms-composition>
		(() => {
			const lensFrame = document.getElementById("lens-canvas-source");
			const interfereTitleFrame = document.getElementById(
				"interfere-title-source",
			);
			const navbarFrame = document.getElementById("linear-navbar-source");
			const lensAgentationSource = document.getElementById(
				"lens-agentation-source",
			);
			const interfereTitleAgentationSource = document.getElementById(
				"interfere-title-agentation-source",
			);
			const navbarAgentationSource = document.getElementById(
				"linear-navbar-agentation-source",
			);
			if (
				!(lensFrame instanceof HTMLIFrameElement) ||
				!(interfereTitleFrame instanceof HTMLIFrameElement) ||
				!(navbarFrame instanceof HTMLIFrameElement) ||
				!(lensAgentationSource instanceof HTMLElement) ||
				!(interfereTitleAgentationSource instanceof HTMLElement) ||
				!(navbarAgentationSource instanceof HTMLElement)
			) {
				return;
			}

			const parentElementFromPoint = document.elementFromPoint.bind(document);
			const parentContains = document.contains.bind(document);
			const feedbackModeIsActive = () =>
				Boolean(document.getElementById("feedback-cursor-styles"));
			const frameElementFromPoint = (frame, x, y) => {
				const sourceDocument = frame.contentDocument;
				if (!sourceDocument || !feedbackModeIsActive()) return null;
				const frameRect = frame.getBoundingClientRect();
				if (frameRect.width === 0 || frameRect.height === 0) return null;
				const documentWidth = sourceDocument.documentElement.clientWidth;
				const documentHeight = sourceDocument.documentElement.clientHeight;
				const localX = ((x - frameRect.left) / frameRect.width) * documentWidth;
				const localY = ((y - frameRect.top) / frameRect.height) * documentHeight;
				return sourceDocument.elementFromPoint(localX, localY);
			};

			document.elementFromPoint = (x, y) => {
				const parentElement = parentElementFromPoint(x, y);
				if (parentElement === lensAgentationSource) {
					return (
						frameElementFromPoint(lensFrame, x, y) || lensAgentationSource
					);
				}
				if (parentElement === interfereTitleAgentationSource) {
					return (
						frameElementFromPoint(interfereTitleFrame, x, y) ||
						interfereTitleAgentationSource
					);
				}
				return parentElement;
			};

			document.contains = (node) => {
				if (parentContains(node)) return true;
				return Boolean(
					feedbackModeIsActive() &&
						(node?.ownerDocument === lensFrame.contentDocument ||
							node?.ownerDocument === interfereTitleFrame.contentDocument),
				);
			};

		const canvasStyle = String.raw\`<style id="lens-canvas-isolation">
			html,
			body {
				width: 100% !important;
				height: 100% !important;
				min-height: 0 !important;
				margin: 0 !important;
				padding: 0 !important;
				overflow: hidden !important;
				overscroll-behavior: none !important;
				background: rgb(255, 255, 255) !important;
			}

			body * {
				visibility: hidden !important;
			}

			[data-lens-canvas-stage] {
				position: fixed !important;
				inset: 0 !important;
				display: block !important;
				width: 100vw !important;
				height: 100vh !important;
				min-width: 0 !important;
				min-height: 0 !important;
				max-width: none !important;
				max-height: none !important;
				margin: 0 !important;
				padding: 0 !important;
				overflow: visible !important;
				transform: none !important;
			}

			[data-lens-canvas-ancestor] {
				overflow: visible !important;
				transform: none !important;
				filter: none !important;
				clip-path: none !important;
				contain: none !important;
			}

			canvas[data-lens-canvas] {
				position: fixed !important;
				inset: 0 !important;
				display: block !important;
				visibility: visible !important;
				width: 100vw !important;
				height: 100vh !important;
				max-width: none !important;
				max-height: none !important;
				margin: 0 !important;
				transform: none !important;
			}

			[data-lens-hero],
			[data-lens-hero] *,
			[data-lens-hero-buttons],
			[data-lens-hero-buttons] * {
				visibility: visible !important;
			}

			[data-lens-hero],
			[data-lens-hero-buttons] {
				opacity: var(--atoms-hero-scroll-opacity, 1) !important;
				scale: var(--atoms-hero-scroll-scale, 1) !important;
				transform-origin:
					var(--lens-atoms-motion-origin-x, 50%)
					var(--lens-atoms-motion-origin-y, 50%) !important;
				will-change: transform, opacity;
			}

			[data-lens-hero] [style*="visibility:hidden"],
			[data-lens-hero] [style*="visibility: hidden"],
			[data-lens-hero] h1 > span[style*="position:absolute"],
			[data-lens-hero] h1 > span[style*="position: absolute"] {
				visibility: hidden !important;
			}

			[data-lens-hero] {
				pointer-events: none !important;
			}

			[data-lens-hero-buttons] {
				pointer-events: auto !important;
			}

			[data-lens-hero],
			[data-lens-hero-buttons] {
				display: none !important;
			}
		</style>\`;

		let observer = null;
		let scheduled = false;
		let motionFrame = 0;
		let motionDocument = null;
		let titleMotionDocument = null;
		let lastMotionSignature = "";

		const forwardScroll = (sourceWindow) => {
			if (sourceWindow.__lensAtomsScrollForwarding) return;
			sourceWindow.__lensAtomsScrollForwarding = true;

			const sendScroll = (deltaY) => {
				if (deltaY === 0) return;
				window.scrollBy(0, deltaY);
			};

			sourceWindow.addEventListener(
				"wheel",
				(event) => {
					const multiplier =
						event.deltaMode === WheelEvent.DOM_DELTA_LINE
							? 16
							: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
								? sourceWindow.innerHeight
								: 1;
					event.preventDefault();
					event.stopImmediatePropagation();
					sendScroll(event.deltaY * multiplier);
				},
				{ capture: true, passive: false },
			);

			let touchY = null;
			sourceWindow.addEventListener("pointerdown", (event) => {
				if (event.pointerType === "touch") touchY = event.clientY;
			});
			sourceWindow.addEventListener(
				"pointermove",
				(event) => {
					if (event.pointerType !== "touch" || touchY === null) return;
					const deltaY = touchY - event.clientY;
					touchY = event.clientY;
					event.preventDefault();
					sendScroll(deltaY);
				},
				{ passive: false },
			);
			const endTouch = () => {
				touchY = null;
			};
			sourceWindow.addEventListener("pointerup", endTouch);
			sourceWindow.addEventListener("pointercancel", endTouch);
		};

		const findAtomsHeroMotionSource = () => {
			const candidates = Array.from(
				document.querySelectorAll(
					'[data-framer-name="hero-section"][name="hero-section"]',
				),
			);
			return candidates.find((candidate) => {
				if (!(candidate instanceof HTMLElement)) return false;
				const rect = candidate.getBoundingClientRect();
				return (
					rect.width > 0 &&
					rect.height > 0 &&
					getComputedStyle(candidate).display !== "none"
				);
			});
		};

		const syncLensMotionOrigins = () => {
			const sourceDocument = lensFrame.contentDocument;
			const sourceWindow = lensFrame.contentWindow;
			if (!sourceDocument || !sourceWindow) return;

			const motionElements = sourceDocument.querySelectorAll(
				"[data-lens-hero], [data-lens-hero-buttons]",
			);
			if (motionElements.length === 0) return;

			const rootStyle = sourceDocument.documentElement.style;
			const activeScale = rootStyle.getPropertyValue(
				"--atoms-hero-scroll-scale",
			);
			rootStyle.setProperty("--atoms-hero-scroll-scale", "1");

			for (const element of motionElements) {
				if (!(element instanceof sourceWindow.HTMLElement)) continue;
				const rect = element.getBoundingClientRect();
				element.style.setProperty(
					"--lens-atoms-motion-origin-x",
					sourceWindow.innerWidth / 2 - rect.left + "px",
				);
				element.style.setProperty(
					"--lens-atoms-motion-origin-y",
					sourceWindow.innerHeight / 2 - rect.top + "px",
				);
			}

			if (activeScale) {
				rootStyle.setProperty("--atoms-hero-scroll-scale", activeScale);
			} else {
				rootStyle.removeProperty("--atoms-hero-scroll-scale");
			}
		};

		const syncAtomsHeroMotion = () => {
			motionFrame = 0;
			const sourceDocument = lensFrame.contentDocument;
			const titleSourceDocument = interfereTitleFrame.contentDocument;
			const atomsHero = findAtomsHeroMotionSource();
			if (sourceDocument && atomsHero) {
				if (
					sourceDocument !== motionDocument ||
					titleSourceDocument !== titleMotionDocument
				) {
					motionDocument = sourceDocument;
					titleMotionDocument = titleSourceDocument;
					lastMotionSignature = "";
				}
				const atomsStyle = getComputedStyle(atomsHero);
				let scale = 1;
				if (atomsStyle.transform !== "none") {
					const matrix = new DOMMatrixReadOnly(atomsStyle.transform);
					scale = Math.hypot(matrix.a, matrix.b);
				}
				const opacity = Number.parseFloat(atomsStyle.opacity) || 0;
				const signature = scale + "|" + opacity;

				if (signature !== lastMotionSignature) {
					lastMotionSignature = signature;
					const motionRoots = [
						sourceDocument.documentElement,
						titleSourceDocument?.documentElement,
					].filter(Boolean);
					for (const root of motionRoots) {
						root.style.setProperty(
							"--atoms-hero-scroll-scale",
							String(scale),
						);
						root.style.setProperty(
							"--atoms-hero-scroll-opacity",
							String(opacity),
						);
						root.dataset.atomsHeroScrollScale = String(scale);
						root.dataset.atomsHeroScrollOpacity = String(opacity);
					}
				}
			}

			motionFrame = requestAnimationFrame(syncAtomsHeroMotion);
		};

		const startAtomsHeroMotionSync = () => {
			if (motionFrame !== 0) return;
			motionFrame = requestAnimationFrame(syncAtomsHeroMotion);
		};

		const isolateCanvas = () => {
			scheduled = false;
			const sourceDocument = lensFrame.contentDocument;
			const sourceWindow = lensFrame.contentWindow;
			if (!sourceDocument?.body || !sourceWindow) return;

			const canvases = Array.from(sourceDocument.querySelectorAll("canvas"));
			const target = canvases.find((canvas) =>
				canvas.closest('[class*="__dyHaOG__mask"]'),
			);
			if (!(target instanceof sourceWindow.HTMLCanvasElement)) {
				sourceWindow.setTimeout(isolateCanvas, 80);
				return;
			}
			const mask = target.closest('[class*="__dyHaOG__mask"]');
			const heroContainer = mask?.parentElement;
			const hero = heroContainer?.querySelector('[class*="__dyHaOG__lockup"]');
			const heroButtons = heroContainer?.querySelector(
				'[class*="__dyHaOG__buttons"]',
			);
			if (
				!(mask instanceof sourceWindow.HTMLElement) ||
				!(hero instanceof sourceWindow.HTMLElement) ||
				!(heroButtons instanceof sourceWindow.HTMLElement)
			) {
				sourceWindow.setTimeout(isolateCanvas, 80);
				return;
			}

			for (const element of sourceDocument.querySelectorAll(
				"[data-lens-canvas], [data-lens-canvas-stage], [data-lens-canvas-ancestor], [data-lens-hero], [data-lens-hero-buttons]",
			)) {
				element.removeAttribute("data-lens-canvas");
				element.removeAttribute("data-lens-canvas-stage");
				element.removeAttribute("data-lens-canvas-ancestor");
				element.removeAttribute("data-lens-hero");
				element.removeAttribute("data-lens-hero-buttons");
			}

			target.setAttribute("data-lens-canvas", "");
			let ancestor = target.parentElement;
			let insideStage = true;
			while (ancestor) {
				ancestor.setAttribute(
					insideStage ? "data-lens-canvas-stage" : "data-lens-canvas-ancestor",
					"",
				);
				if (ancestor === mask) insideStage = false;
				if (ancestor === sourceDocument.body) break;
				ancestor = ancestor.parentElement;
			}
			hero.setAttribute("data-lens-hero", "");
			heroButtons.setAttribute("data-lens-hero-buttons", "");

			if (!sourceDocument.getElementById("lens-canvas-isolation")) {
				sourceDocument.head.insertAdjacentHTML("beforeend", canvasStyle);
			}

			syncLensMotionOrigins();
			startAtomsHeroMotionSync();
			forwardScroll(sourceWindow);
			sourceWindow.dispatchEvent(new Event("resize"));
			sourceWindow.requestAnimationFrame(syncLensMotionOrigins);

			observer?.disconnect();
			observer = new sourceWindow.MutationObserver(() => {
				if (scheduled) return;
				scheduled = true;
				sourceWindow.requestAnimationFrame(isolateCanvas);
			});
			observer.observe(sourceDocument.body, { childList: true, subtree: true });
		};

		const navbarOrigin = new URL(navbarFrame.src).origin;
		const setNavbarHeight = (height) => {
			const nextHeight = Math.min(innerHeight, Math.max(73, height));
			const heightValue = nextHeight + "px";
			navbarFrame.style.height = heightValue;
			navbarAgentationSource.style.height = heightValue;
		};
		addEventListener("message", (event) => {
			if (
				event.source !== navbarFrame.contentWindow ||
				event.origin !== navbarOrigin
			) {
				return;
			}
			if (event.data?.type === "linear-navbar-scroll") {
				window.scrollBy(0, Number(event.data.deltaY) || 0);
				return;
			}
			if (event.data?.type !== "linear-navbar-frame") return;

			if (event.data.fullscreen) {
				navbarFrame.dataset.fullscreen = "";
				setNavbarHeight(innerHeight);
				return;
			}
			delete navbarFrame.dataset.fullscreen;
			const requestedHeight = Number(event.data.height) || 73;
			setNavbarHeight(requestedHeight);
		});
		addEventListener("resize", () => {
			if (navbarFrame.hasAttribute("data-fullscreen")) {
				setNavbarHeight(innerHeight);
			}
			requestAnimationFrame(syncLensMotionOrigins);
		});

		const prepareInterfereTitle = () => {
			if (interfereTitleFrame.contentWindow) {
				forwardScroll(interfereTitleFrame.contentWindow);
			}
			lastMotionSignature = "";
		};
		interfereTitleFrame.addEventListener("load", prepareInterfereTitle);
		if (interfereTitleFrame.contentDocument?.readyState !== "loading") {
			prepareInterfereTitle();
		}
		lensFrame.addEventListener("load", isolateCanvas);
		if (lensFrame.contentDocument?.readyState !== "loading") isolateCanvas();
	})();
</script>`;

const composeLensAtomsHtml = (atomsHtml) => {
	const lensPaletteHtml = atomsHtml
		.replaceAll("#FFF7DD", "#2c2d30")
		.replaceAll("#fff7dd", "#2c2d30")
		.replaceAll("#fff8ed", "#2c2d30")
		.replaceAll("rgb(255,247,221)", "rgb(44,45,48)")
		.replaceAll("rgb(255, 247, 221)", "rgb(44, 45, 48)")
		.replaceAll("rgb(255, 247, 220)", "rgb(44, 45, 48)")
		.replaceAll("rgb(255,248,237)", "rgb(44,45,48)")
		.replaceAll("rgb(255, 248, 237)", "rgb(44, 45, 48)");
	const withStyle = lensPaletteHtml.replace(
		/<\/head>/i,
		`${lensAtomsStyle}</head>`,
	);
	const withFrame = withStyle.replace(
		/<body([^>]*)>/i,
		(_body, attributes) => `<body${attributes}>${lensAtomsFrame}`,
	);
	return withFrame.replace(/<\/body>/i, `${lensAtomsScript}</body>`);
};

const lensAtomsHeroSourceStyle = `<style data-lens-atoms-hero-source>
	html,
	body {
		width: 100% !important;
		height: 100% !important;
		min-height: 0 !important;
		margin: 0 !important;
		overflow: hidden !important;
		background: rgb(255, 255, 255) !important;
		overscroll-behavior: none !important;
	}

	#main,
	#linear-navbar-agentation-source,
	#lens-agentation-source,
	#interfere-title-agentation-source {
		visibility: hidden !important;
		pointer-events: none !important;
	}

	#linear-navbar-agentation-source,
	#lens-agentation-source,
	#interfere-title-agentation-source {
		display: none !important;
	}

	#lens-canvas-source,
	#interfere-title-source {
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
	}

	#attio-dashboard-source {
		position: fixed;
		z-index: 2;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		pointer-events: auto;
	}

	#interfere-title-source {
		--lens-attio-title-base-shift: -78px;
		z-index: 3 !important;
		clip-path: inset(
			max(0px, calc(50svh - 155px))
			max(0px, calc((100vw - 720px) / 2))
			max(0px, calc(50svh - 130px))
			max(0px, calc((100vw - 720px) / 2))
		) !important;
		opacity: var(--lens-attio-title-opacity, 1);
		translate: 0
			calc(
				var(--lens-attio-title-base-shift) +
				var(--lens-attio-title-shift, 0px)
			);
		will-change: opacity, translate;
	}

	@media (max-width: 767px) {
		#interfere-title-source {
			--lens-attio-title-base-shift: 0px;
			clip-path: inset(
				max(0px, calc(50svh - 165px))
				16px
				max(0px, calc(50svh - 165px))
				16px
			) !important;
		}
	}
</style>`;

const attioDashboardFrame = `<iframe
		id="attio-dashboard-source"
		src="${attioDashboardSource}"
		title="Attio product dashboard"
		fetchpriority="high"
		tabindex="-1"
		aria-hidden="true"
	></iframe>`;

const lensAtomsHeroSourceScript = `<script data-lens-atoms-hero-source>
	(() => {
		const navbar = document.getElementById("linear-navbar-source");
		const dashboard = document.getElementById("attio-dashboard-source");
		const title = document.getElementById("interfere-title-source");
		if (
			!(navbar instanceof HTMLIFrameElement) ||
			!(dashboard instanceof HTMLIFrameElement) ||
			!(title instanceof HTMLIFrameElement)
		) {
			return;
		}
		const nativeScrollBy = window.scrollBy.bind(window);
		const forwardScroll = (deltaY) => {
			if (!Number.isFinite(deltaY) || deltaY === 0) return;
			parent.postMessage(
				{ type: "lens-atoms-hero-scroll", deltaY },
				"*",
			);
		};
		window.scrollBy = (x, y) => {
			const deltaY =
				typeof x === "object" && x !== null
					? Number(x.top) || 0
					: Number(y) || 0;
			if (deltaY !== 0) {
				forwardScroll(deltaY);
				return;
			}
			nativeScrollBy(x, y);
		};
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
				forwardScroll(event.deltaY * multiplier);
			},
			{ capture: true, passive: false },
		);
		addEventListener("keydown", (event) => {
			const amounts = {
				ArrowDown: 80,
				ArrowUp: -80,
				PageDown: innerHeight * 0.8,
				PageUp: innerHeight * -0.8,
				" ": innerHeight * (event.shiftKey ? -0.8 : 0.8),
			};
			if (!(event.key in amounts)) return;
			event.preventDefault();
			forwardScroll(amounts[event.key]);
		});
		addEventListener("message", (event) => {
			if (
				event.source === dashboard.contentWindow &&
				event.origin === ${JSON.stringify(attioDashboardOrigin)} &&
				event.data?.type === "attio-dashboard-scroll-request"
			) {
				forwardScroll(Number(event.data.deltaY) || 0);
				return;
			}
			if (
				event.source !== parent ||
				event.origin !== ${JSON.stringify(attioDashboardOrigin)} ||
				event.data?.type !== "lens-attio-scroll"
			) {
				return;
			}
			const scrollY = Math.max(0, Number(event.data.scrollY) || 0);
			dashboard.contentWindow?.postMessage(
				{ type: "attio-dashboard-scroll", scrollY },
				${JSON.stringify(attioDashboardOrigin)},
			);
			const titleProgress = Math.min(1, Math.max(0, (scrollY - 20) / 180));
			title.style.pointerEvents = titleProgress >= 0.35 ? "none" : "auto";
			document.documentElement.style.setProperty(
				"--lens-attio-title-opacity",
				String(1 - titleProgress),
			);
			document.documentElement.style.setProperty(
				"--lens-attio-title-shift",
				-Math.min(64, scrollY * 0.32) + "px",
			);
		});

		let scheduled = false;
		const report = () => {
			scheduled = false;
			const rect = navbar.getBoundingClientRect();
			parent.postMessage(
				{
					type: "lens-atoms-hero-source",
					fullscreen: navbar.hasAttribute("data-fullscreen"),
					navHeight: Math.max(73, Math.ceil(rect.height)),
				},
				"*",
			);
		};
		const scheduleReport = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(report);
		};
		let layoutScheduled = false;
		const syncDashboardLayout = () => {
			layoutScheduled = false;
			const titleDocument = title.contentDocument;
			if (!titleDocument || !dashboard.contentWindow) return;
			const controls = Array.from(
				titleDocument.querySelectorAll(
					"[data-interfere-title-source] a, [data-interfere-title-source] button",
				),
			).filter((element) => {
				const rect = element.getBoundingClientRect();
				const style = titleDocument.defaultView?.getComputedStyle(element);
				return (
					rect.width > 0 &&
					rect.height > 0 &&
					style?.visibility !== "hidden" &&
					style?.display !== "none"
				);
			});
			if (controls.length === 0) return;
			const contentBottom = Math.max(
				...controls.map((element) => element.getBoundingClientRect().bottom),
			);
			const titleBottom = title.getBoundingClientRect().top + contentBottom;
			dashboard.contentWindow.postMessage(
				{
					type: "attio-dashboard-layout",
					titleBottom,
					gap: innerWidth <= 767 ? 30 : 100,
				},
				${JSON.stringify(attioDashboardOrigin)},
			);
		};
		const scheduleDashboardLayout = () => {
			if (layoutScheduled) return;
			layoutScheduled = true;
			requestAnimationFrame(syncDashboardLayout);
		};

		new MutationObserver(scheduleReport).observe(navbar, {
			attributes: true,
			attributeFilter: ["data-fullscreen", "style"],
		});
		addEventListener("resize", () => {
			scheduleReport();
			scheduleDashboardLayout();
		});
		navbar.addEventListener("load", scheduleReport);
		title.addEventListener("load", scheduleDashboardLayout);
		dashboard.addEventListener("load", scheduleDashboardLayout);
		scheduleReport();
		scheduleDashboardLayout();
	})();
</script>`;

const composeLensAtomsHeroSourceHtml = (atomsHtml) => {
	const withStyle = composeLensAtomsHtml(atomsHtml).replace(
		/<\/head>/i,
		`${lensAtomsHeroSourceStyle}</head>`,
	);
	const withDashboard = withStyle.replace(
		/<body([^>]*)>/i,
		(_body, attributes) => `<body${attributes}>${attioDashboardFrame}`,
	);
	return withDashboard.replace(
		/<\/body>/i,
		`${lensAtomsHeroSourceScript}</body>`,
	);
};

const lensAtomsCanvasOnlyStyle = `<style data-lens-atoms-canvas-only>
	#attio-dashboard-source,
	#interfere-title-source,
	#linear-navbar-source,
	#linear-navbar-agentation-source {
		display: none !important;
	}

	#lens-canvas-source {
		z-index: 0 !important;
	}
</style>`;

const composeLensAtomsCanvasOnlyHtml = (atomsHtml) =>
	composeLensAtomsHeroSourceHtml(atomsHtml).replace(
		/<\/head>/i,
		`${lensAtomsCanvasOnlyStyle}</head>`,
	);

const lensContentSourceStyle = `<style data-lens-content-source>
	html,
	body {
		width: 100% !important;
		height: auto !important;
		min-height: 0 !important;
		margin: 0 !important;
		overflow: hidden !important;
		background: rgb(255, 255, 255) !important;
	}

	body > :not(main):not(script):not(next-route-announcer) {
		display: none !important;
	}

	body > main {
		width: 100% !important;
		height: auto !important;
		min-height: 0 !important;
	}

	body > main > :first-child,
	body > main > :nth-child(2) > :first-child,
	body > main > :nth-child(2) > :nth-child(2) {
		display: none !important;
	}

	body > main > :nth-child(2),
	body > main > :nth-child(2) [style*="opacity:0;"],
	body > main > :nth-child(2) [style$="opacity:0"] {
		opacity: 1 !important;
	}

	body > main > :nth-child(2) [style*="opacity:0;"],
	body > main > :nth-child(2) [style$="opacity:0"] {
		transform: none !important;
	}
</style>`;

const lensContentSourceScript = `<script data-lens-content-source>
	(() => {
		let scheduled = false;
		let lastHeight = 0;
		const report = (force = false) => {
			scheduled = false;
			const main = document.querySelector("body > main");
			if (!(main instanceof HTMLElement)) return;
			const height = Math.ceil(
				Math.max(
					document.body.scrollHeight,
					document.documentElement.scrollHeight,
					main.offsetTop + main.scrollHeight,
				),
			);
			if (!force && Math.abs(height - lastHeight) < 2) return;
			lastHeight = height;
			parent.postMessage({ type: "lens-content-size", height }, "*");
		};
		const scheduleReport = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(() => report());
		};
		const forwardScroll = (deltaY) => {
			if (!Number.isFinite(deltaY) || deltaY === 0) return;
			parent.postMessage({ type: "lens-content-scroll", deltaY }, "*");
		};
		addEventListener("message", (event) => {
			if (event.data?.type === "lens-content-measure") {
				report(true);
				return;
			}
			if (event.data?.type !== "lens-content-progress") return;
			const main = document.querySelector("body > main");
			if (!(main instanceof HTMLElement)) return;
			const offset = Math.max(0, Number(event.data.offset) || 0);
			main.style.transform = "translate3d(0, " + -offset + "px, 0)";
			main.style.willChange = "transform";
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
				forwardScroll(event.deltaY * multiplier);
			},
			{ capture: true, passive: false },
		);
		let touchY = null;
		addEventListener("pointerdown", (event) => {
			if (event.pointerType === "touch") touchY = event.clientY;
		});
		addEventListener(
			"pointermove",
			(event) => {
				if (event.pointerType !== "touch" || touchY === null) return;
				const deltaY = touchY - event.clientY;
				touchY = event.clientY;
				event.preventDefault();
				forwardScroll(deltaY);
			},
			{ passive: false },
		);
		const clearTouch = () => {
			touchY = null;
		};
		addEventListener("pointerup", clearTouch);
		addEventListener("pointercancel", clearTouch);
		new MutationObserver(scheduleReport).observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		new ResizeObserver(scheduleReport).observe(document.documentElement);
		addEventListener("resize", scheduleReport);
		Promise.resolve(document.fonts.ready).then(scheduleReport);
		scheduleReport();
		for (const delay of [250, 1000]) {
			setTimeout(() => report(true), delay);
		}
	})();
</script>`;

const composeLensContentSourceHtml = (html) =>
	html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(
			/<title>[\s\S]*?<\/title>/i,
			"<title>Lens content source · Opaline</title>",
		)
		.replace(/<\/head>/i, `${lensContentSourceStyle}</head>`)
		.replace(/<\/body>/i, `${lensContentSourceScript}</body>`);

const opalineRevealHtml = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<meta name="theme-color" content="#ffffff">
		<link rel="icon" href="/__opaline/favicon.svg" type="image/svg+xml">
		<title>Opaline aperture · Lens Build</title>
		<style>
			:root {
				--opaline-hole: 13.392px;
				--opaline-mark-size: 48px;
				color-scheme: light;
				background: #fff;
			}

			* {
				box-sizing: border-box;
			}

			html,
			body {
				width: 100%;
				min-height: 100%;
				margin: 0;
				overflow: hidden;
				background: #fff;
			}

			body {
				min-height: 100svh;
				-webkit-font-smoothing: antialiased;
			}

			html:not([data-opaline-complete]) body {
				touch-action: none;
			}

			#lens-build-live {
				position: fixed;
				inset: 0;
				width: 100%;
				height: 100svh;
				border: 0;
				clip-path: circle(var(--opaline-hole) at 50% 50%);
				pointer-events: none;
				will-change: clip-path;
			}

			#opaline-aperture-mark {
				position: fixed;
				z-index: 2;
				top: 50%;
				left: 50%;
				display: block;
				width: var(--opaline-mark-size);
				height: var(--opaline-mark-size);
				fill: #2c2d30;
				transform: translate(-50%, -50%);
				transform-origin: center;
				pointer-events: none;
			}

			#opaline-dia-chroma {
				position: fixed;
				z-index: 1;
				top: 50%;
				left: 50%;
				display: block;
				width: var(--opaline-mark-size);
				height: var(--opaline-mark-size);
				overflow: visible;
				opacity: 0;
				transform: translate(-50%, -50%);
				pointer-events: none;
			}

			#opaline-dia-chroma .opaline-dia-layer {
				opacity: 0.24;
			}

			.opaline-dia-layer-0 { fill: #340b05; opacity: 0.34; }
			.opaline-dia-layer-1 { fill: #0358f7; opacity: 0.32; }
			.opaline-dia-layer-2 { fill: #5092c7; opacity: 0.3; }
			.opaline-dia-layer-3 { fill: #e1ecfe; opacity: 0.28; }
			.opaline-dia-layer-4 { fill: #ffd400; opacity: 0.26; }
			.opaline-dia-layer-5 { fill: #fa3d1d; opacity: 0.24; }
			.opaline-dia-layer-6 { fill: #fd02f5; opacity: 0.22; }
			.opaline-dia-layer-7 { fill: #ffc0fd; opacity: 0.18; }
			.opaline-dia-layer-8 {
				fill: #ffc0fd;
				opacity: 0.12;
			}

			html[data-opaline-complete] #lens-build-live {
				clip-path: none;
				pointer-events: auto;
				will-change: auto;
			}

			html[data-opaline-complete] #opaline-aperture-mark,
			html[data-opaline-complete] #opaline-dia-chroma {
				display: none;
			}

			@media (prefers-reduced-motion: reduce) {
				#lens-build-live {
					clip-path: none;
					pointer-events: auto;
				}

				#opaline-aperture-mark,
				#opaline-dia-chroma {
					display: none;
				}
			}
		</style>
	</head>
	<body>
		<iframe id="lens-build-live" src="/build" title="Lens Build inspiration" tabindex="-1"></iframe>
		<svg id="opaline-dia-chroma" aria-hidden="true" viewBox="0 0 1049 1042" preserveAspectRatio="xMidYMid meet">
			<defs>
				<filter id="opaline-dia-distortion" x="-130%" y="-130%" width="360%" height="360%" color-interpolation-filters="sRGB">
					<feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="17" result="opaline-dia-noise"></feTurbulence>
					<feDisplacementMap id="opaline-dia-displacement" in="SourceGraphic" in2="opaline-dia-noise" scale="0" xChannelSelector="R" yChannelSelector="B" result="opaline-dia-displaced"></feDisplacementMap>
					<feGaussianBlur in="opaline-dia-displaced" stdDeviation="15"></feGaussianBlur>
				</filter>
			</defs>
			<g filter="url(#opaline-dia-distortion)">
				<use class="opaline-dia-layer opaline-dia-layer-8" data-history="9" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-7" data-history="8" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-6" data-history="7" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-5" data-history="6" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-4" data-history="5" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-3" data-history="4" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-2" data-history="3" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-1" data-history="2" href="#opaline-aperture-path"></use>
				<use class="opaline-dia-layer opaline-dia-layer-0" data-history="1" href="#opaline-aperture-path"></use>
			</g>
		</svg>
		<svg id="opaline-aperture-mark" aria-hidden="true" viewBox="0 0 1049 1042" preserveAspectRatio="xMidYMid meet">
			<path id="opaline-aperture-path" fill-rule="evenodd" clip-rule="evenodd" d="M524.532 0C661.725 4.52425 793.956 20.3892 890.19 103.494C986.746 183.313 1047.24 330.329 1049 520.65C1047.24 710.913 986.746 857.99 890.19 937.817C793.956 1020.92 661.79 1036.79 524.532 1041.3C387.274 1036.79 255.1 1020.92 158.866 937.817C62.3182 857.99 1.76716 711.006 0 520.684L0.00200081 520.672L0.010004 520.66L0.0200081 520.654L0.0320129 520.65L0.0560226 520.64L0.0640259 520.616C1.75876 330.245 62.3185 183.245 158.866 103.494C255.1 20.3892 387.274 4.52426 524.532 0ZM524.518 229.469C447.847 231.997 374.015 240.862 320.259 287.3C266.328 331.864 232.5 414.007 231.554 520.384L231.548 520.396L231.536 520.402L231.53 520.404L231.524 520.408L231.52 520.414L231.518 520.42C232.505 626.77 266.328 708.904 320.259 753.511C374.015 799.948 447.847 808.813 524.518 811.336C601.189 808.813 675.017 799.948 728.773 753.511C782.708 708.904 816.5 626.719 817.482 520.402C816.5 414.053 782.708 331.902 728.773 287.3C675.017 240.862 601.153 231.997 524.518 229.469Z"></path>
		</svg>
		<script>
			(() => {
				const root = document.documentElement;
				const frame = document.getElementById("lens-build-live");
				const chroma = document.getElementById("opaline-dia-chroma");
				const chromaLayers = Array.from(
					chroma.querySelectorAll(".opaline-dia-layer"),
				);
				const chromaDisplacement = document.getElementById(
					"opaline-dia-displacement",
				);
				const baseHole = 48 * 0.279;
				let progress = 0;
				let finalScale = 1;
				let scrollRange = 1000;
				let finished = false;
				let touchY = null;
				let chromaIntensity = 0;
				let chromaDirection = 1;
				let chromaFrame = 0;
				let chromaFrameTime = 0;
				let lastMotionTime = performance.now();

				const renderChroma = (intensity) => {
					const exitFade = Math.min(
						1,
						Math.max(0, (0.92 - progress) / 0.14),
					);
					const effectiveIntensity = intensity * exitFade;
					const maximumTrailLength = chromaDirection > 0 ? 0.9 : 1.18;
					const trailLength = effectiveIntensity * maximumTrailLength;
					const trailSide = chromaDirection > 0 ? -1 : 1;

					chroma.style.opacity = String(effectiveIntensity * 0.92);
					chroma.dataset.motion = chromaDirection > 0 ? "expand" : "contract";
					chromaDisplacement.setAttribute(
						"scale",
						String(effectiveIntensity * 104),
					);

					for (const layer of chromaLayers) {
						const history = Math.pow(
							Number(layer.dataset.history) / chromaLayers.length,
							1.25,
						);
						const layerScale = Math.max(
							0.08,
							1 + trailSide * trailLength * history,
						);
						layer.setAttribute(
							"transform",
							"translate(524.5 521) scale(" +
								layerScale.toFixed(5) +
								") translate(-524.5 -521)",
						);
					}
				};

				const animateChroma = (now) => {
					const elapsed = Math.min(64, Math.max(0, now - chromaFrameTime));
					chromaFrameTime = now;
					chromaIntensity *= Math.exp(-elapsed / 190);
					renderChroma(chromaIntensity);

					if (!finished && chromaIntensity > 0.003) {
						chromaFrame = requestAnimationFrame(animateChroma);
					} else {
						chromaIntensity = 0;
						renderChroma(0);
						chromaFrame = 0;
					}
				};

				const kickChroma = (distance) => {
					const now = performance.now();
					const elapsed = Math.min(80, Math.max(16, now - lastMotionTime));
					const velocity = Math.abs(distance) / elapsed;
					lastMotionTime = now;
					chromaDirection = distance > 0 ? 1 : -1;
					chromaIntensity = Math.max(
						chromaIntensity,
						Math.min(1, velocity / 1.8),
					);
					renderChroma(chromaIntensity);

					if (chromaFrame === 0) {
						chromaFrameTime = now;
						chromaFrame = requestAnimationFrame(animateChroma);
					}
				};

				const configure = () => {
					finalScale = Math.max(
						1,
						(Math.hypot(innerWidth, innerHeight) * 2.2) / 48,
					);
					scrollRange = Math.max(720, innerHeight * 1.1);
					render();
				};

				const removeControls = () => {
					removeEventListener("wheel", handleWheel);
					removeEventListener("keydown", handleKeydown);
					removeEventListener("pointerdown", handlePointerDown);
					removeEventListener("pointermove", handlePointerMove);
					removeEventListener("pointerup", handlePointerEnd);
					removeEventListener("pointercancel", handlePointerEnd);
					removeEventListener("resize", configure);
				};

				const finish = () => {
					if (finished) return;
					finished = true;
					removeControls();
					cancelAnimationFrame(chromaFrame);
					chromaFrame = 0;
					chromaIntensity = 0;
					renderChroma(0);
					root.dataset.opalineComplete = "";
					frame.removeAttribute("tabindex");
				};

				const render = () => {
					const scale = Math.exp(Math.log(finalScale) * progress);
					root.style.setProperty("--opaline-mark-size", 48 * scale + "px");
					root.style.setProperty("--opaline-hole", baseHole * scale + "px");
					root.dataset.opalineProgress = progress.toFixed(4);
					if (progress >= 1) finish();
				};

				const scrub = (delta) => {
					if (finished || delta === 0) return;
					const nextProgress = Math.min(
						1,
						Math.max(0, progress + delta / scrollRange),
					);
					if (nextProgress === progress) return;
					const appliedDistance = (nextProgress - progress) * scrollRange;
					progress = nextProgress;
					render();
					if (!finished) kickChroma(appliedDistance);
				};

				const handleWheel = (event) => {
					if (finished) return;
					const multiplier =
						event.deltaMode === WheelEvent.DOM_DELTA_LINE
							? 16
							: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
								? innerHeight
								: 1;
					const delta = event.deltaY * multiplier;
					if (delta === 0) return;
					event.preventDefault();
					scrub(delta);
				};

				const handleKeydown = (event) => {
					const amounts = {
						ArrowDown: 80,
						ArrowUp: -80,
						PageDown: 320,
						PageUp: -320,
						" ": event.shiftKey ? -320 : 320,
					};
					if (!(event.key in amounts)) return;
					event.preventDefault();
					scrub(amounts[event.key]);
				};

				const handlePointerDown = (event) => {
					if (event.pointerType === "touch") touchY = event.clientY;
				};

				const handlePointerMove = (event) => {
					if (event.pointerType !== "touch" || touchY === null) return;
					event.preventDefault();
					const delta = touchY - event.clientY;
					touchY = event.clientY;
					scrub(delta);
				};

				const handlePointerEnd = (event) => {
					if (event.pointerType === "touch") touchY = null;
				};

				if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
					finish();
				} else {
					configure();
					addEventListener("wheel", handleWheel, { passive: false });
					addEventListener("keydown", handleKeydown);
					addEventListener("pointerdown", handlePointerDown, { passive: true });
					addEventListener("pointermove", handlePointerMove, { passive: false });
					addEventListener("pointerup", handlePointerEnd, { passive: true });
					addEventListener("pointercancel", handlePointerEnd, { passive: true });
					addEventListener("resize", configure);
					}
			})();
		</script>
	</body>
</html>`;

const serveOpalineReveal = (response) => {
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(opalineRevealHtml);
};

const serveRawLensCapture = async (response) => {
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(await readFile(capturePath, "utf8"));
};

const serveLensContentSource = async (response) => {
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(
		composeLensContentSourceHtml(await readFile(capturePath, "utf8")),
	);
};

const serveInterfereTitleSource = async (response) => {
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(
		composeInterfereTitleSourceHtml(
			await readFile(interfereCapturePath, "utf8"),
		),
	);
};

const serveLensAtomsComposition = async (response) => {
	const atomsHtml = await readFile(atomsCapturePath, "utf8");
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(injectAgentation(composeLensAtomsHtml(atomsHtml), "lens-xyz"));
};

const serveLensAtomsHeroSource = async (
	response,
	{ canvasOnly = false } = {},
) => {
	const atomsHtml = await readFile(atomsCapturePath, "utf8");
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "text/html; charset=utf-8",
	});
	response.end(
		canvasOnly
			? composeLensAtomsCanvasOnlyHtml(atomsHtml)
			: composeLensAtomsHeroSourceHtml(atomsHtml),
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
	const preview = body.subarray(0, 4096).toString("utf8");
	if (!/<html[\s>]/i.test(preview) || !preview.includes("Lens")) {
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

const proxyLensGet = async (request, response, requestUrl) => {
	const upstreamUrl = new URL(
		`${requestUrl.pathname}${requestUrl.search}`,
		lensOrigin,
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
		const redirected = new URL(location, lensOrigin);
		responseHeaders.location =
			redirected.origin === lensOrigin
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
			site: "lens-xyz",
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
		opalineRevealRoutes.has(requestUrl.pathname)
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-lens-page.js on https://lens.xyz/build.\n`,
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
		await serveOpalineReveal(response);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		requestUrl.pathname === interfereTitleSourceRoute
	) {
		if (
			!existsSync(interfereCapturePath) ||
			!statSync(interfereCapturePath).isFile()
		) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end("Missing the Interfere reference capture.\n");
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
		await serveInterfereTitleSource(response);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		(requestUrl.pathname === lensContentSourceRoute ||
			(requestUrl.pathname === "/build" &&
				requestUrl.searchParams.get("opaline-source") === "lens-content"))
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-lens-page.js on https://lens.xyz/build.\n`,
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
		await serveLensContentSource(response);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		requestUrl.pathname === "/build" &&
		requestUrl.searchParams.get("opaline-source") === "lens-canvas"
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-lens-page.js on https://lens.xyz/build.\n`,
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
		await serveRawLensCapture(response);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		requestUrl.pathname === lensAtomsHeroSourceRoute
	) {
		if (
			!existsSync(capturePath) ||
			!statSync(capturePath).isFile() ||
			!existsSync(atomsCapturePath) ||
			!statSync(atomsCapturePath).isFile() ||
			!existsSync(interfereCapturePath) ||
			!statSync(interfereCapturePath).isFile()
		) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				"The Lens, Atoms, and Interfere captures are required for this source.\n",
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
		await serveLensAtomsHeroSource(response, {
			canvasOnly: requestUrl.searchParams.get("opaline-layer") === "canvas",
		});
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		lensAtomsRoutes.has(requestUrl.pathname)
	) {
		if (
			!existsSync(capturePath) ||
			!statSync(capturePath).isFile() ||
			!existsSync(atomsCapturePath) ||
			!statSync(atomsCapturePath).isFile() ||
			!existsSync(interfereCapturePath) ||
			!statSync(interfereCapturePath).isFile()
		) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				"The Lens, Atoms, and Interfere captures are required for this route.\n",
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
		await serveLensAtomsComposition(response);
		return;
	}

	if (
		["GET", "HEAD"].includes(request.method || "") &&
		["/", "/build", "/build/"].includes(requestUrl.pathname)
	) {
		if (!existsSync(capturePath) || !statSync(capturePath).isFile()) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Missing ${defaultFile}. Run capture-lens-page.js on https://lens.xyz/build.\n`,
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
		await serveCaptureWithAgentation(response, capturePath, "lens-xyz");
		return;
	}

	if (["GET", "HEAD"].includes(request.method || "")) {
		try {
			await proxyLensGet(request, response, requestUrl);
		} catch (error) {
			response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			response.end(
				`Lens asset proxy failed: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
		return;
	}

	response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
	response.end("Only the local capture endpoint accepts writes.\n");
}).listen(port, "127.0.0.1", () => {
	console.log(`Lens reference: http://127.0.0.1:${port}/build`);
	console.log(
		`Opaline reveal: http://127.0.0.1:${port}/build/opaline-aperture`,
	);
	console.log(`Lens × Atoms: http://127.0.0.1:${port}/build/lens-atoms`);
	console.log(`Captures save directly to ${capturePath}`);
	console.log(
		"Public Lens assets are proxied read-only; press Ctrl+C to stop.",
	);
});
