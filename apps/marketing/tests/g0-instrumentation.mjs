import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureMatrix } from "../tools/capture-matrix.mjs";
import { comparePngs, createDifferenceMask } from "../tools/diff.mjs";
import { createBrowserSession, wait } from "../tools/driver.mjs";
import { compareStructures } from "../tools/structural-diff.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outputDirectory = path.join(repositoryRoot, ".context/gates/g0");
const matrixDirectory = path.join(
	repositoryRoot,
	".context/reference-shots-v2",
);
const navbarUrl =
	"http://127.0.0.1:4176/next?opaline-source=navbar&opaline-links=rudel";
const integrationUrl = "http://127.0.0.1:4180/lens-attio-lens-aperture";
const canvasDocumentUrl =
	"http://127.0.0.1:4175/build?opaline-source=lens-canvas";

await mkdir(outputDirectory, { recursive: true });

const captureNavbar = async (name, { breakPadding = false } = {}) => {
	const session = await createBrowserSession({
		url: navbarUrl,
		width: 1280,
		height: 800,
		dpr: 1,
	});
	try {
		if (breakPadding) {
			await session.evaluate(`(() => {
				const header = document.querySelector("header");
				if (!header) throw new Error("Navbar header was not found");
				header.style.paddingTop = "1px";
				header.dataset.g0DeliberateBreak = "padding-top";
			})()`);
		}
		const screenshotPath = path.join(outputDirectory, `${name}.png`);
		const snapshotPath = path.join(outputDirectory, `${name}.snapshot.json`);
		await session.screenshot(screenshotPath);
		const snapshot = await session.snapshot({
			gate: "G0",
			fixture: name,
			url: navbarUrl,
		});
		await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);
		return { screenshotPath, snapshotPath, snapshot };
	} finally {
		await session.close();
	}
};

const captureComposition = async (name) => {
	const session = await createBrowserSession({
		url: integrationUrl,
		width: 1280,
		height: 800,
		dpr: 1,
	});
	try {
		await session.completeAperture(1);
		await session.scrollTo(300);
		const compositionFrame = await session.frameByName("lens-build-live");
		await session.evaluate(
			'document.querySelector(\'[data-opaline-use-case="Data model"]\')?.click() ?? document.querySelector("[data-opaline-use-case]")?.click()',
			{ frameId: compositionFrame.id },
		);
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: 1,
			y: 799,
		});
		await wait(3000);
		await session.evaluate(
			"document.querySelector('[data-opaline-use-case=\"Data model\"]')?.click()",
			{ frameId: compositionFrame.id },
		);
		await wait(600);

		const screenshotPath = path.join(outputDirectory, `${name}.png`);
		const hiddenCanvasPath = path.join(
			outputDirectory,
			`${name}.canvas-hidden.png`,
		);
		const canvasMaskPath = path.join(
			outputDirectory,
			`${name}.canvas-mask.png`,
		);
		const canvasMaskReportPath = path.join(
			outputDirectory,
			`${name}.canvas-mask.json`,
		);
		const snapshotPath = path.join(outputDirectory, `${name}.snapshot.json`);

		await session.screenshot(screenshotPath);
		for (const frame of await session.frameTree()) {
			await session.evaluate(
				`(() => {
					const style = document.createElement("style");
					style.dataset.opalineCanvasMask = "";
					style.textContent = "canvas { display: none !important; }";
					(document.head || document.documentElement).append(style);
				})()`,
				{ frameId: frame.id },
			);
		}
		await wait(120);
		await session.screenshot(hiddenCanvasPath);
		const canvasMask = await createDifferenceMask({
			paintedPath: screenshotPath,
			unpaintedPath: hiddenCanvasPath,
			outputPath: canvasMaskPath,
			channelTolerance: 0,
			dilationRadius: 4,
		});
		await writeFile(
			canvasMaskReportPath,
			`${JSON.stringify(canvasMask, null, 2)}\n`,
		);
		for (const frame of await session.frameTree()) {
			await session.evaluate(
				'document.querySelectorAll("style[data-opaline-canvas-mask]").forEach((style) => style.remove())',
				{ frameId: frame.id },
			);
		}
		await wait(120);

		await session.evaluate(
			"document.querySelector('[data-opaline-use-case=\"Data model\"]')?.click()",
			{ frameId: compositionFrame.id },
		);
		await wait(600);
		await session.freezeAtDeterministicState();
		await session.evaluate(
			`(() => {
				for (const element of document.querySelectorAll("*")) {
					if (!getComputedStyle(element).backgroundImage.includes("conic-gradient")) continue;
					if (!element.classList.contains("h-full") || !element.classList.contains("w-full")) continue;
					element.style.setProperty("--angle", "-80deg");
					element.style.setProperty("--x", "0px");
					element.style.setProperty("--y", "13px");
				}
				for (const progress of document.querySelectorAll(".absolute.inset-y-0")) {
					const marker = [...progress.children].find((child) =>
						child.classList.contains("top-1/2"),
					);
					if (!marker) continue;
					progress.style.transform = "scaleX(0.38)";
					marker.style.transform = "scaleX(2.6315789473684212)";
				}
			})()`,
			{ frameId: compositionFrame.id },
		);
		await wait(120);

		const snapshot = await session.snapshot(
			{
				gate: "G0-full-composition",
				fixture: name,
				url: integrationUrl,
			},
			{
				allowMultipleDocuments: true,
				batchSize: 16,
				onProgress: ({ offset, total }) => {
					if (offset % 80 === 0) {
						console.log(
							`  ${name}: computed styles ${Math.min(offset + 80, total)}/${total}`,
						);
					}
				},
			},
		);
		await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);
		return {
			screenshotPath,
			hiddenCanvasPath,
			canvasMaskPath,
			canvasMaskReportPath,
			canvasMask,
			snapshotPath,
			snapshot,
		};
	} finally {
		await session.close();
	}
};

