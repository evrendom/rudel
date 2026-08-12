import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBrowserSession, wait } from "./driver.mjs";

const OUTPUT_ROOT = path.resolve(
	".context/extractions/dashboard/composed-scroll-curve",
);
const VIEWPORT = { width: 1280, height: 800, dpr: 1, mobile: false };
const REFERENCE_URL = "http://127.0.0.1:4180/lens-attio-lens-aperture";
const CANDIDATE_URL = "http://127.0.0.1:4321/";
const END_SCROLL_Y = 1300;
const STEP = 10;
const EXIT_DWELL_FRAMES = 120;
const candidateOnly = process.argv.includes("--candidate-only");

const curveExpression = (reference) => `new Promise((resolve) => {
	const selectors = ${JSON.stringify({
		shell: reference
			? '[data-home-hero="attio-window-shell"]'
			: '[data-opaline-dashboard-part="attio-window-shell"]',
		main: reference
			? '[data-home-hero="attio-window"]'
			: '[data-opaline-dashboard-part="attio-window"]',
		auxiliary: reference
			? '[data-home-hero="desktop-window"]'
			: '[data-opaline-dashboard-part="desktop-window"]',
	})};
	const end = ${END_SCROLL_Y};
	const step = ${STEP};
	const exitDwellFrames = ${EXIT_DWELL_FRAMES};
	const samples = [];
	const number = (value) => Number.parseFloat(value) || 0;
	const matrix = (value) => {
		if (value === 'none') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
		const match = value.match(/^matrix\\(([^)]+)\\)$/);
		if (!match) return null;
		const values = match[1].split(',').map(Number);
		return { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
	};
	const describe = (element) => {
		if (!(element instanceof HTMLElement)) return null;
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		return {
			opacity: number(style.opacity),
			transform: style.transform,
			matrix: matrix(style.transform),
			translate: style.translate,
			filter: style.filter,
			zIndex: style.zIndex,
			boxShadow: style.boxShadow,
			rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
		};
	};
	const capture = (direction, phaseFrame = null, phaseElapsed = null) => {
		const shell = document.querySelector(selectors.shell);
		const main = document.querySelector(selectors.main);
		const auxiliary = [...document.querySelectorAll(selectors.auxiliary)];
		const ambientControl = document.querySelector('[data-opaline-dashboard-ambient-control]');
		let ambientState = null;
		try {
			ambientState = JSON.parse(ambientControl?.textContent || 'null');
		} catch {}
		samples.push({
			direction,
			phaseFrame,
			phaseElapsed,
			scrollY,
			t: performance.now(),
			heroProgress: getComputedStyle(document.documentElement).getPropertyValue('--hero-progress'),
			motionReady: document.documentElement.hasAttribute('data-opaline-motion-ready'),
			ambientState,
			shell: describe(shell),
			main: describe(main),
			auxiliary: auxiliary.map((element, index) => ({
				index,
				app: element.getAttribute('data-home-hero-app') ?? element.getAttribute('data-opaline-dashboard-app'),
				outer: describe(element.parentElement?.parentElement),
				inner: describe(element.parentElement),
				window: describe(element),
			})),
		});
	};
	let requested = 0;
	let direction = 'down';
	const recordExitSequence = () => {
		scrollTo(0, 500);
		let settleFrame = 0;
		const settle = () => requestAnimationFrame(() => {
			if (settleFrame < exitDwellFrames) {
				settleFrame += 1;
				return settle();
			}
			const exitStartedAt = performance.now();
			scrollTo(0, 7);
			let exitFrame = 0;
			const exit = () => requestAnimationFrame(() => {
				capture('exit-sequence', exitFrame, performance.now() - exitStartedAt);
				if (exitFrame >= exitDwellFrames) return resolve(samples);
				exitFrame += 1;
				exit();
			});
			exit();
		});
		settle();
	};
	const tick = () => {
		scrollTo(0, requested);
		requestAnimationFrame(() => {
			capture(direction);
			if (direction === 'down' && requested >= end) {
				direction = 'up';
				requested = Math.max(0, requested - step);
				return requestAnimationFrame(tick);
			}
			if (direction === 'up' && requested <= 0) {
				const dwellStartedAt = performance.now();
				let dwellFrame = 0;
				const dwell = () => requestAnimationFrame(() => {
					capture('exit-dwell', dwellFrame, performance.now() - dwellStartedAt);
					if (dwellFrame >= exitDwellFrames) return recordExitSequence();
					dwellFrame += 1;
					dwell();
				});
				return dwell();
			}
			requested = direction === 'down'
				? Math.min(end, requested + step)
				: Math.max(0, requested - (requested <= 20 ? 1 : step));
			requestAnimationFrame(tick);
		});
	};
	tick();
})`;

const record = async ({ url, reference }) => {
	const session = await createBrowserSession({ url, ...VIEWPORT });
	try {
		await session.completeAperture(1);
		const frameId = reference
			? (await session.frameTree()).find((frame) =>
					frame.url.includes("opaline-composition=lens-attio-lens"),
				)?.id
			: undefined;
		if (reference && !frameId)
			throw new Error("Reference composition frame missing");
		await session.waitFor(
			reference
				? 'document.querySelector("[data-home-hero=attio-window-shell]")'
				: 'document.querySelector("[data-opaline-dashboard-part=attio-window-shell]")',
			{ frameId },
		);
		await session.evaluate(
			"new Promise((resolve) => { scrollTo(0, 0); requestAnimationFrame(() => requestAnimationFrame(resolve)); })",
			{ frameId, awaitPromise: true },
		);
		await wait(3_200);
		const samples = await session.evaluate(curveExpression(reference), {
			frameId,
			awaitPromise: true,
		});
		return { url, reference, viewport: VIEWPORT, samples };
	} finally {
		await session.close();
	}
};

await mkdir(OUTPUT_ROOT, { recursive: true });
const tracePath = path.join(OUTPUT_ROOT, "trace.json");
const previousTrace = candidateOnly
	? JSON.parse(await readFile(tracePath, "utf8"))
	: null;
const reference = candidateOnly
	? previousTrace.reference
	: await record({ url: REFERENCE_URL, reference: true });
const candidate = await record({ url: CANDIDATE_URL, reference: false });
const report = {
	generatedAt: new Date().toISOString(),
	endScrollY: END_SCROLL_Y,
	step: STEP,
	exitDwellFrames: EXIT_DWELL_FRAMES,
	reference,
	candidate,
};
await writeFile(tracePath, `${JSON.stringify(report, null, 2)}\n`);
console.log(tracePath);
