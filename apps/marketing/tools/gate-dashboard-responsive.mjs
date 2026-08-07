import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs, createDifferenceMask } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/dashboard/responsive",
);
const referenceUrl =
	"http://127.0.0.1:4180/?opaline-composition=lens-attio-lens";
const extractedUrl = "http://127.0.0.1:4321/preview/dashboard";
const naturalizedUrl =
	"http://127.0.0.1:4321/preview/dashboard-naturalized";
const viewports = [
	{ name: "tablet", width: 768, height: 1024, dpr: 1, mobile: false },
	{ name: "wide", width: 1680, height: 1050, dpr: 1, mobile: false },
];
const scenes = [
	{ id: "Data model", slug: "data" },
	{ id: "Reporting", slug: "reporting" },
];

const auditExpression = `(() => {
	const shell = document.querySelector(
		"#dashboard-gate-source-overlay [data-home-hero=attio-window-shell], #dashboard-gate-source-overlay [data-opaline-dashboard-part=attio-window-shell]",
	);
	const panel = shell?.querySelector(
		"[data-home-hero-preview-tab], [data-opaline-dashboard-panel]",
	);
	const scaleWrapper = panel?.firstElementChild?.firstElementChild?.firstElementChild;
	const grid = scaleWrapper?.firstElementChild;
	const rect = (element) => {
		if (!(element instanceof HTMLElement)) return null;
		const value = element.getBoundingClientRect();
		return Object.fromEntries(
			["x", "y", "width", "height"].map((key) => [key, Number(value[key].toFixed(4))]),
		);
	};
	const styles = (element) => {
		if (!(element instanceof HTMLElement)) return null;
		const computed = getComputedStyle(element);
		return Object.fromEntries(
			["display", "grid-template-columns", "grid-template-rows", "height", "transform", "transform-origin", "width"]
				.map((property) => [property, computed.getPropertyValue(property)]),
		);
	};
	return {
		shell: rect(shell),
		panel: rect(panel),
		scaleWrapper: rect(scaleWrapper),
		grid: rect(grid),
		scaleWrapperClass: scaleWrapper?.className ?? null,
		scaleWrapperInlineStyle: scaleWrapper?.getAttribute("style") ?? null,
		scaleWrapperStyles: styles(scaleWrapper),
		gridStyles: styles(grid),
		elementCount: shell?.querySelectorAll("*").length ?? 0,
		text: shell?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
	};
})()`;

const capture = async ({ url, viewport, scene, label, liveReference = false }) => {
	const session = await createBrowserSession({ url, ...viewport });
	try {
		if (liveReference) {
			await session.waitFor(
				'document.querySelector("[data-home-hero=attio-window-shell][data-opaline-scene-ready]")',
			);
			await session.evaluate("scrollTo(0, 400)");
			await wait(1_750);
		} else {
			await session.waitFor(
				'document.querySelector("#dashboard-gate-source-overlay")?.getBoundingClientRect().height > 0',
			);
		}

		if (scene.id !== "Data model") {
			await session.evaluate(
				`document.querySelector(${JSON.stringify(`[data-opaline-use-case="${scene.id}"]`)})?.click()`,
			);
			await session.waitFor(
				`[...document.querySelectorAll("[data-home-hero-preview-tab], [data-opaline-dashboard-panel]")].some((panel) => (panel.getAttribute("data-home-hero-preview-tab") ?? panel.getAttribute("data-opaline-dashboard-panel")) === ${JSON.stringify(scene.id)})`,
			);
			await wait(liveReference ? 1_200 : 350);
		}

		if (liveReference) {
			await session.evaluate(`(() => {
				const shell = document.querySelector("[data-home-hero=attio-window-shell]");
				const dashboard = shell?.parentElement;
				if (!(dashboard instanceof HTMLElement)) throw new Error("Dashboard source is unavailable");
				const overlay = document.createElement("div");
				overlay.id = "dashboard-gate-source-overlay";
				overlay.innerHTML = '<main><section><div class="dashboard-gate-stage"></div></section></main>';
				overlay.querySelector(".dashboard-gate-stage").append(dashboard.cloneNode(true));
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
			})()`);
		}

		await session.waitFor(
			'[...document.querySelectorAll("#dashboard-gate-source-overlay img")].filter((image) => image.getBoundingClientRect().width > 0 && image.getBoundingClientRect().height > 0).every((image) => image.complete && image.naturalWidth > 0)',
		);
		await wait(250);
		await session.freezeAtDeterministicState();
		const screenshotPath = path.join(
			outputRoot,
			`${viewport.name}-${scene.slug}-${label}.png`,
		);
		await session.screenshot(screenshotPath);
		return {
			screenshotPath,
			audit: await session.evaluate(auditExpression),
		};
	} finally {
		await session.close();
	}
};

