import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve("apps/marketing");
const evidenceRoot = path.resolve(
	".context/extractions/dashboard/ambient/program",
);
const generatedPath = path.join(
	projectRoot,
	"src/components/generated/dashboard-ambient-data.ts",
);
const sourceOrigin = "http://127.0.0.1:4180";
const sourceUrl = `${sourceOrigin}/?opaline-source=attio-dashboard`;
const inventoryPath = path.resolve(
	".context/extractions/dashboard/ambient/inventory.json",
);
const entranceReportPath = path.resolve(
	".context/extractions/dashboard/ambient/initial-entrance-report.json",
);
const scrollTracePath = path.resolve(
	".context/extractions/dashboard/ambient/scroll-reveal/entrance-trace.json",
);
const composedScrollTracePath = path.resolve(
	".context/extractions/dashboard/composed-scroll-curve/trace.json",
);

const requireMatch = (value, expression, label) => {
	const match = value.match(expression);
	if (!match) throw new Error(`Could not extract ${label}`);
	return match;
};

const parseNumber = (value) => Number(value.replace("e3", "000"));
const parseMatrixScale = (transform) => {
	if (transform === "none") return 1;
	const match = transform.match(/^matrix\(([-\d.]+)/);
	return match ? Number(match[1]) : 1;
};

const html = await (await fetch(sourceUrl)).text();
const scriptUrls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
	(match) => new URL(match[1], sourceOrigin).href,
);
let chunkUrl = "";
let chunk = "";
for (const scriptUrl of scriptUrls) {
	const script = await (await fetch(scriptUrl)).text();
	if (
		script.includes("Find yesterday's demo call") &&
		script.includes("Churning…")
	) {
		chunkUrl = scriptUrl;
		chunk = script;
		break;
	}
}
if (!chunk) throw new Error("The Attio terminal source chunk was not found");

