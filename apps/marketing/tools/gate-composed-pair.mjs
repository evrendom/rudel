import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const component = process.env.OPALINE_COMPONENT_GATE ?? "current";
const outputRoot = path.resolve(
	marketingRoot,
	`../../.context/gates/composed/${component}`,
);
const referenceUrl =
	process.env.OPALINE_REFERENCE_URL ??
	"http://127.0.0.1:4180/lens-attio-lens-aperture";
const candidateUrl =
	process.env.OPALINE_CANDIDATE_URL ?? "http://127.0.0.1:4321/";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };
const states = [
	{ name: "desktop-top", scrollY: 0 },
	{ name: "hero-focus", scrollY: 500 },
];
const canvasSuppressed = process.env.OPALINE_INCLUDE_CANVAS !== "true";
const canvasSuppression = `(() => {
	const style = document.createElement("style");
	style.dataset.opalineComposedCanvasSuppression = "";
	style.textContent = [
		"canvas",
		".canvas-fallback",
		"#lens-attio-canvas-source",
		"iframe[title='Opaline animated canvas']",
	].join(",") + " { visibility: hidden !important; }";
	document.head.append(style);
})()`;
const canvasTimeStabilizer = `(() => {
	const install = (Context) => {
		const prototype = Context.prototype;
		const originalGetUniformLocation = prototype.getUniformLocation;
		const originalUniform1f = prototype.uniform1f;
		const names = new WeakMap();
		prototype.getUniformLocation = function(program, name) {
			const location = originalGetUniformLocation.call(this, program, name);
			if (location) names.set(location, name);
			return location;
		};
		prototype.uniform1f = function(location, value) {
			return originalUniform1f.call(
				this,
				location,
				names.get(location) === "time" ? 0 : value,
			);
		};
	};
	for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
		if (Context) install(Context);
	}
})();`;
const auditExpression = `(() => {
	const button = [...document.querySelectorAll("a, button")]
		.find((element) => element.textContent?.trim() === "Request a demo");
	const title = document.querySelector("h1");
	const dashboard = document.querySelector(
		"[data-dashboard-shell], [data-home-hero=attio-window-shell]",
	);
	const dashboardParts = [...document.querySelectorAll("[data-opaline-dashboard-part]")];
	const describe = (element) => {
		if (!(element instanceof HTMLElement)) return null;
		const bounds = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return {
			text: element.textContent?.replace(/\\s+/g, " ").trim() ?? "",
			rect: {
				x: Number(bounds.x.toFixed(3)),
				y: Number(bounds.y.toFixed(3)),
				width: Number(bounds.width.toFixed(3)),
				height: Number(bounds.height.toFixed(3)),
			},
			display: style.display,
			opacity: style.opacity,
			color: style.color,
			backgroundColor: style.backgroundColor,
			transform: style.transform,
		};
	};
	return {
		url: location.href,
		scrollY,
		button: describe(button),
		title: describe(title),
		dashboard: describe(dashboard),
		dashboardParts: dashboardParts.map((element) => ({
			part: element.getAttribute("data-opaline-dashboard-part"),
			...describe(element),
		})),
		buttonVariables: button instanceof HTMLElement ? {
			buttonForeground: getComputedStyle(button).getPropertyValue("--button-fg"),
			onInvertedForeground: getComputedStyle(button).getPropertyValue("--color-on-inverted-foreground"),
			fontFamily: getComputedStyle(button).fontFamily,
			fontSize: getComputedStyle(button).fontSize,
		} : null,
	};
})()`;

const capture = async ({ url, label }) => {
	const session = await createBrowserSession(viewport);
	try {
		if (!canvasSuppressed) {
			await session.client.call("Page.addScriptToEvaluateOnNewDocument", {
				source: canvasTimeStabilizer,
			});
		}
		await session.navigate(url);
		await session.completeAperture(1);
		await session.scrollTo(500);
		await wait(500);
		await session.scrollTo(0);
		await wait(500);
		if (canvasSuppressed) {
			for (const frame of await session.frameTree()) {
				await session.evaluate(canvasSuppression, { frameId: frame.id });
			}
		}
		const captures = [];
		for (const state of states) {
			await session.scrollTo(state.scrollY);
			await wait(state.name === "desktop-top" ? 1000 : 500);
			const screenshotPath = path.join(
				outputRoot,
				`${state.name}-${label}.png`,
			);
			await session.screenshot(screenshotPath);
			const frameAudits = [];
			for (const frame of await session.frameTree()) {
				frameAudits.push({
					frame: {
						id: frame.id,
						name: frame.name,
						url: frame.url,
						depth: frame.depth,
					},
					audit: await session.evaluate(auditExpression, {
						frameId: frame.id,
					}),
				});
			}
			captures.push({ ...state, screenshotPath, frameAudits });
		}
		return captures;
	} finally {
		await session.close();
	}
};

await mkdir(outputRoot, { recursive: true });
const reference = await capture({ url: referenceUrl, label: "reference" });
const candidate = await capture({ url: candidateUrl, label: "candidate" });
const results = [];
for (const state of states) {
	const source = reference.find((capture) => capture.name === state.name);
	const target = candidate.find((capture) => capture.name === state.name);
	const pixel = await comparePngs({
		leftPath: source.screenshotPath,
		rightPath: target.screenshotPath,
		diffPath: path.join(outputRoot, `${state.name}-diff.png`),
	});
	results.push({
		state: state.name,
		pixel,
		reference: source,
		candidate: target,
	});
	console.log(`${state.name}: ${pixel.diffPercent.toFixed(6)}% pixels`);
}

await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(
		{
			gate: `composed-${component}`,
			generatedAt: new Date().toISOString(),
			referenceUrl,
			candidateUrl,
			viewport,
			canvasSuppressed,
			results,
		},
		null,
		2,
	)}\n`,
);
