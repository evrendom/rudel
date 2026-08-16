import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/hero-canvas/g1",
);
const candidateUrl =
	"http://127.0.0.1:4321/preview/hero-canvas?opaline-canvas-time=0";
const viewports = [
	{ name: "phone", width: 390, height: 844, dpr: 1, mobile: true },
	{ name: "tablet", width: 768, height: 1024, dpr: 1, mobile: false },
	{ name: "desktop", width: 1280, height: 800, dpr: 1, mobile: false },
	{ name: "wide", width: 1680, height: 1050, dpr: 1, mobile: false },
];
const results = [];

for (const viewport of viewports) {
	const sourceScreenshot = path.join(
		outputRoot,
		`source-first-frame-${viewport.name}.png`,
	);
	const candidateScreenshot = path.join(
		outputRoot,
		`candidate-first-frame-${viewport.name}.png`,
	);
	const diffPath = path.join(outputRoot, `diff-${viewport.name}.png`);
	const session = await createBrowserSession({
		url: candidateUrl,
		...viewport,
	});
	let audit;
	try {
		await session.waitFor(
			'document.querySelector("[data-hero-canvas-stage]")?.hasAttribute("data-canvas-ready")',
			{ timeout: 10_000 },
		);
		await wait(100);
		audit = await session.evaluate(`(() => {
			const canvas = document.querySelector("[data-hero-canvas]");
			const bounds = canvas.getBoundingClientRect();
			return {
				bitmap: { width: canvas.width, height: canvas.height },
				bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
				ready: canvas.closest("[data-hero-canvas-stage]")?.hasAttribute("data-canvas-ready") ?? false,
			};
		})()`);
		await session.screenshot(candidateScreenshot);
	} finally {
		await session.close();
	}
	const pixel = await comparePngs({
		leftPath: sourceScreenshot,
		rightPath: candidateScreenshot,
		diffPath,
	});
	results.push({
		viewport,
		passed: pixel.diffPercent <= 0.1,
		pixel,
		audit,
		artifacts: { sourceScreenshot, candidateScreenshot, diffPath },
	});
	console.log(`${viewport.name}: ${pixel.diffPercent.toFixed(6)}% pixels`);
}

const report = {
	gate: "G1-hero-canvas-first-frame",
	generatedAt: new Date().toISOString(),
	sourceUrl: "http://127.0.0.1:4175/__lens-atoms/hero?opaline-layer=canvas",
	candidateUrl,
	threshold: { maximumPixelDifferencePercent: 0.1 },
	passed: results.every(({ passed }) => passed),
	results,
};
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
if (!report.passed) process.exitCode = 1;
