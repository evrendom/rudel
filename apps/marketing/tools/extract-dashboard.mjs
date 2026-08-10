import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const sourceUrl =
	"http://127.0.0.1:4180/?opaline-composition=lens-attio-lens";
const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const vendorRoot = path.join(
	marketingRoot,
	"src/styles/vendor/attio/dashboard",
);
const generatedRoot = path.join(marketingRoot, "src/components/generated");
const fontRoot = path.join(marketingRoot, "public/fonts/attio");
const imageRoot = path.join(marketingRoot, "public/vendor/attio-dashboard");
const artifactRoot = path.resolve(
	marketingRoot,
	"../../.context/extractions/dashboard",
);

const reportingPaintAuditExpression = `(() => {
	const panel = [...document.querySelectorAll("[data-home-hero-preview-tab=Reporting]")]
		.find((element) => element.getBoundingClientRect().width > 0);
	if (!(panel instanceof HTMLElement)) return { ready: false, reason: "panel" };
	const isPainted = (element) => {
		const bounds = element.getBoundingClientRect();
		if (bounds.width <= 2 || bounds.height <= 2) return false;
		for (let current = element; current && current !== panel.parentElement; current = current.parentElement) {
			const style = getComputedStyle(current);
			if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.9) return false;
		}
		return true;
	};
	const isColorful = (value) => {
		const channels = value.match(/[\\d.]+/g)?.map(Number) ?? [];
		if (channels.length < 3 || (channels.length >= 4 && channels[3] < 0.1)) return false;
		return Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3)) >= 24;
	};
	const elements = [...panel.querySelectorAll("*")];
	const exactTextIsPainted = (text) => {
		const element = elements.find((candidate) => candidate.textContent?.trim() === text);
		return Boolean(element && isPainted(element));
	};
	const coloredElements = elements.filter((element) => {
		if (!isPainted(element)) return false;
		const style = getComputedStyle(element);
		return [style.backgroundColor, style.borderColor, style.fill, style.stroke].some(isColorful);
	});
	const coloredArea = Math.round(coloredElements.reduce((total, element) => {
		const bounds = element.getBoundingClientRect();
		return total + Math.min(bounds.width * bounds.height, 100_000);
	}, 0));
	const panelBounds = panel.getBoundingClientRect();
	const panelArea = panelBounds.width * panelBounds.height;
	const activeAnimations = panel.getAnimations({ subtree: true }).length;
	const htmlBytes = panel.outerHTML.length;
	return {
		ready:
			exactTextIsPainted("Business Metrics") &&
			exactTextIsPainted("Revenue growth by paid plan") &&
			exactTextIsPainted("Closed-won deals by MQL type") &&
			coloredElements.length >= 400 &&
			coloredArea >= panelArea * 4 &&
			htmlBytes >= 180_000 &&
			activeAnimations === 0,
		coloredElements: coloredElements.length,
		coloredArea,
		panelArea: Math.round(panelArea),
		htmlBytes,
		activeAnimations,
	};
})()`;

const waitForSettledReporting = async (browserSession) =>
	browserSession.evaluate(
		`new Promise((resolve, reject) => {
			const deadline = performance.now() + 12_000;
			let stableFrames = 0;
			let peak = { coloredArea: 0 };
			const tick = () => {
				const audit = ${reportingPaintAuditExpression};
				if (audit.coloredArea > peak.coloredArea) peak = audit;
				stableFrames = audit.ready ? stableFrames + 1 : 0;
				if (stableFrames >= 3) return resolve({ ...audit, stableFrames });
				if (performance.now() >= deadline) {
					return reject(new Error("Reporting paint predicate timed out: " + JSON.stringify({ audit, peak })));
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		})`,
		{ awaitPromise: true },
	);

