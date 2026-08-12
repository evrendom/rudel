import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const outputRoot = path.resolve(
	".context/gates/composed/dashboard-ambient-loop-aligned",
);
const referenceUrl = "http://127.0.0.1:4180/lens-attio-lens-aperture";
const candidateUrl = "http://127.0.0.1:4321/";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };
const program = JSON.parse(
	await readFile(
		path.resolve(".context/extractions/dashboard/ambient/program/program.json"),
		"utf8",
	),
);
const exchange = program.terminal.exchanges[1];
const ranLabel = `Ran ${exchange.commands.length} commands`;
const terminalAnswerMs =
	program.terminal.exchangeDuration +
	exchange.prompt.length * program.terminal.typeSpeed +
	program.terminal.typedPause +
	program.terminal.thinkingDuration +
	program.terminal.responseStartDelay +
	ranLabel.length * program.terminal.typeSpeed +
	exchange.commands.reduce(
		(total, command) =>
			total + command.length * program.terminal.commandTypeSpeed,
		0,
	) +
	exchange.answer.length * program.terminal.typeSpeed +
	50;

const canvasSuppression = `(() => {
	const style = document.createElement('style');
	style.dataset.opalineComposedCanvasSuppression = '';
	style.textContent = [
		'canvas', '.canvas-fallback', '#lens-attio-canvas-source',
		'iframe[title="Opaline animated canvas"]',
	].join(',') + ' { visibility: hidden !important; }';
	document.head.append(style);
	for (const region of document.querySelectorAll('[role="region"]')) {
		if (region.textContent?.includes('We use cookies to improve your experience')) region.remove();
	}
})()`;

const suppressCanvas = async (session) => {
	for (const frame of await session.frameTree()) {
		await session.evaluate(canvasSuppression, { frameId: frame.id });
	}
};

const dashboardBoundsExpression = (source) => `(() => {
	const selector = ${JSON.stringify(
		source
			? '[data-home-hero="attio-window"], [data-home-hero="desktop-window"], [data-opaline-use-case-strip]'
			: '[data-opaline-dashboard-part="attio-window"], [data-opaline-dashboard-part="desktop-window"], [data-opaline-use-case-strip]',
	)};
	const rects = [...document.querySelectorAll(selector)]
		.map((element) => element.getBoundingClientRect())
		.filter((rect) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight);
	if (rects.length === 0) return null;
	const left = Math.min(...rects.map((rect) => rect.left));
	const top = Math.max(0, Math.min(...rects.map((rect) => rect.top)));
	const right = Math.max(...rects.map((rect) => rect.right));
	const bottom = Math.min(innerHeight, Math.max(...rects.map((rect) => rect.bottom)));
	return { x: left, y: top, width: right - left, height: bottom - top };
})()`;

const seekCandidate = async (session, state) => {
	await session.waitFor(
		'document.querySelector("[data-opaline-dashboard-ambient-control]")?.hasAttribute("data-opaline-ambient-ready")',
	);
	await session.evaluate(`(() => {
		const control = document.querySelector('[data-opaline-dashboard-ambient-control]');
		Object.assign(control.dataset, ${JSON.stringify(
			Object.fromEntries(
				Object.entries(state).map(([key, value]) => [key, String(value)]),
			),
		)});
		control.dispatchEvent(new Event('opaline:ambient-seek'));
	})()`);
};

const freezeReferenceAnswer = async (session, frameId) =>
	session.evaluate(
		`new Promise((resolve, reject) => {
			const deadline = performance.now() + 20_000;
			const tick = () => {
				const windowElement = document.querySelector('[data-home-hero="desktop-window"][data-home-hero-app="terminal"]');
				if (windowElement?.innerText.includes(${JSON.stringify(exchange.answer)})) {
					const clone = windowElement.cloneNode(true);
					windowElement.replaceWith(clone);
					return resolve(true);
				}
				if (performance.now() >= deadline) return reject(new Error('reference answer checkpoint timed out'));
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		})`,
		{ frameId, awaitPromise: true },
	);

const captureReference = async () => {
	const session = await createBrowserSession({
		url: referenceUrl,
		...viewport,
	});
	try {
		await session.completeAperture(1);
		const compositionFrame = (await session.frameTree()).find((frame) =>
			frame.url.includes("opaline-composition=lens-attio-lens"),
		);
		if (!compositionFrame)
			throw new Error("Reference composition frame missing");
		await session.waitFor(
			'document.querySelector("[data-home-hero=attio-window-shell]")',
			{ frameId: compositionFrame.id },
		);
		await session.evaluate(
			"new Promise((resolve) => { scrollTo(0, 0); requestAnimationFrame(() => requestAnimationFrame(resolve)); })",
			{ frameId: compositionFrame.id, awaitPromise: true },
		);
		await wait(1_000);
		await suppressCanvas(session);
		const topPath = path.join(outputRoot, "desktop-top-reference.png");
		await session.screenshot(topPath);
		const topBounds = await session.evaluate(dashboardBoundsExpression(true), {
			frameId: compositionFrame.id,
		});

		await session.evaluate(
			"new Promise((resolve) => { scrollTo(0, 500); requestAnimationFrame(() => requestAnimationFrame(resolve)); })",
			{ frameId: compositionFrame.id, awaitPromise: true },
		);
		await freezeReferenceAnswer(session, compositionFrame.id);
		await wait(120);
		const focusPath = path.join(outputRoot, "hero-focus-reference.png");
		await session.screenshot(focusPath);
		const focusBounds = await session.evaluate(
			dashboardBoundsExpression(true),
			{
				frameId: compositionFrame.id,
			},
		);
		return {
			desktopTop: { path: topPath, bounds: topBounds },
			heroFocus: { path: focusPath, bounds: focusBounds },
		};
	} finally {
		await session.close();
	}
};

