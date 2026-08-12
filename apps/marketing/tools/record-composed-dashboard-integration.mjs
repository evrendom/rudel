import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBrowserSession, wait } from "./driver.mjs";

const OUTPUT_ROOT = path.resolve(
	".context/extractions/dashboard/composed-integration",
);
const VIEWPORT = { width: 1280, height: 800, dpr: 1, mobile: false };
const SCROLL_OFFSETS = [
	0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1180,
];
const REFERENCE_URL = "http://127.0.0.1:4180/lens-attio-lens-aperture";
const CANDIDATE_URL = "http://127.0.0.1:4321/";

const selectorsFor = (reference) => ({
	hero: reference ? '[data-home-hero="root"]' : "[data-hero]",
	stage: reference
		? '[data-home-hero="attio-window-shell"]'
		: "[data-dashboard-shell]",
	shell: reference
		? '[data-home-hero="attio-window-shell"]'
		: '[data-opaline-dashboard-part="attio-window-shell"]',
	mainWindow: reference
		? '[data-home-hero="attio-window"]'
		: '[data-opaline-dashboard-part="attio-window"]',
	auxiliary: reference
		? '[data-home-hero="desktop-window"]'
		: '[data-opaline-dashboard-part="desktop-window"]',
	strip: "[data-opaline-use-case-strip]",
});

const sampleExpression = (reference, scrollY) => `(() => {
	const selectors = ${JSON.stringify(selectorsFor(reference))};
	const round = (value) => Number(value.toFixed(4));
	const describe = (element) => {
		if (!(element instanceof HTMLElement)) return null;
		const rect = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return {
			tag: element.tagName.toLowerCase(),
			className: element.className,
			parts: Object.fromEntries([...element.attributes]
				.filter((attribute) => attribute.name.startsWith('data-'))
				.map((attribute) => [attribute.name, attribute.value])),
			rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
			style: {
				position: style.position,
				zIndex: style.zIndex,
				display: style.display,
				opacity: style.opacity,
				transform: style.transform,
				translate: style.translate,
				scale: style.scale,
				backgroundColor: style.backgroundColor,
				backgroundImage: style.backgroundImage,
				overflow: style.overflow,
				overflowX: style.overflowX,
				overflowY: style.overflowY,
				clip: style.clip,
				clipPath: style.clipPath,
				contain: style.contain,
				isolation: style.isolation,
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
				fontWeight: style.fontWeight,
				lineHeight: style.lineHeight,
				letterSpacing: style.letterSpacing,
				gap: style.gap,
				padding: style.padding,
			},
		};
	};
	const ancestorChain = (element) => {
		const result = [];
		let current = element;
		while (current instanceof HTMLElement) {
			result.push(describe(current));
			current = current.parentElement;
		}
		return result;
	};
	const stacks = [120, 300, 500, 700].map((y) => ({
		y,
		elements: document.elementsFromPoint(innerWidth / 2, y).map(describe),
	}));
	const auxiliary = [...document.querySelectorAll(selectors.auxiliary)].map((element, index) => ({
		index,
		...describe(element),
		text: element.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 120) ?? '',
	}));
	const stage = document.querySelector(selectors.stage);
	const hero = document.querySelector(selectors.hero);
	const shell = document.querySelector(selectors.shell);
	const mainWindow = document.querySelector(selectors.mainWindow);
	const strip = document.querySelector(selectors.strip);
	return {
		requestedScrollY: ${scrollY},
		actualScrollY: window.scrollY,
		rootVariables: {
			heroProgress: getComputedStyle(document.documentElement).getPropertyValue('--hero-progress'),
			titleProgress: getComputedStyle(document.documentElement).getPropertyValue('--title-progress'),
			aperture: document.documentElement.dataset.aperture ?? null,
		},
		hero: describe(hero),
		stage: describe(stage),
		shell: describe(shell),
		mainWindow: describe(mainWindow),
		strip: describe(strip),
		auxiliary,
		stageAncestors: ancestorChain(stage),
		shellAncestors: ancestorChain(shell),
		stacks,
	};
})()`;

