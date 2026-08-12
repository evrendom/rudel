import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { comparePngs } from "./diff.mjs";

const integrationTracePath = path.resolve(
	".context/extractions/dashboard/composed-integration/trace.json",
);
const scrollTracePath = path.resolve(
	".context/extractions/dashboard/composed-scroll-curve/trace.json",
);
const ambientProgramPath = path.resolve(
	".context/extractions/dashboard/ambient/program/program.json",
);
const productDivergenceReportPath = path.resolve(
	".context/gates/composed/dashboard-product-divergences/report.json",
);
const outputRoot = path.resolve(
	".context/gates/composed/dashboard-integration",
);
const geometryTolerance = 0.1;

const [integration, scroll, ambientProgram, productDivergences] =
	await Promise.all([
		readFile(integrationTracePath, "utf8").then(JSON.parse),
		readFile(scrollTracePath, "utf8").then(JSON.parse),
		readFile(ambientProgramPath, "utf8").then(JSON.parse),
		readFile(productDivergenceReportPath, "utf8").then(JSON.parse),
	]);

const keyedSamples = (samples) =>
	new Map(
		samples.map((sample) => [`${sample.direction}:${sample.scrollY}`, sample]),
	);

const candidateScrollSamples = keyedSamples(scroll.candidate.samples);
const pairedScrollSamples = scroll.reference.samples.map((reference) => ({
	reference,
	candidate: candidateScrollSamples.get(
		`${reference.direction}:${reference.scrollY}`,
	),
}));

const getAuxiliary = (sample, app) =>
	sample?.auxiliary.find((window) => window.app === app);

const absoluteDifference = (left, right) => Math.abs(left - right);

const initialReferenceMainY = scroll.reference.samples[0].main.rect.y;
const initialCandidateMainY = scroll.candidate.samples[0].main.rect.y;
let maximumRiseErrorPercent = 0;
let maximumMainPositionError = 0;
let maximumTerminalPositionError = 0;
let maximumTerminalOpacityError = 0;
let maximumTerminalScaleError = 0;
const curveFailures = [];

for (const pair of pairedScrollSamples) {
	if (!pair.candidate) {
		curveFailures.push({
			state: `${pair.reference.direction}:${pair.reference.scrollY}`,
			reason: "candidate sample missing",
		});
		continue;
	}
	const referenceRise = initialReferenceMainY - pair.reference.main.rect.y;
	const candidateRise = initialCandidateMainY - pair.candidate.main.rect.y;
	const riseErrorPercent =
		(absoluteDifference(referenceRise, candidateRise) /
			Math.max(1, Math.abs(referenceRise))) *
		100;
	const mainPositionError = absoluteDifference(
		pair.reference.main.rect.y,
		pair.candidate.main.rect.y,
	);
	maximumRiseErrorPercent = Math.max(maximumRiseErrorPercent, riseErrorPercent);
	maximumMainPositionError = Math.max(
		maximumMainPositionError,
		mainPositionError,
	);

	if (pair.reference.direction !== "down") continue;
	const referenceTerminal = getAuxiliary(pair.reference, "terminal");
	const candidateTerminal = getAuxiliary(pair.candidate, "terminal");
	if (!referenceTerminal || !candidateTerminal) {
		curveFailures.push({
			state: `${pair.reference.direction}:${pair.reference.scrollY}`,
			reason: "terminal sample missing",
		});
		continue;
	}
	maximumTerminalPositionError = Math.max(
		maximumTerminalPositionError,
		absoluteDifference(
			referenceTerminal.window.rect.y,
			candidateTerminal.window.rect.y,
		),
	);
	maximumTerminalOpacityError = Math.max(
		maximumTerminalOpacityError,
		absoluteDifference(
			referenceTerminal.inner.opacity,
			candidateTerminal.inner.opacity,
		),
	);
	maximumTerminalScaleError = Math.max(
		maximumTerminalScaleError,
		absoluteDifference(
			referenceTerminal.window.matrix?.a ?? 1,
			candidateTerminal.window.matrix?.a ?? 1,
		),
	);
}

