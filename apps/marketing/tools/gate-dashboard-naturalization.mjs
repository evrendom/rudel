import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";
import { compareStructures } from "./structural-diff.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/dashboard/g2",
);
const sourceUrl = "http://127.0.0.1:4321/preview/dashboard";
const candidateUrl =
	"http://127.0.0.1:4321/preview/dashboard-naturalized";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };
const scenes = [
	{ id: "Data model", slug: "data" },
	{ id: "Reporting", slug: "reporting" },
];

const capture = async (url, scene, label) => {
	const session = await createBrowserSession({ url, ...viewport });
	try {
		await session.waitFor(
			'document.querySelector("#dashboard-gate-source-overlay")?.getBoundingClientRect().height > 0',
		);
		if (scene.id !== "Data model") {
			await session.evaluate(
				`document.querySelector(${JSON.stringify(`[data-opaline-use-case="${scene.id}"]`)})?.click()`,
			);
			await session.waitFor(
				`document.querySelector("[data-home-hero-preview-tab], [data-opaline-dashboard-panel]")?.getAttribute("data-home-hero-preview-tab") === ${JSON.stringify(scene.id)} || document.querySelector("[data-opaline-dashboard-panel]")?.getAttribute("data-opaline-dashboard-panel") === ${JSON.stringify(scene.id)}`,
			);
		}
		await session.waitFor(
			"[...document.images].every((image) => image.complete && image.naturalWidth > 0)",
		);
		await wait(250);
		await session.freezeAtDeterministicState();
		const screenshotPath = path.join(outputRoot, `${scene.slug}-${label}.png`);
		await session.screenshot(screenshotPath);
		const snapshot = await session.snapshot({
			component: "dashboard",
			scene: scene.id,
			url,
		});
		const snapshotPath = path.join(
			outputRoot,
			`${scene.slug}-${label}.structure.json`,
		);
		await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);
		return { screenshotPath, snapshotPath, snapshot };
	} finally {
		await session.close();
	}
};

await mkdir(outputRoot, { recursive: true });
const results = [];
for (const scene of scenes) {
	const source = await capture(sourceUrl, scene, "source");
	const candidate = await capture(candidateUrl, scene, "candidate");
	const pixel = await comparePngs({
		leftPath: source.screenshotPath,
		rightPath: candidate.screenshotPath,
		diffPath: path.join(outputRoot, `${scene.slug}-diff.png`),
		exact: true,
	});
	const structural = compareStructures(source.snapshot, candidate.snapshot, {
		geometryTolerance: 0,
		rootDescriptions: ["div#dashboard-gate-source-overlay"],
	});
	results.push({
		scene: scene.id,
		pixel,
		structuralDifferenceCount: structural.differenceCount,
		structuralDifferences: structural.differences,
		artifacts: {
			sourceScreenshot: source.screenshotPath,
			candidateScreenshot: candidate.screenshotPath,
			sourceSnapshot: source.snapshotPath,
			candidateSnapshot: candidate.snapshotPath,
		},
	});
	console.log(
		`${scene.id}: ${pixel.differingPixels} pixels, ${structural.differenceCount} structural`,
	);
}

const report = {
	gate: "G2-dashboard",
	generatedAt: new Date().toISOString(),
	sourceUrl,
	candidateUrl,
	viewport,
	thresholds: { differingPixels: 0, structuralDifferences: 0 },
	passed: results.every(
		(result) =>
			result.pixel.differingPixels === 0 &&
			result.structuralDifferenceCount === 0,
	),
	results,
};
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
if (!report.passed) process.exitCode = 1;