const scrollTo = async (session, frameId, scrollY) => {
	await session.evaluate(
		`new Promise((resolve) => {
			scrollTo(0, ${scrollY});
			requestAnimationFrame(() => requestAnimationFrame(resolve));
		})`,
		{ frameId, awaitPromise: true },
	);
};

const traceFocus = async (session, frameId, reference, evidencePath) => {
	const selector = selectorsFor(reference).auxiliary;
	const installed = await session.evaluate(
		`(() => {
		const windows = [...document.querySelectorAll(${JSON.stringify(selector)})];
		if (windows.length === 0) return null;
		const output = document.createElement('output');
		output.id = 'opaline-focus-trace';
		output.textContent = '[]';
		document.body.append(output);
		const startedAt = performance.now();
		output.dataset.startedAt = String(startedAt);
		const describe = (element, index) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return {
				index,
				className: element.className,
				styleAttribute: element.getAttribute('style'),
				zIndex: style.zIndex,
				opacity: style.opacity,
				transform: style.transform,
				rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
			};
		};
		const snapshot = (kind) => {
			const events = JSON.parse(output.textContent || '[]');
			events.push({
				t: Number((performance.now() - startedAt).toFixed(3)),
				kind,
				activeElement: document.activeElement?.getAttribute('data-home-hero-app') ?? document.activeElement?.getAttribute('data-opaline-dashboard-app') ?? document.activeElement?.tagName,
				windows: windows.map(describe),
			});
			output.textContent = JSON.stringify(events);
		};
		new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				const events = JSON.parse(output.textContent || '[]');
				events.push({
					t: Number((performance.now() - startedAt).toFixed(3)),
					kind: 'mutation',
					attribute: mutation.attributeName,
					oldValue: mutation.oldValue,
					targetIndex: windows.indexOf(mutation.target),
					className: mutation.target instanceof HTMLElement ? mutation.target.className : null,
					styleAttribute: mutation.target instanceof HTMLElement ? mutation.target.getAttribute('style') : null,
				});
				output.textContent = JSON.stringify(events);
			}
		}).observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'aria-grabbed', 'data-opaline-dragging'] });
		snapshot('before');
		const target = windows[0];
		if (!target) return null;
		const rect = target.getBoundingClientRect();
		return { x: rect.x + rect.width / 2, y: rect.y + 24, targetIndex: 0 };
	})()`,
		{ frameId },
	);
	if (!installed) return null;
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: installed.x,
		y: installed.y,
		button: "none",
		buttons: 0,
	});
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: installed.x,
		y: installed.y,
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	await wait(100);
	await session.evaluate(
		`(() => {
		const output = document.querySelector('#opaline-focus-trace');
		const windows = [...document.querySelectorAll(${JSON.stringify(selector)})];
		const events = JSON.parse(output.textContent || '[]');
			events.push({
				t: Number((performance.now() - Number(output.dataset.startedAt)).toFixed(3)),
			kind: 'pressed',
			activeElement: document.activeElement?.getAttribute('data-home-hero-app') ?? document.activeElement?.getAttribute('data-opaline-dashboard-app') ?? document.activeElement?.tagName,
			windows: windows.map((element, index) => ({ index, className: element.className, styleAttribute: element.getAttribute('style'), zIndex: getComputedStyle(element).zIndex })),
		});
		output.textContent = JSON.stringify(events);
	})()`,
		{ frameId },
	);
	await session.screenshot(evidencePath);
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x: installed.x,
		y: installed.y,
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
	await wait(100);
	await session.evaluate(
		`(() => {
		const output = document.querySelector('#opaline-focus-trace');
		const windows = [...document.querySelectorAll(${JSON.stringify(selector)})];
		const events = JSON.parse(output.textContent || '[]');
		events.push({
			t: Number((performance.now() - Number(output.dataset.startedAt)).toFixed(3)),
			kind: 'released',
			activeElement: document.activeElement?.getAttribute('data-home-hero-app') ?? document.activeElement?.getAttribute('data-opaline-dashboard-app') ?? document.activeElement?.tagName,
			windows: windows.map((element, index) => ({ index, className: element.className, styleAttribute: element.getAttribute('style'), zIndex: getComputedStyle(element).zIndex })),
		});
		output.textContent = JSON.stringify(events);
	})()`,
		{ frameId },
	);
	return session.evaluate(
		"JSON.parse(document.querySelector('#opaline-focus-trace')?.textContent || '[]')",
		{ frameId },
	);
};