const session = await createBrowserSession({
	url: sourceUrl,
	width: 1280,
	height: 800,
	dpr: 1,
});
let capture;
try {
	await session.waitFor(
		'document.querySelector("[data-home-hero=attio-window-shell][data-opaline-scene-ready]")',
	);
	// Capture the dashboard at the reference's settled, full-window scroll state.
	// At scroll zero the auxiliary Framer layers are intentionally still hidden.
	await session.evaluate("scrollTo(0, 400)");
	await wait(1_750);
	const base = await session.evaluate(
		`(() => {
			const shell = document.querySelector("[data-home-hero=attio-window-shell]");
			const dashboard = shell?.parentElement;
			const panel = shell?.querySelector("[data-home-hero-preview-tab]");
			if (!(dashboard instanceof HTMLElement) || !(shell instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
				throw new Error("The settled dashboard source is incomplete");
			}
			const overlay = document.createElement("div");
			overlay.id = "dashboard-gate-source-overlay";
			overlay.innerHTML = '<main><section><div class="dashboard-gate-stage"></div></section></main>';
			const frozenDashboard = dashboard.cloneNode(true);
			overlay.querySelector(".dashboard-gate-stage").append(frozenDashboard);
			Object.assign(overlay.style, {
				position: "fixed", zIndex: "2147483647", inset: "0", background: "#fff",
			});
			for (const element of [overlay.querySelector("main"), overlay.querySelector("section")]) {
				Object.assign(element.style, {
					display: "block", position: "static", width: "100%", height: "100%",
					margin: "0", padding: "0", border: "0", background: "transparent",
				});
			}
			Object.assign(overlay.querySelector(".dashboard-gate-stage").style, {
				position: "fixed", top: "100px", left: "0", display: "flex",
				width: "100%", justifyContent: "center",
			});
			document.body.append(overlay);
			const dataPanelTemplate = document.createElement("template");
			dataPanelTemplate.id = "dashboard-gate-data-panel-template";
			dataPanelTemplate.content.append(
				frozenDashboard
					.querySelector("[data-home-hero-preview-tab]")
					.cloneNode(true),
			);
			document.head.append(dataPanelTemplate);
			return {
				dashboardHtml: frozenDashboard.outerHTML,
				shellHtml: shell.outerHTML,
				dataPanelHtml: frozenDashboard.querySelector("[data-home-hero-preview-tab]").outerHTML,
				pageRoot: {
					htmlClass: document.documentElement.className,
					htmlStyle: document.documentElement.getAttribute("style") ?? "",
					bodyClass: document.body.className,
				},
				stylesheets: [...document.styleSheets].map((sheet) => sheet.href).filter(Boolean),
				compositionCss: document.querySelector("style[data-lens-attio-composition]")?.textContent ?? "",
				lensCompositionCss: document.querySelector("style[data-lens-attio-lens-composition]")?.textContent ?? "",
				localReferenceCss: document.querySelector("style[data-attio-local-reference]")?.textContent ?? "",
				images: [...frozenDashboard.querySelectorAll("img")].map((image) => ({
					src: image.getAttribute("src") ?? "",
					srcset: image.getAttribute("srcset") ?? "",
					currentSrc: image.currentSrc,
				})),
			};
		})()`,
	);
	await mkdir(artifactRoot, { recursive: true });
	await wait(250);
	await session.screenshot(path.join(artifactRoot, "source-data-normalized.png"));
	await session.evaluate(
		'document.querySelector("[data-opaline-use-case=Reporting]")?.click()',
	);
	await session.waitFor(
		'document.querySelector("[data-home-hero-preview-tab]")?.getAttribute("data-home-hero-preview-tab") === "Reporting"',
	);
	// The Reporting DOM cycles through several visually blank transition states.
	// Capture only after the complete painted chart holds for three frames.
	await waitForSettledReporting(session);
	const reporting = await session.evaluate(
		`(() => {
			const panel = document.querySelector("[data-home-hero-preview-tab]");
			const frozenShell = document.querySelector("#dashboard-gate-source-overlay [data-home-hero=attio-window-shell]");
			const frozenPanel = frozenShell?.querySelector("[data-home-hero-preview-tab]");
			if (!(panel instanceof HTMLElement) || !(frozenPanel instanceof HTMLElement)) {
				throw new Error("The reporting dashboard source is incomplete");
			}
			const clone = panel.cloneNode(true);
			const sourceElements = [panel, ...panel.querySelectorAll("*")];
			const cloneElements = [clone, ...clone.querySelectorAll("*")];
			for (let index = 0; index < sourceElements.length; index += 1) {
				const sourceElement = sourceElements[index];
				const cloneElement = cloneElements[index];
				if (!(sourceElement instanceof HTMLElement || sourceElement instanceof SVGElement) ||
					!(cloneElement instanceof HTMLElement || cloneElement instanceof SVGElement)) continue;
				const animations = sourceElement.getAnimations();
				if (animations.length === 0) continue;
				const properties = new Set(["opacity", "transform", "translate", "scale", "rotate", "filter", "clip-path"]);
				for (const animation of animations) {
					try {
						for (const frame of animation.effect?.getKeyframes() ?? []) {
							for (const property of Object.keys(frame)) {
								if (!["offset", "computedOffset", "easing", "composite"].includes(property)) {
									properties.add(property.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()));
								}
							}
						}
					} catch {}
				}
				const computed = getComputedStyle(sourceElement);
				for (const property of properties) {
					const value = computed.getPropertyValue(property);
					if (value) cloneElement.style.setProperty(property, value);
				}
			}
			frozenPanel.replaceWith(clone);
			for (const button of frozenShell.querySelectorAll("[data-opaline-use-case]")) {
				const selected = button.dataset.opalineUseCase === "Reporting";
				button.setAttribute("aria-selected", String(selected));
				button.tabIndex = selected ? 0 : -1;
			}
			return {
				html: clone.outerHTML,
				images: [...clone.querySelectorAll("img")].map((image) => ({
					src: image.getAttribute("src") ?? "",
					srcset: image.getAttribute("srcset") ?? "",
					currentSrc: image.currentSrc,
				})),
			};
		})()`,
	);
	await wait(250);
	await session.screenshot(path.join(artifactRoot, "source-reporting-normalized.png"));
	await session.freezeAtDeterministicState();
	await session.evaluate(`(() => {
		const overlay = document.querySelector("#dashboard-gate-source-overlay");
		for (const child of [...document.body.children]) {
			if (child !== overlay) child.remove();
		}
	})()`);
	const reportingSnapshot = await session.snapshot({
		component: "dashboard",
		scene: "Reporting",
		sourceUrl,
	});
	await session.evaluate(`(() => {
		const shell = document.querySelector("#dashboard-gate-source-overlay [data-home-hero=attio-window-shell]");
		const panel = shell?.querySelector("[data-home-hero-preview-tab]");
		const dataPanel = document
			.querySelector("#dashboard-gate-data-panel-template")
			?.content.firstElementChild?.cloneNode(true);
		if (!(panel instanceof HTMLElement) || !(dataPanel instanceof HTMLElement)) {
			throw new Error("Could not restore the frozen Data model panel");
		}
		panel.replaceWith(dataPanel);
		for (const button of shell.querySelectorAll("[data-opaline-use-case]")) {
			const selected = button.dataset.opalineUseCase === "Data model";
			button.setAttribute("aria-selected", String(selected));
			button.tabIndex = selected ? 0 : -1;
		}
	})()`);
	const dataSnapshot = await session.snapshot({
		component: "dashboard",
		scene: "Data model",
		sourceUrl,
	});
	capture = {
		...base,
		reportingPanelHtml: reporting.html,
		images: [...base.images, ...reporting.images],
		dataSnapshot,
		reportingSnapshot,
	};
} finally {
	await session.close();
}