console.log("G0(a): capturing the isolated navbar reference twice");
const first = await captureNavbar("navbar-reference-run-1");
const second = await captureNavbar("navbar-reference-run-2");
const selfStructure = compareStructures(first.snapshot, second.snapshot, {
	rootDescriptions: ["header"],
});
await writeFile(
	path.join(outputDirectory, "self-structural-diff.json"),
	`${JSON.stringify(selfStructure, null, 2)}\n`,
);
if (selfStructure.differenceCount !== 0) {
	throw new Error(
		`G0(a) structural self-diff failed with ${selfStructure.differenceCount} differences`,
	);
}
const selfPixels = await comparePngs({
	leftPath: first.screenshotPath,
	rightPath: second.screenshotPath,
	diffPath: path.join(outputDirectory, "self-pixel-diff.png"),
	masks: [{ x: 0, y: 74, width: 1280, height: 726 }],
	exact: true,
});
await writeFile(
	path.join(outputDirectory, "self-pixel-diff.json"),
	`${JSON.stringify(selfPixels, null, 2)}\n`,
);
if (selfPixels.diffPercent > 0.1) {
	throw new Error(
		`G0(a) pixel self-diff was ${selfPixels.diffPercent.toFixed(4)}%`,
	);
}

console.log("G0(b): proving that a one-pixel padding break is named");
const broken = await captureNavbar("navbar-deliberate-padding-break", {
	breakPadding: true,
});
const brokenStructure = compareStructures(first.snapshot, broken.snapshot, {
	rootDescriptions: ["header"],
});
await writeFile(
	path.join(outputDirectory, "deliberate-break-structural-diff.json"),
	`${JSON.stringify(brokenStructure, null, 2)}\n`,
);
const namedPaddingBreak = brokenStructure.differences.some(
	(difference) =>
		difference.type === "style" &&
		difference.node.startsWith("header") &&
		difference.property === "padding-top" &&
		difference.left === "0px" &&
		difference.right === "1px",
);
if (!namedPaddingBreak) {
	throw new Error(
		"G0(b) failed: the structural report did not name header padding-top 0px → 1px",
	);
}

console.log(
	"G0(full): proving structural and canvas-masked pixel determinism on the composed route",
);
const fullFirst = await captureComposition("full-reference-run-1");
const fullSecond = await captureComposition("full-reference-run-2");
const fullStructure = compareStructures(
	fullFirst.snapshot,
	fullSecond.snapshot,
	{
		excludeDocumentUrls: [canvasDocumentUrl],
		viewportOnly: true,
		excludeDescendantsOfAttributes: [
			"data-opaline-scene-controller",
			"data-opaline-claude-window",
		],
	},
);
await writeFile(
	path.join(outputDirectory, "full-self-structural-diff.json"),
	`${JSON.stringify(fullStructure, null, 2)}\n`,
);
if (fullStructure.differenceCount !== 0) {
	throw new Error(
		`G0(full) structural self-diff failed with ${fullStructure.differenceCount} differences`,
	);
}
const fullPixels = await comparePngs({
	leftPath: fullFirst.screenshotPath,
	rightPath: fullSecond.screenshotPath,
	diffPath: path.join(outputDirectory, "full-self-pixel-diff.png"),
	maskPngPaths: [fullFirst.canvasMaskPath, fullSecond.canvasMaskPath],
	exact: true,
});
await writeFile(
	path.join(outputDirectory, "full-self-pixel-diff.json"),
	`${JSON.stringify(fullPixels, null, 2)}\n`,
);
if (fullPixels.comparedPixels < 1280 * 800 * 0.2) {
	throw new Error(
		`G0(full) canvas mask left only ${fullPixels.comparedPixels} comparable pixels`,
	);
}
if (fullPixels.diffPercent > 0.1) {
	throw new Error(
		`G0(full) canvas-masked pixel self-diff was ${fullPixels.diffPercent.toFixed(4)}%`,
	);
}