const median = (values) => {
	const sorted = values.toSorted((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
};
const referenceExitSequence = scroll.reference.samples.filter(
	(sample) => sample.direction === "exit-sequence",
);
const candidateExitSequence = scroll.candidate.samples.filter(
	(sample) =>
		sample.direction === "exit-sequence" &&
		Number.isFinite(sample.ambientState?.revealMs),
);
const exitFrameDuration = median(
	referenceExitSequence
		.slice(1)
		.map(
			(sample, index) =>
				sample.phaseElapsed - referenceExitSequence[index].phaseElapsed,
		)
		.filter((duration) => duration > 0 && duration < 16),
);
const exitProgram = ambientProgram.windows.composedScrollCurve.exit.keyframes;
const terminalState = (sample) => {
	const terminal = getAuxiliary(sample, "terminal");
	return {
		opacity: terminal?.inner.opacity ?? 0,
		scale: terminal?.window.matrix?.a ?? 1,
	};
};
const exitProgramState = (frame) => ({
	opacity: frame.windows.terminal.opacity,
	scale: frame.scale,
});
const interpolateExitProgram = (elapsed) => {
	const first = exitProgram[0];
	const last = exitProgram.at(-1);
	if (elapsed <= first.t) return exitProgramState(first);
	if (elapsed >= last.t) return exitProgramState(last);
	for (let index = 1; index < exitProgram.length; index += 1) {
		const right = exitProgram[index];
		const left = exitProgram[index - 1];
		if (elapsed > right.t) continue;
		const progress = (elapsed - left.t) / (right.t - left.t);
		const leftState = exitProgramState(left);
		const rightState = exitProgramState(right);
		return {
			opacity:
				leftState.opacity + (rightState.opacity - leftState.opacity) * progress,
			scale: leftState.scale + (rightState.scale - leftState.scale) * progress,
		};
	}
	return exitProgramState(last);
};
let maximumExitKeyframeTimingError = 0;
let maximumExitLiveOpacityError = 0;
let maximumExitLiveScaleError = 0;
for (const keyframe of exitProgram) {
	const nearest = candidateExitSequence.reduce((best, sample) =>
		Math.abs(sample.ambientState.revealMs - keyframe.t) <
		Math.abs(best.ambientState.revealMs - keyframe.t)
			? sample
			: best,
	);
	maximumExitKeyframeTimingError = Math.max(
		maximumExitKeyframeTimingError,
		absoluteDifference(nearest.ambientState.revealMs, keyframe.t),
	);
}
for (const sample of candidateExitSequence) {
	const expected = interpolateExitProgram(sample.ambientState.revealMs);
	const actual = terminalState(sample);
	maximumExitLiveOpacityError = Math.max(
		maximumExitLiveOpacityError,
		absoluteDifference(actual.opacity, expected.opacity),
	);
	maximumExitLiveScaleError = Math.max(
		maximumExitLiveScaleError,
		absoluteDifference(actual.scale, expected.scale),
	);
}
const firstChangedExitSample = (samples) =>
	samples.find((sample) => terminalState(sample).opacity < 0.999);
const referenceExitTrigger = firstChangedExitSample(referenceExitSequence);
const candidateExitTrigger = firstChangedExitSample(candidateExitSequence);
const exitTriggerFrameDifference = absoluteDifference(
	referenceExitTrigger?.phaseFrame ?? Number.POSITIVE_INFINITY,
	candidateExitTrigger?.phaseFrame ?? Number.NEGATIVE_INFINITY,
);

const transparent = (value) =>
	value === "rgba(0, 0, 0, 0)" || value === "transparent";

const shellStyleKeys = [
	"backgroundColor",
	"backgroundImage",
	"overflow",
	"overflowX",
	"overflowY",
	"clip",
	"clipPath",
	"contain",
	"isolation",
];
const integrationPairs = integration.reference.samples.map(
	(reference, index) => ({
		reference,
		candidate: integration.candidate.samples[index],
	}),
);
const shellStyleDifferences = [];
for (const pair of integrationPairs) {
	for (const key of shellStyleKeys) {
		if (pair.reference.shell.style[key] === pair.candidate.shell.style[key]) {
			continue;
		}
		shellStyleDifferences.push({
			scrollY: pair.reference.actualScrollY,
			property: key,
			reference: pair.reference.shell.style[key],
			candidate: pair.candidate.shell.style[key],
		});
	}
}

const candidatePaintLayersAreTransparent = integration.candidate.samples.every(
	(sample) =>
		[sample.hero, sample.stage, sample.shell].every(
			(element) =>
				element &&
				transparent(element.style.backgroundColor) &&
				element.style.backgroundImage === "none",
		),
);

const topReference = integration.reference.samples[0];
const topCandidate = integration.candidate.samples[0];
const stripGeometry = ["x", "y", "width", "height"].map((property) => ({
	property,
	reference: topReference.strip.rect[property],
	candidate: topCandidate.strip.rect[property],
	difference: absoluteDifference(
		topReference.strip.rect[property],
		topCandidate.strip.rect[property],
	),
}));
const stripStyleKeys = [
	"position",
	"zIndex",
	"display",
	"opacity",
	"translate",
	"backgroundColor",
	"overflow",
	"fontFamily",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
	"gap",
	"padding",
];
const stripStyleDifferences = stripStyleKeys
	.filter(
		(key) => topReference.strip.style[key] !== topCandidate.strip.style[key],
	)
	.map((property) => ({
		property,
		reference: topReference.strip.style[property],
		candidate: topCandidate.strip.style[property],
	}));

const referenceTerminalExit = scroll.reference.samples.find(
	(sample) =>
		sample.direction === "down" &&
		(getAuxiliary(sample, "terminal")?.window.rect.y ?? 1) +
			(getAuxiliary(sample, "terminal")?.window.rect.height ?? 0) <=
			0,
);
const candidateTerminalExit = scroll.candidate.samples.find(
	(sample) =>
		sample.direction === "down" &&
		(getAuxiliary(sample, "terminal")?.window.rect.y ?? 1) +
			(getAuxiliary(sample, "terminal")?.window.rect.height ?? 0) <=
			0,
);

const candidateOverhang = topCandidate.auxiliary.some(
	(window) =>
		window.rect.x < topCandidate.shell.rect.x ||
		window.rect.x + window.rect.width >
			topCandidate.shell.rect.x + topCandidate.shell.rect.width ||
		window.rect.y < topCandidate.shell.rect.y,
);
const visibleOverflowMatches = [
	topCandidate.hero,
	topCandidate.stage,
	topCandidate.shell,
].every(
	(element) =>
		element.style.overflow === "visible" &&
		element.style.overflowX === "visible" &&
		element.style.overflowY === "visible" &&
		element.style.clipPath === "none" &&
		element.style.contain === "none",
);

const checks = [
	{
		id: "canvas-show-through",
		kind: "composed-state",
		pass:
			candidatePaintLayersAreTransparent && shellStyleDifferences.length === 0,
		metrics: {
			candidatePaintLayersAreTransparent,
			shellStyleDifferences,
		},
	},
	{
		id: "dashboard-rise-g3b",
		kind: "scroll-trace",
		pass:
			curveFailures.length === 0 &&
			maximumRiseErrorPercent <= 1 &&
			scroll.candidate.samples.every((sample) => sample.motionReady),
		metrics: {
			samples: pairedScrollSamples.length,
			maximumRiseErrorPercent,
			maximumMainPositionError,
			motionControllerReadyAtEverySample: scroll.candidate.samples.every(
				(sample) => sample.motionReady,
			),
			curveFailures,
		},
	},
	{
		id: "terminal-scroll-exit",
		kind: "scroll-trace",
		pass:
			maximumTerminalPositionError <= geometryTolerance &&
			maximumTerminalOpacityError <= 0.01 &&
			maximumTerminalScaleError <= 0.01 &&
			referenceTerminalExit?.scrollY === candidateTerminalExit?.scrollY &&
			exitTriggerFrameDifference <= 1 &&
			maximumExitKeyframeTimingError <= exitFrameDuration &&
			maximumExitLiveOpacityError <= 0.01 &&
			maximumExitLiveScaleError <= 0.01,
		metrics: {
			samples: pairedScrollSamples.length,
			maximumTerminalPositionError,
			maximumTerminalOpacityError,
			maximumTerminalScaleError,
			referenceExitScrollY: referenceTerminalExit?.scrollY ?? null,
			candidateExitScrollY: candidateTerminalExit?.scrollY ?? null,
			exitSequence: {
				recordedKeyframes: exitProgram.length,
				referenceFrames: referenceExitSequence.length,
				candidateFrames: candidateExitSequence.length,
				exitFrameDuration,
				exitTriggerFrameDifference,
				maximumKeyframeTimingError: maximumExitKeyframeTimingError,
				maximumLiveOpacityError: maximumExitLiveOpacityError,
				maximumLiveScaleError: maximumExitLiveScaleError,
			},
		},
	},
	{
		id: "auxiliary-overhang-unclipped",
		kind: "composed-state",
		pass:
			candidateOverhang &&
			visibleOverflowMatches &&
			shellStyleDifferences.length === 0,
		metrics: {
			candidateOverhang,
			visibleOverflowMatches,
			shellStyleDifferences,
		},
	},
	{
		id: "use-case-strip-top",
		kind: "composed-state",
		pass:
			topCandidate.strip.style.display !== "none" &&
			topCandidate.strip.style.opacity === "1" &&
			stripGeometry.every(
				(measurement) => measurement.difference <= geometryTolerance,
			) &&
			stripStyleDifferences.length === 0,
		metrics: {
			stripGeometry,
			stripStyleDifferences,
		},
	},
	...productDivergences.checks.map((check) => ({
		...check,
		metrics: {
			...check.metrics,
			approvedDivergence: true,
			sourceReport: productDivergenceReportPath,
		},
	})),
];

await mkdir(outputRoot, { recursive: true });
const stateIds = [
	"canvas-show-through",
	"dashboard-rise",
	"terminal-exit",
	"use-case-strip-top",
];
const pixelEvidence = [];
for (const state of stateIds) {
	const referencePath = integration.reference.evidence[state];
	const candidatePath = integration.candidate.evidence[state];
	if (!referencePath || !candidatePath) continue;
	const diffPath = path.join(outputRoot, `${state}-diff.png`);
	const pixel = await comparePngs({
		leftPath: referencePath,
		rightPath: candidatePath,
		diffPath,
	});
	pixelEvidence.push({
		state,
		referencePath,
		candidatePath,
		diffPath,
		pixel,
	});
}

const matrix = {
	generatedAt: new Date().toISOString(),
	viewport: integration.reference.viewport,
	referenceUrl: integration.reference.url,
	candidateUrl: integration.candidate.url,
	states: checks,
	traces: {
		integration: integrationTracePath,
		scrollCurve: scrollTracePath,
		productDivergences: productDivergenceReportPath,
	},
	pixelEvidence,
};
const passed = checks.every((check) => check.pass);
const report = {
	gate: "composed-dashboard-integration",
	generatedAt: new Date().toISOString(),
	passed,
	diagnosis: {
		element: "[data-dashboard-shell].opaline-dashboard-scope",
		previousCandidate: {
			backgroundColor: "rgb(255, 255, 255)",
			overflow: "hidden auto",
			overflowX: "hidden",
			overflowY: "auto",
		},
		reference: {
			backgroundColor: "rgba(0, 0, 0, 0)",
			overflow: "visible",
			overflowX: "visible",
			overflowY: "visible",
		},
		resolution:
			"Moved the vendor scope to a display-contents owner and restored transparent, visible-overflow integration layers.",
	},
	checks,
	pixelEvidence,
	artifacts: {
		matrix: path.join(outputRoot, "matrix.json"),
		integrationTrace: integrationTracePath,
		scrollTrace: scrollTracePath,
		productDivergenceReport: productDivergenceReportPath,
	},
};
await Promise.all([
	writeFile(
		path.join(outputRoot, "matrix.json"),
		`${JSON.stringify(matrix, null, 2)}\n`,
	),
	writeFile(
		path.join(outputRoot, "report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	),
]);

console.log(
	JSON.stringify(
		{
			passed,
			checks: checks.map((check) => ({ id: check.id, pass: check.pass })),
			outputRoot,
		},
		null,
		2,
	),
);
if (!passed) process.exitCode = 1;