const mobileSession = await createBrowserSession({
	url: sourceUrl,
	width: 390,
	height: 844,
	dpr: 1,
	mobile: true,
});
try {
	await mobileSession.waitFor(
		'[...document.querySelectorAll("[data-home-hero-preview-tab]")].some((panel) => panel.getBoundingClientRect().width > 0)',
	);
	await wait(1_750);
	const mobileBase = await mobileSession.evaluate(`(() => {
		const panel = [...document.querySelectorAll("[data-home-hero-preview-tab]")]
			.find((candidate) => candidate.getBoundingClientRect().width > 0);
		const mobileWindow = panel?.parentElement?.parentElement;
		if (!(panel instanceof HTMLElement) || !(mobileWindow instanceof HTMLElement)) {
			throw new Error("The settled mobile dashboard source is incomplete");
		}
		const overlay = document.createElement("div");
		overlay.id = "dashboard-mobile-gate-source-overlay";
		const stage = document.createElement("div");
		stage.className = "dashboard-mobile-gate-stage";
		const frozenWindow = mobileWindow.cloneNode(true);
		stage.append(frozenWindow);
		overlay.append(stage);
		Object.assign(overlay.style, {
			position: "fixed", zIndex: "2147483647", inset: "0", background: "#fff",
		});
		Object.assign(stage.style, {
			position: "fixed", top: "525px", left: "0", width: "100%",
		});
		document.body.append(overlay);
		const template = document.createElement("template");
		template.id = "dashboard-mobile-gate-data-template";
		template.content.append(frozenWindow.cloneNode(true));
		document.head.append(template);
		return {
			windowHtml: frozenWindow.outerHTML,
			images: [...frozenWindow.querySelectorAll("img")].map((image) => ({
				src: image.getAttribute("src") ?? "",
				srcset: image.getAttribute("srcset") ?? "",
				currentSrc: image.currentSrc,
			})),
		};
	})()`);
	await wait(250);
	await mobileSession.screenshot(
		path.join(artifactRoot, "source-mobile-data-normalized.png"),
	);
	await mobileSession.evaluate(
		'document.querySelector("[data-opaline-use-case=Reporting]")?.click()',
	);
	await mobileSession.waitFor(
		'[...document.querySelectorAll("[data-home-hero-preview-tab]")].some((panel) => panel.getBoundingClientRect().width > 0 && panel.getAttribute("data-home-hero-preview-tab") === "Reporting")',
	);
	await waitForSettledReporting(mobileSession);
	const mobileReporting = await mobileSession.evaluate(`(() => {
		const panel = [...document.querySelectorAll("[data-home-hero-preview-tab]")]
			.find((candidate) => candidate.getBoundingClientRect().width > 0);
		const mobileWindow = panel?.parentElement?.parentElement;
		const frozenWindow = document.querySelector("#dashboard-mobile-gate-source-overlay .dashboard-mobile-gate-stage")?.firstElementChild;
		if (!(mobileWindow instanceof HTMLElement) || !(frozenWindow instanceof HTMLElement)) {
			throw new Error("The reporting mobile dashboard source is incomplete");
		}
		const clone = mobileWindow.cloneNode(true);
		const sourceElements = [mobileWindow, ...mobileWindow.querySelectorAll("*")];
		const cloneElements = [clone, ...clone.querySelectorAll("*")];
		for (let index = 0; index < sourceElements.length; index += 1) {
			const sourceElement = sourceElements[index];
			const cloneElement = cloneElements[index];
			if (!(sourceElement instanceof HTMLElement || sourceElement instanceof SVGElement) ||
				!(cloneElement instanceof HTMLElement || cloneElement instanceof SVGElement)) continue;
			const animations = sourceElement.getAnimations();
			if (animations.length === 0) continue;
			const properties = new Set(["opacity", "transform", "translate", "scale", "rotate", "filter", "clip-path"]);
			for (const animation of animations) {
				try {
					for (const frame of animation.effect?.getKeyframes() ?? []) {
						for (const property of Object.keys(frame)) {
							if (!["offset", "computedOffset", "easing", "composite"].includes(property)) {
								properties.add(property.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()));
							}
						}
					}
				} catch {}
			}
			const computed = getComputedStyle(sourceElement);
			for (const property of properties) {
				const value = computed.getPropertyValue(property);
				if (value) cloneElement.style.setProperty(property, value);
			}
		}
		frozenWindow.replaceWith(clone);
		return {
			windowHtml: clone.outerHTML,
			images: [...clone.querySelectorAll("img")].map((image) => ({
				src: image.getAttribute("src") ?? "",
				srcset: image.getAttribute("srcset") ?? "",
				currentSrc: image.currentSrc,
			})),
		};
	})()`);
	await wait(250);
	await mobileSession.screenshot(
		path.join(artifactRoot, "source-mobile-reporting-normalized.png"),
	);
	await mobileSession.freezeAtDeterministicState();
	await mobileSession.evaluate(`(() => {
		const overlay = document.querySelector("#dashboard-mobile-gate-source-overlay");
		for (const child of [...document.body.children]) {
			if (child !== overlay) child.remove();
		}
	})()`);
	const mobileReportingSnapshot = await mobileSession.snapshot({
		component: "dashboard-mobile",
		scene: "Reporting",
		sourceUrl,
	});
	await mobileSession.evaluate(`(() => {
		const current = document.querySelector("#dashboard-mobile-gate-source-overlay .dashboard-mobile-gate-stage")?.firstElementChild;
		const dataWindow = document
			.querySelector("#dashboard-mobile-gate-data-template")
			?.content.firstElementChild?.cloneNode(true);
		if (!(current instanceof HTMLElement) || !(dataWindow instanceof HTMLElement)) {
			throw new Error("Could not restore the frozen mobile Data model window");
		}
		current.replaceWith(dataWindow);
	})()`);
	const mobileDataSnapshot = await mobileSession.snapshot({
		component: "dashboard-mobile",
		scene: "Data model",
		sourceUrl,
	});
	capture = {
		...capture,
		mobileDataHtml: mobileBase.windowHtml,
		mobileReportingHtml: mobileReporting.windowHtml,
		mobileDataSnapshot,
		mobileReportingSnapshot,
		images: [
			...capture.images,
			...mobileBase.images,
			...mobileReporting.images,
		],
	};
} finally {
	await mobileSession.close();
}