const captureCandidate = async () => {
	const session = await createBrowserSession({
		url: candidateUrl,
		...viewport,
	});
	try {
		await session.completeAperture(1);
		await session.evaluate(
			"new Promise((resolve) => { scrollTo(0, 0); requestAnimationFrame(() => requestAnimationFrame(resolve)); })",
			{ awaitPromise: true },
		);
		await seekCandidate(session, {
			outerMs: 2500,
			revealMs: -1,
			tableMs: 3400,
			terminalMs: terminalAnswerMs,
		});
		await wait(1_000);
		await suppressCanvas(session);
		const topPath = path.join(outputRoot, "desktop-top-candidate.png");
		await session.screenshot(topPath);
		const topBounds = await session.evaluate(dashboardBoundsExpression(false));

		await session.evaluate(
			"new Promise((resolve) => { scrollTo(0, 500); requestAnimationFrame(() => requestAnimationFrame(resolve)); })",
			{ awaitPromise: true },
		);
		await seekCandidate(session, {
			outerMs: 2500,
			revealMs: 1000,
			tableMs: 3400,
			terminalMs: terminalAnswerMs,
		});
		await wait(500);
		const focusPath = path.join(outputRoot, "hero-focus-candidate.png");
		await session.screenshot(focusPath);
		const focusBounds = await session.evaluate(
			dashboardBoundsExpression(false),
		);
		return {
			desktopTop: { path: topPath, bounds: topBounds },
			heroFocus: { path: focusPath, bounds: focusBounds },
		};
	} finally {
		await session.close();
	}
};

const cropPng = async (inputPath, outputPath, bounds, width, height) => {
	const source = PNG.sync.read(await readFile(inputPath));
	const x = Math.max(0, Math.floor(bounds.x));
	const y = Math.max(0, Math.floor(bounds.y));
	const cropWidth = Math.min(width, source.width - x);
	const cropHeight = Math.min(height, source.height - y);
	const target = new PNG({ width: cropWidth, height: cropHeight });
	PNG.bitblt(source, target, x, y, cropWidth, cropHeight, 0, 0);
	await writeFile(outputPath, PNG.sync.write(target));
	return { x, y, width: cropWidth, height: cropHeight };
};

await mkdir(outputRoot, { recursive: true });
const [reference, candidate] = await Promise.all([
	captureReference(),
	captureCandidate(),
]);
const states = [
	{ name: "desktop-top", key: "desktopTop" },
	{ name: "hero-focus", key: "heroFocus" },
];
const results = [];
for (const state of states) {
	const referenceCapture = reference[state.key];
	const candidateCapture = candidate[state.key];
	const fullPixel = await comparePngs({
		leftPath: referenceCapture.path,
		rightPath: candidateCapture.path,
		diffPath: path.join(outputRoot, `${state.name}-full-diff.png`),
	});
	let dashboardPixel = null;
	let dashboardCrops = null;
	if (referenceCapture.bounds && candidateCapture.bounds) {
		const width = Math.floor(
			Math.min(referenceCapture.bounds.width, candidateCapture.bounds.width),
		);
		const height = Math.floor(
			Math.min(referenceCapture.bounds.height, candidateCapture.bounds.height),
		);
		const referenceCropPath = path.join(
			outputRoot,
			`${state.name}-dashboard-reference.png`,
		);
		const candidateCropPath = path.join(
			outputRoot,
			`${state.name}-dashboard-candidate.png`,
		);
		const [referenceCrop, candidateCrop] = await Promise.all([
			cropPng(
				referenceCapture.path,
				referenceCropPath,
				referenceCapture.bounds,
				width,
				height,
			),
			cropPng(
				candidateCapture.path,
				candidateCropPath,
				candidateCapture.bounds,
				width,
				height,
			),
		]);
		dashboardPixel = await comparePngs({
			leftPath: referenceCropPath,
			rightPath: candidateCropPath,
			diffPath: path.join(outputRoot, `${state.name}-dashboard-diff.png`),
		});
		dashboardCrops = { referenceCrop, candidateCrop };
	}
	results.push({
		state: state.name,
		fullPixel,
		dashboardPixel,
		dashboardCrops,
		reference: referenceCapture,
		candidate: candidateCapture,
	});
	console.log(
		`${state.name}: full ${fullPixel.diffPercent.toFixed(6)}%; dashboard ${dashboardPixel?.diffPercent.toFixed(6) ?? "n/a"}%`,
	);
}

const report = {
	gate: "composed-dashboard-ambient-loop-aligned",
	generatedAt: new Date().toISOString(),
	referenceUrl,
	candidateUrl,
	viewport,
	canvasSuppressed: true,
	alignment: {
		tableMs: 3400,
		terminalMs: terminalAnswerMs,
		terminalContent: exchange.answer,
		referenceFrozenOnContentPredicate: true,
		candidateDeterministicSeek: true,
	},
	results,
};
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
