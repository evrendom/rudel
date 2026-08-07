import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const sourceUrl = "http://127.0.0.1:4180/lens-attio-lens-aperture";
const candidateUrl = "http://127.0.0.1:4321/";
const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/hero-title/g3",
);
const scrollSamples = [0, 20, 45, 65, 90, 110, 135, 155, 180, 200, 240];

const releaseCandidateAperture = async (session) => {
	for (let attempt = 0; attempt < 12; attempt += 1) {
		const released = await session.evaluate(
			'document.documentElement.dataset.aperture === "released"',
		);
		if (released) return;
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseWheel",
			x: 640,
			y: 400,
			deltaX: 0,
			deltaY: 120,
		});
		await wait(32);
	}
	throw new Error("Candidate aperture did not release");
};

const readSource = async (session) => {
	const frame = await session.frameByName("lens-build-live");
	return session.evaluate(
		`(() => {
			const title = document.querySelector("#lens-attio-title-source");
			if (!(title instanceof HTMLElement)) throw new Error("Source title frame not found");
			const style = getComputedStyle(title);
			return {
				scrollY,
				opacity: Number(style.opacity),
				scale: Number(style.scale === "none" ? 1 : style.scale),
			};
		})()`,
		{ frameId: frame.id },
	);
};

const readCandidate = async (session) =>
	session.evaluate(`(() => {
		const title = document.querySelector("[data-opaline-hero-title]");
		if (!(title instanceof HTMLElement)) throw new Error("Candidate title not found");
		const style = getComputedStyle(title);
		const matrix = new DOMMatrixReadOnly(style.transform);
		return {
			scrollY,
			opacity: Number(style.opacity),
			scale: Math.hypot(matrix.a, matrix.b),
			progress: Number(getComputedStyle(document.documentElement).getPropertyValue("--title-progress")),
		};
	})()`);

const sourceStates = [];
const samples = [];
let deterministicSamples = [];
const source = await createBrowserSession({
	url: sourceUrl,
	width: 1280,
	height: 800,
	dpr: 1,
});
try {
	await source.completeAperture();
	for (const scrollY of scrollSamples) {
		await source.scrollTo(scrollY);
		await wait(50);
		sourceStates.push(await readSource(source));
	}
} finally {
	await source.close();
}

const candidate = await createBrowserSession({
	url: candidateUrl,
	width: 1280,
	height: 800,
	dpr: 1,
});
try {
	await releaseCandidateAperture(candidate);
	await wait(300);
	for (const [index, scrollY] of scrollSamples.entries()) {
		await candidate.scrollTo(scrollY);
		await wait(50);
		const sourceState = sourceStates[index];
		const candidateState = await readCandidate(candidate);
		const opacityDifference = Math.abs(
			sourceState.opacity - candidateState.opacity,
		);
		const scaleDifference = Math.abs(sourceState.scale - candidateState.scale);
		samples.push({
			scrollY,
			source: sourceState,
			candidate: candidateState,
			opacityDifference,
			scaleDifference,
			passed: opacityDifference <= 0.01 && scaleDifference <= 0.01,
		});
	}

	deterministicSamples = await candidate.evaluate(
		`(async () => {
			const samples = [];
			const scrollSamples = ${JSON.stringify(scrollSamples)};
			for (let pass = 0; pass < 10; pass += 1) {
				const positions = pass % 2 === 0 ? scrollSamples : [...scrollSamples].reverse();
				for (const scrollY of positions) {
					scrollTo(0, scrollY);
					await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
					const title = document.querySelector("[data-opaline-hero-title]");
					const style = getComputedStyle(title);
					const matrix = new DOMMatrixReadOnly(style.transform);
					const state = {
						scrollY: window.scrollY,
						opacity: Number(style.opacity),
						scale: Math.hypot(matrix.a, matrix.b),
						progress: Number(getComputedStyle(document.documentElement).getPropertyValue("--title-progress")),
					};
					const progress = Math.min(1, Math.max(0, (scrollY - 20) / 180));
					const expected = { opacity: 1 - progress, scale: 1 - progress * 0.1 };
					const opacityDifference = Math.abs(state.opacity - expected.opacity);
					const scaleDifference = Math.abs(state.scale - expected.scale);
					samples.push({
						pass,
						scrollY,
						state,
						expected,
						opacityDifference,
						scaleDifference,
						passed: opacityDifference <= 0.0001 && scaleDifference <= 0.0001,
					});
				}
			}
			return samples;
		})()`,
		{ awaitPromise: true },
	);
} finally {
	await candidate.close();
}

const report = {
	generatedAt: new Date().toISOString(),
	sourceUrl,
	candidateUrl,
	thresholds: {
		referenceCurveDifference: 0.01,
		deterministicFormulaDifference: 0.0001,
	},
	passed:
		samples.every(({ passed }) => passed) &&
		deterministicSamples.every(({ passed }) => passed),
	samples,
	deterministicSamples,
};
await mkdir(outputRoot, { recursive: true });
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
console.log(
	JSON.stringify(
		{
			passed: report.passed,
			samples: samples.length,
			deterministicSamples: deterministicSamples.length,
			maximumOpacityDifference: Math.max(
				...samples.map(({ opacityDifference }) => opacityDifference),
			),
			maximumScaleDifference: Math.max(
				...samples.map(({ scaleDifference }) => scaleDifference),
			),
		},
		null,
		2,
	),
);
if (!report.passed) process.exitCode = 1;