const finiteDifference = (left, right) =>
	Math.abs(Number(left) - Number(right));
const compareAudits = (source, candidate) => {
	const geometryDifferences = [];
	for (const part of ["shell", "panel", "scaleWrapper", "grid"]) {
		for (const property of ["x", "y", "width", "height"]) {
			const difference = finiteDifference(
				source[part]?.[property],
				candidate[part]?.[property],
			);
			if (difference > 0.5) {
				geometryDifferences.push({
					part,
					property,
					source: source[part]?.[property],
					candidate: candidate[part]?.[property],
					difference,
				});
			}
		}
	}
	return {
		geometryDifferences,
		elementCountMatches: source.elementCount === candidate.elementCount,
		textMatches: source.text === candidate.text,
		passed:
			geometryDifferences.length === 0 &&
			source.elementCount === candidate.elementCount &&
			source.text === candidate.text,
	};
};

await mkdir(outputRoot, { recursive: true });
const results = [];
for (const viewport of viewports) {
	for (const scene of scenes) {
		const reference = await capture({
			url: referenceUrl,
			viewport,
			scene,
			label: "reference",
			liveReference: true,
		});
		const referenceControl = await capture({
			url: referenceUrl,
			viewport,
			scene,
			label: "reference-control",
			liveReference: true,
		});
		const extracted = await capture({
			url: extractedUrl,
			viewport,
			scene,
			label: "extracted",
		});
		const naturalized = await capture({
			url: naturalizedUrl,
			viewport,
			scene,
			label: "naturalized",
		});
		const animationMaskPath = path.join(
			outputRoot,
			`${viewport.name}-${scene.slug}-reference-animation-mask.png`,
		);
		const animationMask = await createDifferenceMask({
			paintedPath: reference.screenshotPath,
			unpaintedPath: referenceControl.screenshotPath,
			outputPath: animationMaskPath,
			channelTolerance: 2,
			dilationRadius: 1,
		});
		const referenceSelfPixel = await comparePngs({
			leftPath: reference.screenshotPath,
			rightPath: referenceControl.screenshotPath,
			diffPath: path.join(
				outputRoot,
				`${viewport.name}-${scene.slug}-reference-self-diff.png`,
			),
		});
		const g1Pixel = await comparePngs({
			leftPath: reference.screenshotPath,
			rightPath: extracted.screenshotPath,
			diffPath: path.join(
				outputRoot,
				`${viewport.name}-${scene.slug}-g1-diff.png`,
			),
			maskPngPaths: [animationMaskPath],
		});
		const g2Pixel = await comparePngs({
			leftPath: extracted.screenshotPath,
			rightPath: naturalized.screenshotPath,
			diffPath: path.join(
				outputRoot,
				`${viewport.name}-${scene.slug}-g2-diff.png`,
			),
			exact: true,
		});
		const g1Audit = compareAudits(reference.audit, extracted.audit);
		const g2Audit = compareAudits(extracted.audit, naturalized.audit);
		const result = {
			viewport: viewport.name,
			scene: scene.id,
			g1: {
				pixel: g1Pixel,
				audit: g1Audit,
				referenceSelfPixel,
				animationMask,
				passed: g1Pixel.diffPercent <= 0.1 && g1Audit.passed,
			},
			g2: {
				pixel: g2Pixel,
				audit: g2Audit,
				passed: g2Pixel.differingPixels === 0 && g2Audit.passed,
			},
			audits: {
				reference: reference.audit,
				extracted: extracted.audit,
				naturalized: naturalized.audit,
			},
			artifacts: {
				reference: reference.screenshotPath,
				referenceControl: referenceControl.screenshotPath,
				extracted: extracted.screenshotPath,
				naturalized: naturalized.screenshotPath,
				animationMask: animationMaskPath,
			},
		};
		results.push(result);
		console.log(
			`${viewport.name} ${scene.id}: G1 ${g1Pixel.diffPercent.toFixed(6)}%, G2 ${g2Pixel.differingPixels}px`,
		);
	}
}

const report = {
	gate: "G1/G2-dashboard-responsive",
	generatedAt: new Date().toISOString(),
	referenceUrl,
	extractedUrl,
	naturalizedUrl,
	viewports,
	thresholds: {
		g1MaximumPixelDifferencePercent: 0.1,
		g2DifferingPixels: 0,
		geometryTolerancePx: 0.5,
	},
	passed: results.every((result) => result.g1.passed && result.g2.passed),
	results,
};
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
if (!report.passed) process.exitCode = 1;