console.log("G0(c): capturing the fresh non-blank integration matrix");
const reuseReferenceMatrix = process.env.G0_REUSE_REFERENCE_MATRIX === "1";
const matrix = reuseReferenceMatrix
	? JSON.parse(
			await readFile(path.join(matrixDirectory, "matrix.json"), "utf8"),
		)
	: await captureMatrix({
			url: integrationUrl,
			outputDirectory: matrixDirectory,
		});
if (matrix.url !== integrationUrl) {
	throw new Error(`G0(c) matrix URL mismatch: ${matrix.url}`);
}
if (Date.now() - Date.parse(matrix.capturedAt) > 60 * 60 * 1000) {
	throw new Error("G0(c) refused to reuse a matrix older than one hour");
}

const specialRenderShots = matrix.shots.filter((shot) =>
	["reduced-motion", "js-disabled"].includes(shot.state),
);
const rawNoJsShots = matrix.shots.filter(
	(shot) => shot.state === "js-disabled-reference-raw",
);
for (const viewport of matrix.viewports) {
	for (const state of [
		"reduced-motion",
		"js-disabled",
		"js-disabled-reference-raw",
	]) {
		if (
			![...specialRenderShots, ...rawNoJsShots].some(
				(shot) => shot.viewport === viewport.name && shot.state === state,
			)
		) {
			throw new Error(`G0(c) is missing ${viewport.name}-${state}`);
		}
	}
}
if (
	matrix.shots.some(
		(shot) => !Array.isArray(shot.scenario) || typeof shot.scrollY !== "number",
	)
) {
	throw new Error("G0(c) produced a shot without replayable input metadata");
}
const phoneSectionAudit = matrix.responsiveAudits.phone?.sections;
if (!phoneSectionAudit) {
	throw new Error("G0(c) did not record the phone section audit");
}
const unexplainedPhoneSections = phoneSectionAudit.hidden.filter(
	(section) =>
		section.height > 1 &&
		section.top > 0 &&
		section.display !== "none" &&
		section.visibility !== "hidden",
);
if (unexplainedPhoneSections.length > 0) {
	throw new Error(
		`G0(c) found ${unexplainedPhoneSections.length} unexplained phone sections`,
	);
}
const tabletAuxiliaryAudit = matrix.responsiveAudits.tablet?.auxiliaryWindows;
if (!tabletAuxiliaryAudit) {
	throw new Error("G0(c) did not record the tablet auxiliary-window audit");
}
if (tabletAuxiliaryAudit.visibleCount > 0 && !tabletAuxiliaryAudit.drag) {
	throw new Error(
		"G0(c) found a visible tablet auxiliary window but did not exercise drag",
	);
}

const report = {
	gate: "G0",
	passed: true,
	selfStructuralDifferences: selfStructure.differenceCount,
	selfPixelDifferencePercent: selfPixels.diffPercent,
	fullCompositionStructuralDifferences: fullStructure.differenceCount,
	fullCompositionPixelDifferencePercent: fullPixels.diffPercent,
	fullCompositionComparedPixels: fullPixels.comparedPixels,
	fullCompositionExcludedDocuments: fullStructure.excludedDocuments,
	fullCompositionExcludedSubtrees: fullStructure.excludedSubtrees,
	fullCompositionNormalizations: [
		"default Data model use-case selected",
		"reference scripts disabled and CSS/Web Animations cancelled",
		"pointer-reactive conic-gradient variables pinned",
		"use-case progress marker pinned to 38%",
		"structural comparison scoped to the captured viewport; the state matrix covers later anchors",
	],
	canvasMaskPercent: [
		fullFirst.canvasMask.maskedPercent,
		fullSecond.canvasMask.maskedPercent,
	],
	deliberateBreakDifferences: brokenStructure.differenceCount,
	namedPaddingBreak,
	referenceShots: matrix.shots.length,
	referenceMatrixReused: reuseReferenceMatrix,
	specialRenderShots: specialRenderShots.length,
	rawNoJsReferenceShots: rawNoJsShots.length,
	phoneSectionAudit,
	tabletAuxiliaryAudit,
	artifacts: {
		instrument: path.relative(repositoryRoot, outputDirectory),
		matrix: path.relative(repositoryRoot, matrixDirectory),
	},
};
await writeFile(
	path.join(outputDirectory, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