const traceDrag = async (session, frameId, reference, evidencePath) => {
	const selector = selectorsFor(reference).auxiliary;
	const before = await session.evaluate(
		`(() => {
		const target = document.querySelector(${JSON.stringify(selector)});
		if (!(target instanceof HTMLElement)) return null;
		const rect = target.getBoundingClientRect();
		return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
	})()`,
		{ frameId },
	);
	if (!before) return null;
	const start = { x: before.x + before.width / 2, y: before.y + 24 };
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: start.x,
		y: start.y,
		buttons: 0,
	});
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: start.x,
		y: start.y,
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	for (let step = 1; step <= 10; step += 1) {
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: start.x + 12 * step,
			y: start.y - 6 * step,
			button: "left",
			buttons: 1,
		});
		await wait(16);
	}
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x: start.x + 120,
		y: start.y - 60,
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
	await wait(100);
	const after = await session.evaluate(
		`(() => {
		const target = document.querySelector(${JSON.stringify(selector)});
		if (!(target instanceof HTMLElement)) return null;
		const rect = target.getBoundingClientRect();
		return {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
			dragX: target.getAttribute('data-opaline-drag-x'),
			dragY: target.getAttribute('data-opaline-drag-y'),
		};
	})()`,
		{ frameId },
	);
	await session.screenshot(evidencePath);
	return {
		requestedDelta: { x: 120, y: -60 },
		before,
		after,
		actualDelta: after
			? { x: after.x - before.x, y: after.y - before.y }
			: null,
	};
};

const record = async ({ url, reference, label }) => {
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
				: 'document.querySelector("[data-dashboard-shell]")',
			{ frameId },
		);
		await scrollTo(session, frameId, 0);
		await wait(3_200);
		const samples = [];
		const evidence = {};
		const evidenceStates = new Map([
			[0, "use-case-strip-top"],
			[300, "canvas-show-through"],
			[500, "dashboard-rise"],
			[900, "terminal-exit"],
		]);
		for (const scrollY of SCROLL_OFFSETS) {
			await scrollTo(session, frameId, scrollY);
			samples.push(
				await session.evaluate(sampleExpression(reference, scrollY), {
					frameId,
				}),
			);
			const state = evidenceStates.get(scrollY);
			if (state) {
				const evidencePath = path.join(OUTPUT_ROOT, `${label}-${state}.png`);
				await session.screenshot(evidencePath);
				evidence[state] = evidencePath;
			}
		}
		await scrollTo(session, frameId, 500);
		const focusPath = path.join(OUTPUT_ROOT, `${label}-window-focus.png`);
		const focusTrace = await traceFocus(session, frameId, reference, focusPath);
		evidence["window-focus"] = focusPath;
		const dragPath = path.join(OUTPUT_ROOT, `${label}-window-drag.png`);
		const dragTrace = await traceDrag(session, frameId, reference, dragPath);
		evidence["window-drag"] = dragPath;
		return {
			url,
			reference,
			viewport: VIEWPORT,
			samples,
			focusTrace,
			dragTrace,
			evidence,
		};
	} finally {
		await session.close();
	}
};

await mkdir(OUTPUT_ROOT, { recursive: true });
const reference = await record({
	url: REFERENCE_URL,
	reference: true,
	label: "reference",
});
const candidate = await record({
	url: CANDIDATE_URL,
	reference: false,
	label: "candidate",
});
const report = {
	generatedAt: new Date().toISOString(),
	reference,
	candidate,
};
await writeFile(
	path.join(OUTPUT_ROOT, "trace.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
console.log(path.join(OUTPUT_ROOT, "trace.json"));
