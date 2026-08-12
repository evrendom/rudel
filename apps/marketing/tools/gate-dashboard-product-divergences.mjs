import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

const tracePath = path.resolve(
	".context/extractions/dashboard/product-divergences/trace.json",
);
const outputRoot = path.resolve(
	".context/gates/composed/dashboard-product-divergences",
);
const reportPath = path.join(outputRoot, "report.json");
const publicRoot = path.resolve("apps/marketing/public");
const geometryTolerance = 0.1;
const trace = JSON.parse(await readFile(tracePath, "utf8"));

const maximumZIndex = (windows) =>
	Math.max(...windows.map((window) => window.zIndex));
const selectedWindow = (windows, id) =>
	windows.find((window) => window.id === id);

const dragResults = trace.drags.map((drag) => {
	const error = {
		x: Math.abs(drag.requestedDelta.x - drag.actualDelta.x),
		y: Math.abs(drag.requestedDelta.y - drag.actualDelta.y),
	};
	const selected = selectedWindow(drag.stack, drag.id);
	return {
		...drag,
		error,
		raisedToTop: selected?.zIndex === maximumZIndex(drag.stack),
		passed:
			error.x <= geometryTolerance &&
			error.y <= geometryTolerance &&
			drag.after.dragX === drag.requestedDelta.x &&
			drag.after.dragY === drag.requestedDelta.y &&
			selected?.zIndex === maximumZIndex(drag.stack),
	};
});

const focusResults = trace.focusAndClick.sequence.map((step) => {
	const before = selectedWindow(step.before, step.id);
	const pressed = selectedWindow(step.pressed, step.id);
	return {
		id: step.id,
		beforeZIndex: before?.zIndex ?? null,
		pressedZIndex: pressed?.zIndex ?? null,
		pressedMaximumZIndex: maximumZIndex(step.pressed),
		zOrderBefore: step.before.map((window) => ({
			id: window.id,
			zIndex: window.zIndex,
		})),
		zOrderPressed: step.pressed.map((window) => ({
			id: window.id,
			zIndex: window.zIndex,
		})),
		paintStack: step.paintStack,
		changed: before?.zIndex !== pressed?.zIndex,
		raisedToTop: pressed?.zIndex === maximumZIndex(step.pressed),
		paintedOnTop: step.paintStack?.windowOrder[0] === step.id,
		passed:
			before?.zIndex !== pressed?.zIndex &&
			pressed?.zIndex === maximumZIndex(step.pressed) &&
			step.paintStack?.windowOrder[0] === step.id,
	};
});

const mainClick = trace.focusAndClick.mainContentClick;
const mainBeforeClick = selectedWindow(mainClick.before, "main");
const mainAfterClick = selectedWindow(mainClick.after, "main");
const mainPressedClick = selectedWindow(mainClick.pressed, "main");
const mainContentClick = {
	result: mainClick.result,
	positionDelta: {
		x: mainAfterClick.rect.x - mainBeforeClick.rect.x,
		y: mainAfterClick.rect.y - mainBeforeClick.rect.y,
	},
	raisedOnPointerDown:
		mainPressedClick.zIndex === maximumZIndex(mainClick.pressed),
	passed:
		mainClick.result.selected === "true" &&
		mainClick.result.panel === "Reporting" &&
		Math.abs(mainAfterClick.rect.x - mainBeforeClick.rect.x) <=
			geometryTolerance &&
		Math.abs(mainAfterClick.rect.y - mainBeforeClick.rect.y) <=
			geometryTolerance &&
		mainPressedClick.zIndex === maximumZIndex(mainClick.pressed),
};

const dpr2Results = [];
for (const capture of trace.dpr2) {
	const assetUrl = new URL(capture.audit.currentSrc);
	const assetPath = path.join(publicRoot, assetUrl.pathname);
	const png = PNG.sync.read(await readFile(assetPath));
	const density = {
		x: png.width / capture.audit.rendered.width,
		y: png.height / capture.audit.rendered.height,
	};
	dpr2Results.push({
		...capture,
		assetPath,
		assetPixelSize: { width: png.width, height: png.height },
		density,
		passed:
			capture.audit.devicePixelRatio === 2 &&
			assetUrl.pathname.endsWith("-branded@3x.png") &&
			Number.isFinite(density.x) &&
			Number.isFinite(density.y) &&
			density.x >= 2.9 &&
			density.y >= 2.9 &&
			capture.audit.imageRendering === "auto",
	});
}

const checks = [
	{
		id: "all-dashboard-windows-draggable",
		kind: "approved-divergence",
		pass:
			dragResults.length === 4 && dragResults.every((result) => result.passed),
		metrics: {
			geometryTolerance,
			results: dragResults,
		},
	},
	{
		id: "all-dashboard-windows-pointer-focus",
		kind: "approved-divergence",
		pass:
			focusResults.length === 4 &&
			focusResults.every((result) => result.passed) &&
			mainContentClick.passed,
		metrics: {
			observation:
				"z-order sampled synchronously after Input.dispatchMouseEvent(pointer-down), before pointer-up or movement",
			sequence: focusResults,
			mainContentClick,
		},
	},
	{
		id: "reporting-panel-dpr2-crispness",
		kind: "high-dpr-render",
		pass:
			dpr2Results.length === 4 && dpr2Results.every((result) => result.passed),
		metrics: {
			requiredDevicePixelRatio: 2,
			minimumSourceDensity: 2.9,
			results: dpr2Results,
		},
	},
];
const passed = checks.every((check) => check.pass);
await mkdir(outputRoot, { recursive: true });
const report = {
	gate: "composed-dashboard-product-divergences",
	generatedAt: new Date().toISOString(),
	passed,
	candidateUrl: trace.candidateUrl,
	checks,
	artifacts: {
		trace: tracePath,
		report: reportPath,
	},
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
	JSON.stringify(
		{
			passed,
			checks: checks.map((check) => ({ id: check.id, pass: check.pass })),
			reportPath,
		},
		null,
		2,
	),
);
if (!passed) process.exitCode = 1;