const exchangeLiteral = requireMatch(
	chunk,
	/let eA=(\[\{answer:[\s\S]*?\}\]);function ew/,
	"terminal exchanges",
)[1];
// The bounded source literal contains only strings, arrays, and object keys.
const exchanges = Function(`"use strict"; return (${exchangeLiteral})`)();
const spinnerLiteral = requireMatch(
	chunk,
	/let eN=(\[[^;]+\]);function ek/,
	"terminal spinner frames",
)[1];
const spinnerFrames = JSON.parse(spinnerLiteral);
const typeSpeed = Number(
	requireMatch(chunk, /function eb\(\{text:e,speed:a=(\d+)/, "type speed")[1],
);
const exchangeDuration = parseNumber(
	requireMatch(
		chunk,
		/function eR\([^)]*\)\{let a=ex\(eA,([^,]+),e\)/,
		"exchange duration",
	)[1],
);
const typedPause = Number(
	requireMatch(
		chunk,
		/"typed"===a\)\{let e=setTimeout\(\(\)=>r\("thinking"\),(\d+)/,
		"typed pause",
	)[1],
);
const thinkingDuration = Number(
	requireMatch(
		chunk,
		/"thinking"===a\)\{let e=setTimeout\(\(\)=>\{r\("responding"\),i\(0\)\},(\d+)/,
		"thinking duration",
	)[1],
);
const responseStartDelay = Number(
	requireMatch(chunk, /startDelay:(\d+),text:`Ran/, "response start delay")[1],
);
const commandTypeSpeed = Number(
	requireMatch(chunk, /speed:(\d+),text:e,onDone/, "command type speed")[1],
);
const churnTick = Number(
	requireMatch(
		chunk,
		/Math\.min\(e\+(\d+),(\d+)\)\),(\d+)\)/,
		"churn timing",
	)[1],
);
const churnDuration = Number(
	requireMatch(
		chunk,
		/Math\.min\(e\+(\d+),(\d+)\)\),(\d+)\)/,
		"churn timing",
	)[2],
);
const cursorAnimation = {
	duration:
		Number(
			requireMatch(
				chunk,
				/transition:\{duration:(\.\d+),repeat:1\/0\}/,
				"cursor duration",
			)[1],
		) * 1000,
	easing: "ease-out",
};

const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const animationAt = (pathValue) => {
	const record = inventory.animated.find((entry) => entry.path === pathValue);
	if (!record?.animations?.[0]) {
		throw new Error(`Missing recorded table animation at ${pathValue}`);
	}
	return record.animations[0];
};
const tableCells = inventory.thinking.map((thinking, index) => {
	const thinkingPath = thinking.path.split(".").slice(0, -2).join(".");
	const siblingPath = (sibling) =>
		`${thinkingPath.slice(0, thinkingPath.lastIndexOf("."))}.${sibling}`;
	const thinkingAnimation = animationAt(thinkingPath);
	const overlayAnimation = animationAt(siblingPath(1));
	const resultAnimation = animationAt(siblingPath(2));
	return {
		index,
		result:
			inventory.animated.find((entry) => entry.path === siblingPath(2))?.text ??
			"",
		delay: thinkingAnimation.timing.delay,
		thinking: {
			duration: thinkingAnimation.timing.duration,
			easing: thinkingAnimation.timing.easing,
		},
		overlay: {
			duration: overlayAnimation.timing.duration,
			easing: overlayAnimation.timing.easing,
		},
		resultAnimation: {
			duration: resultAnimation.timing.duration,
			easing: resultAnimation.timing.easing,
		},
	};
});

const entranceReport = JSON.parse(await readFile(entranceReportPath, "utf8"));
const outerEntrance = Object.fromEntries(
	entranceReport.changedAncestors.map((record) => [
		record.app,
		{
			delay: record.animation.timing.delay,
			duration: record.animation.timing.duration,
			easing: record.animation.timing.easing,
		},
	]),
);
const scrollTrace = JSON.parse(await readFile(scrollTracePath, "utf8"));
const scrollScaleKeyframes = scrollTrace
	.map((frame) => ({
		t: frame.t,
		scale: parseMatrixScale(
			frame.windows.find((window) => window.app === "terminal")?.transform ??
				"none",
		),
	}))
	.filter(
		(frame, index, frames) =>
			index === 0 || frame.scale !== frames[index - 1].scale,
	);
const composedScrollTrace = JSON.parse(
	await readFile(composedScrollTracePath, "utf8"),
);
const composedScrollSamples = composedScrollTrace.reference.samples.filter(
	(sample) => sample.direction === "down",
);
const settledSampleIndex = composedScrollSamples.findIndex((sample) => {
	const windows = sample.auxiliary;
	const terminal = windows.find((window) => window.app === "terminal");
	return (
		windows.every((window) => window.inner.opacity === 1) &&
		parseMatrixScale(terminal?.window.transform ?? "none") === 0.95
	);
});
if (settledSampleIndex < 0) {
	throw new Error(
		"The composed auxiliary-window curve never reached settlement",
	);
}
const composedScrollKeyframes = composedScrollSamples
	.slice(0, settledSampleIndex + 1)
	.map((sample) => ({
		scrollY: sample.scrollY,
		scale: parseMatrixScale(
			sample.auxiliary.find((window) => window.app === "terminal")?.window
				.transform ?? "none",
		),
		windows: Object.fromEntries(
			sample.auxiliary.map((window) => [
				window.app,
				{
					opacity: window.inner.opacity,
					filter: window.inner.filter,
				},
			]),
		),
	}));
const reverseSamples = composedScrollTrace.reference.samples.filter(
	(sample) => sample.direction === "up" || sample.direction === "exit-dwell",
);
const firstExitChangeIndex = reverseSamples.findIndex((sample) => {
	const terminal = sample.auxiliary.find((window) => window.app === "terminal");
	return (
		sample.auxiliary.some((window) => window.inner.opacity < 1) ||
		parseMatrixScale(terminal?.window.transform ?? "none") > 0.95
	);
});
if (firstExitChangeIndex <= 0) {
	throw new Error(
		"The composed auxiliary-window exit trigger was not recorded",
	);
}
const exitTriggerSample = reverseSamples[firstExitChangeIndex - 1];
const exitTriggerBelowScrollY = exitTriggerSample.scrollY + 1;
const exitSequenceSamples = composedScrollTrace.reference.samples.filter(
	(sample) => sample.direction === "exit-sequence",
);
const exitSettledSampleIndex = exitSequenceSamples.findIndex((sample) => {
	const terminal = sample.auxiliary.find((window) => window.app === "terminal");
	return (
		sample.auxiliary.every((window) => window.inner.opacity === 0) &&
		parseMatrixScale(terminal?.window.transform ?? "none") === 1
	);
});
if (exitSettledSampleIndex < 0) {
	throw new Error(
		"The composed auxiliary-window exit never reached settlement",
	);
}
const exitStartSample = exitSequenceSamples[0];
const composedExitKeyframes = [
	{
		t: 0,
		scale: 0.95,
		windows: Object.fromEntries(
			exitStartSample.auxiliary.map((window) => [
				window.app,
				{ filter: "none", opacity: 1 },
			]),
		),
	},
	...exitSequenceSamples.slice(0, exitSettledSampleIndex + 1).map((sample) => ({
		t: Number(sample.phaseElapsed.toFixed(3)),
		scale: parseMatrixScale(
			sample.auxiliary.find((window) => window.app === "terminal")?.window
				.transform ?? "none",
		),
		windows: Object.fromEntries(
			sample.auxiliary.map((window) => [
				window.app,
				{
					opacity: window.inner.opacity,
					filter: window.inner.filter,
				},
			]),
		),
	})),
];

const program = {
	sourceUrl,
	chunkUrl,
	extractedAt: new Date().toISOString(),
	terminal: {
		exchanges,
		spinnerFrames,
		exchangeDuration,
		typeSpeed,
		commandTypeSpeed,
		responseStartDelay,
		typedPause,
		thinkingDuration,
		churnTick,
		churnDuration,
		cursorAnimation,
	},
	table: {
		cells: tableCells,
		shimmer: {
			from: 0,
			to: -200,
			duration: 3000,
			easing: "ease-out",
		},
	},
	windows: {
		outerEntrance,
		revealOrder: ["terminal", "slack", "call"],
		revealDelayStep: 200,
		revealDuration: 600,
		revealEasing: "cubic-bezier(0.33, 1, 0.68, 1)",
		revealBlur: 3,
		scrollScaleKeyframes,
		composedScrollCurve: {
			keyframes: composedScrollKeyframes,
			exit: {
				triggerBelowScrollY: exitTriggerBelowScrollY,
				keyframes: composedExitKeyframes,
			},
		},
		settled: {
			scale: 0.95,
			rightBackground: "rgb(20, 20, 20)",
			rightOpacity: 1,
		},
	},
};

const generated = `// Generated by tools/extract-dashboard-ambient-program.mjs from the local 4180 reference.\n// Do not hand-edit visible strings or recorded motion constants.\nexport const dashboardAmbientProgram = ${JSON.stringify(program, null, 2)} as const;\n`;

await Promise.all([
	mkdir(path.dirname(generatedPath), { recursive: true }),
	mkdir(evidenceRoot, { recursive: true }),
]);
await Promise.all([
	writeFile(generatedPath, generated),
	writeFile(
		path.join(evidenceRoot, "program.json"),
		`${JSON.stringify(program, null, 2)}\n`,
	),
	writeFile(
		path.join(evidenceRoot, "extraction-report.json"),
		`${JSON.stringify(
			{
				sourceUrl,
				chunkUrl,
				generatedPath,
				exchanges: exchanges.length,
				tableCells: tableCells.length,
				outerEntrance,
				rightSettledStyle: program.windows.settled,
				composedScrollCurve: {
					keyframes: composedScrollKeyframes.length,
					settledAtScrollY: composedScrollKeyframes.at(-1)?.scrollY ?? null,
					exitTriggerBelowScrollY,
					exitKeyframes: composedExitKeyframes.length,
					exitSettledAtMs: composedExitKeyframes.at(-1)?.t ?? null,
				},
			},
			null,
			2,
		)}\n`,
	),
]);
console.log(
	JSON.stringify(
		{
			generatedPath,
			chunkUrl,
			exchanges: exchanges.length,
			tableCells: tableCells.length,
		},
		null,
		2,
	),
);
