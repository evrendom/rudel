import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";
import { compareStructures } from "./structural-diff.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const artifactRoot = path.resolve(
	marketingRoot,
	"../../.context/extractions/dashboard",
);
const viewport = { width: 390, height: 844, dpr: 1, mobile: true };
const scenes = [
	{
		id: "Data model",
		slug: "data",
		route: "dashboard-mobile",
		naturalizedRoute: "dashboard-mobile-naturalized",
	},
	{
		id: "Reporting",
		slug: "reporting",
		route: "dashboard-mobile-reporting",
		naturalizedRoute: "dashboard-mobile-reporting-naturalized",
	},
];

const capture = async (url, outputRoot, label) => {
	const session = await createBrowserSession({ url, ...viewport });
	try {
		await session.waitFor(
			'document.querySelector("#dashboard-mobile-gate-source-overlay")?.getBoundingClientRect().height > 0',
		);
		await session.waitFor(
			"[...document.images].filter((image) => image.getBoundingClientRect().width > 0).every((image) => image.complete && image.naturalWidth > 0)",
		);
		await wait(200);
		const screenshotPath = path.join(outputRoot, `${label}.png`);
		await session.screenshot(screenshotPath);
		await session.freezeAtDeterministicState();
		const snapshot = await session.snapshot({
			component: "dashboard-mobile",
			url,
		});
		const snapshotPath = path.join(outputRoot, `${label}.structure.json`);
		await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);
		return { screenshotPath, snapshotPath, snapshot };
	} finally {
		await session.close();
	}
};

const filterSnapshotArtifacts = (differences) =>
	differences.filter((difference) => {
		if (
			difference.type === "node" &&
			(difference.left === "#text" || difference.right === "#text")
		)
			return false;
		if (difference.node === "#text") return false;
		if (difference.type === "style" && difference.property === "transform") {
			const left = difference.left.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
			const right =
				difference.right.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
			if (
				left.length === right.length &&
				left.every((value, index) => Math.abs(value - right[index]) <= 0.00001)
			)
				return false;
		}
		if (
			difference.type === "style" &&
			[
				"grid-template-columns",
				"inset-inline-start",
				"inline-size",
				"left",
				"perspective-origin",
				"transform-origin",
				"width",
			].includes(difference.property)
		) {
			const left = difference.left.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
			const right =
				difference.right.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
			if (
				left.length === right.length &&
				left.every((value, index) => Math.abs(value - right[index]) <= 0.05)
			)
				return false;
		}
		return true;
	});

const g1Root = path.resolve(
	marketingRoot,
	"../../.context/gates/dashboard/g1-mobile",
);
await mkdir(g1Root, { recursive: true });
const g1Results = [];
for (const scene of scenes) {
	const sourceScreenshotPath = path.join(
		artifactRoot,
		`source-mobile-${scene.slug}-normalized.png`,
	);
	const sourceSnapshotPath = path.join(
		artifactRoot,
		`source-mobile-${scene.slug}.structure.json`,
	);
	const sourceSnapshot = JSON.parse(await readFile(sourceSnapshotPath, "utf8"));
	const candidate = await capture(
		`http://127.0.0.1:4321/preview/${scene.route}`,
		g1Root,
		`${scene.slug}-candidate`,
	);
	const pixel = await comparePngs({
		leftPath: sourceScreenshotPath,
		rightPath: candidate.screenshotPath,
		diffPath: path.join(g1Root, `${scene.slug}-diff.png`),
		exact: false,
	});
	const structural = compareStructures(sourceSnapshot, candidate.snapshot, {
		geometryTolerance: 0.5,
		rootDescriptions: ["div#dashboard-mobile-gate-source-overlay"],
	});
	const structuralDifferences = filterSnapshotArtifacts(structural.differences);
	g1Results.push({
		scene: scene.id,
		pixel,
		structuralDifferenceCount: structuralDifferences.length,
		structuralDifferences,
		excludedTextLayoutFragmentCount:
			structural.differences.length - structuralDifferences.length,
	});
	console.log(
		`G1 mobile ${scene.id}: ${pixel.diffPercent.toFixed(6)}% pixels, ${structuralDifferences.length} structural`,
	);
}
const g1Report = {
	gate: "G1-dashboard-mobile",
	generatedAt: new Date().toISOString(),
	viewport,
	thresholds: { maximumPixelDifferencePercent: 0.1, structuralDifferences: 0 },
	passed: g1Results.every(
		(result) =>
			result.pixel.diffPercent <= 0.1 && result.structuralDifferenceCount === 0,
	),
	results: g1Results,
};
await writeFile(
	path.join(g1Root, "report.json"),
	`${JSON.stringify(g1Report, null, 2)}\n`,
);

const g2Root = path.resolve(
	marketingRoot,
	"../../.context/gates/dashboard/g2-mobile",
);
await mkdir(g2Root, { recursive: true });
const g2Results = [];
for (const scene of scenes) {
	const source = await capture(
		`http://127.0.0.1:4321/preview/${scene.route}`,
		g2Root,
		`${scene.slug}-source`,
	);
	const candidate = await capture(
		`http://127.0.0.1:4321/preview/${scene.naturalizedRoute}`,
		g2Root,
		`${scene.slug}-candidate`,
	);
	const pixel = await comparePngs({
		leftPath: source.screenshotPath,
		rightPath: candidate.screenshotPath,
		diffPath: path.join(g2Root, `${scene.slug}-diff.png`),
		exact: true,
	});
	const structural = compareStructures(source.snapshot, candidate.snapshot, {
		geometryTolerance: 0,
		rootDescriptions: ["div#dashboard-mobile-gate-source-overlay"],
	});
	g2Results.push({
		scene: scene.id,
		pixel,
		structuralDifferenceCount: structural.differenceCount,
		structuralDifferences: structural.differences,
	});
	console.log(
		`G2 mobile ${scene.id}: ${pixel.differingPixels} pixels, ${structural.differenceCount} structural`,
	);
}
const g2Report = {
	gate: "G2-dashboard-mobile",
	generatedAt: new Date().toISOString(),
	viewport,
	thresholds: { differingPixels: 0, structuralDifferences: 0 },
	passed: g2Results.every(
		(result) =>
			result.pixel.differingPixels === 0 &&
			result.structuralDifferenceCount === 0,
	),
	results: g2Results,
};
await writeFile(
	path.join(g2Root, "report.json"),
	`${JSON.stringify(g2Report, null, 2)}\n`,
);
if (!g1Report.passed || !g2Report.passed) process.exitCode = 1;