const uniqueStylesheets = [...new Set(capture.stylesheets)];
const cssChunks = await Promise.all(
	uniqueStylesheets.map(async (url) => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
		return { url, css: await response.text() };
	}),
);

const fontUrls = new Map();
for (const chunk of cssChunks) {
	for (const match of chunk.css.matchAll(/url\(([^)]+\.woff2[^)]*)\)/g)) {
		const raw = match[1].replace(/^['"]|['"]$/g, "");
		fontUrls.set(new URL(raw, chunk.url).href, raw);
	}
}
const fontManifest = [];
await mkdir(fontRoot, { recursive: true });
for (const [url] of fontUrls) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const filename = new URL(url).pathname.split("/").at(-1);
	await writeFile(path.join(fontRoot, filename), bytes);
	fontManifest.push({
		url,
		filename,
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	});
}

let sourceCss = cssChunks.map(({ css }) => css).join("\n");
for (const { url, filename } of fontManifest) {
	for (const chunk of cssChunks) {
		const relativeUrl = [...chunk.css.matchAll(/url\(([^)]+\.woff2[^)]*)\)/g)]
			.map((match) => match[1].replace(/^['"]|['"]$/g, ""))
			.find((raw) => new URL(raw, chunk.url).href === url);
		if (relativeUrl) sourceCss = sourceCss.replaceAll(relativeUrl, `/fonts/attio/${filename}`);
	}
}

const imageManifest = [];
await mkdir(imageRoot, { recursive: true });
for (const [index, image] of [...new Map(capture.images.map((item) => [item.currentSrc, item])).values()].entries()) {
	if (!image.currentSrc) continue;
	const response = await fetch(image.currentSrc);
	if (!response.ok) throw new Error(`Could not download ${image.currentSrc}: ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const contentType = response.headers.get("content-type") ?? "image/webp";
	const extension = contentType.includes("png")
		? "png"
		: contentType.includes("jpeg")
			? "jpg"
			: "webp";
	const filename = `asset-${String(index + 1).padStart(2, "0")}.${extension}`;
	await writeFile(path.join(imageRoot, filename), bytes);
	imageManifest.push({
		...image,
		filename,
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	});
}

const escapeAttribute = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const localizeMarkup = (markup) => {
	let result = markup;
	for (const image of imageManifest) {
		const localUrl = `/vendor/attio-dashboard/${image.filename}`;
		if (image.src) {
			result = result.replaceAll(`src="${escapeAttribute(image.src)}"`, `src="${localUrl}"`);
		}
		if (image.srcset) {
			result = result.replaceAll(
				`srcset="${escapeAttribute(image.srcset)}"`,
				`srcset="${localUrl} 1x"`,
			);
		}
	}
	return result;
};

const shellHtml = localizeMarkup(capture.shellHtml);
const dashboardHtml = localizeMarkup(capture.dashboardHtml);
const dataPanelHtml = localizeMarkup(capture.dataPanelHtml);
const reportingPanelHtml = localizeMarkup(capture.reportingPanelHtml);
const mobileDataHtml = localizeMarkup(capture.mobileDataHtml);
const mobileReportingHtml = localizeMarkup(capture.mobileReportingHtml);
const compositionCss = [
	capture.localReferenceCss,
	capture.compositionCss,
	capture.lensCompositionCss,
].join("\n");

await Promise.all([
	mkdir(vendorRoot, { recursive: true }),
	mkdir(generatedRoot, { recursive: true }),
	mkdir(artifactRoot, { recursive: true }),
]);
await Promise.all([
	writeFile(path.join(vendorRoot, "source.css"), sourceCss),
	writeFile(path.join(vendorRoot, "composition.css"), compositionCss),
	writeFile(
		path.join(generatedRoot, "dashboard-source-data.ts"),
		[
			"// Generated by tools/extract-dashboard.mjs from the settled 4180 composition.",
			`export const dashboardHtml = ${JSON.stringify(dashboardHtml)};`,
			`export const shellHtml = ${JSON.stringify(shellHtml)};`,
			`export const dataPanelHtml = ${JSON.stringify(dataPanelHtml)};`,
			`export const reportingPanelHtml = ${JSON.stringify(reportingPanelHtml)};`,
			`export const mobileDataHtml = ${JSON.stringify(mobileDataHtml)};`,
			`export const mobileReportingHtml = ${JSON.stringify(mobileReportingHtml)};`,
			`export const dashboardPageRoot = ${JSON.stringify(capture.pageRoot)} as const;`,
			"",
		].join("\n"),
	),
	writeFile(path.join(artifactRoot, "shell-data.html"), shellHtml),
	writeFile(path.join(artifactRoot, "dashboard-data.html"), dashboardHtml),
	writeFile(path.join(artifactRoot, "panel-reporting.html"), reportingPanelHtml),
	writeFile(path.join(artifactRoot, "mobile-data.html"), mobileDataHtml),
	writeFile(path.join(artifactRoot, "mobile-reporting.html"), mobileReportingHtml),
	writeFile(
		path.join(artifactRoot, "source-data.structure.json"),
		`${JSON.stringify(capture.dataSnapshot)}\n`,
	),
	writeFile(
		path.join(artifactRoot, "source-reporting.structure.json"),
		`${JSON.stringify(capture.reportingSnapshot)}\n`,
	),
	writeFile(
		path.join(artifactRoot, "source-mobile-data.structure.json"),
		`${JSON.stringify(capture.mobileDataSnapshot)}\n`,
	),
	writeFile(
		path.join(artifactRoot, "source-mobile-reporting.structure.json"),
		`${JSON.stringify(capture.mobileReportingSnapshot)}\n`,
	),
	writeFile(
		path.join(artifactRoot, "manifest.json"),
		`${JSON.stringify(
			{
				sourceUrl,
				stylesheets: uniqueStylesheets,
				cssBytes: Buffer.byteLength(sourceCss),
				compositionCssBytes: Buffer.byteLength(compositionCss),
				shellBytes: Buffer.byteLength(shellHtml),
				dashboardBytes: Buffer.byteLength(dashboardHtml),
				fonts: fontManifest,
				images: imageManifest,
			},
			null,
			2,
		)}\n`,
	),
]);

console.log(
	JSON.stringify(
		{
			cssBytes: Buffer.byteLength(sourceCss),
			compositionCssBytes: Buffer.byteLength(compositionCss),
			shellBytes: Buffer.byteLength(shellHtml),
			dashboardBytes: Buffer.byteLength(dashboardHtml),
			fonts: fontManifest.length,
			images: imageManifest.length,
		},
		null,
		2,
	),
);
