import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBrowserSession, wait } from "./driver.mjs";

const outputRoot = path.resolve(
	".context/extractions/dashboard/product-divergences",
);
const candidateUrl = "http://127.0.0.1:4321/";
const desktopViewport = {
	width: 1280,
	height: 800,
	dpr: 1,
	mobile: false,
};
const windowIds = ["main", "call", "slack", "terminal"];
const dragDeltas = {
	main: { x: 60, y: -30 },
	call: { x: -60, y: 30 },
	slack: { x: 60, y: 30 },
	terminal: { x: 60, y: -30 },
};
const dprViewports = [
	{ name: "phone", width: 390, height: 844, dpr: 2, mobile: true },
	{ name: "tablet", width: 768, height: 1024, dpr: 2, mobile: false },
	{ name: "desktop", width: 1280, height: 800, dpr: 2, mobile: false },
	{ name: "wide", width: 1680, height: 1050, dpr: 2, mobile: false },
];

const snapshotWindows = (session) =>
	session.evaluate(`(() => [...document.querySelectorAll(
	"[data-opaline-draggable-window]",
)].map((element) => {
	const bounds = element.getBoundingClientRect();
	return {
		id: element.getAttribute("data-opaline-window-id"),
		zIndex: Number.parseInt(getComputedStyle(element).zIndex, 10),
		rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
		dragX: Number(element.getAttribute("data-opaline-drag-x") ?? 0),
		dragY: Number(element.getAttribute("data-opaline-drag-y") ?? 0),
	};
}))()`);

const pointForWindow = async (session, id) =>
	session.evaluate(`(() => {
		const element = document.querySelector(
			'[data-opaline-window-id=${id}]',
		);
		if (!(element instanceof HTMLElement)) return null;
		const bounds = element.getBoundingClientRect();
		if (${JSON.stringify(id)} === "main") {
			const visual = element.querySelector('[data-opaline-dashboard-part="attio-window"]');
			const visualBounds = visual?.getBoundingClientRect() ?? bounds;
			return { x: visualBounds.x + visualBounds.width / 2, y: visualBounds.y + 6 };
		}
		if (${JSON.stringify(id)} === "call") {
			return { x: bounds.right - 20, y: bounds.top + 24 };
		}
		return { x: bounds.left + 20, y: bounds.top + 24 };
	})()`);

const dispatchPointer = (session, type, point, buttons) =>
	session.client.call("Input.dispatchMouseEvent", {
		type,
		...point,
		button: type === "mouseMoved" ? "none" : "left",
		buttons,
		clickCount: type === "mouseMoved" ? 0 : 1,
	});

const prepareDesktop = async () => {
	const session = await createBrowserSession({
		url: candidateUrl,
		...desktopViewport,
	});
	await session.completeAperture(1);
	await session.waitFor(
		'document.querySelectorAll("[data-opaline-draggable-window]").length === 4',
	);
	await session.scrollTo(500);
	await wait(1_200);
	return session;
};

const recordFocusAndClick = async () => {
	const session = await prepareDesktop();
	try {
		const sequence = [];
		for (const id of windowIds) {
			const point = await pointForWindow(session, id);
			if (!point) throw new Error(`Window focus target missing: ${id}`);
			const before = await snapshotWindows(session);
			await dispatchPointer(session, "mouseMoved", point, 0);
			await dispatchPointer(session, "mousePressed", point, 1);
			const pressed = await snapshotWindows(session);
			const paintStack = await session.evaluate(`(() => {
				const selected = document.querySelector('[data-opaline-window-id=${id}]');
				const windows = [...document.querySelectorAll('[data-opaline-draggable-window]')];
				if (!(selected instanceof HTMLElement)) return null;
				const selectedBounds = selected.getBoundingClientRect();
				const overlaps = windows
					.filter((window) => window !== selected)
					.map((window) => {
						const bounds = window.getBoundingClientRect();
						const left = Math.max(selectedBounds.left, bounds.left);
						const top = Math.max(selectedBounds.top, bounds.top);
						const right = Math.min(selectedBounds.right, bounds.right);
						const bottom = Math.min(selectedBounds.bottom, bounds.bottom);
						return { left, top, right, bottom, area: Math.max(0, right - left) * Math.max(0, bottom - top) };
					})
					.filter((overlap) => overlap.area > 0)
					.toSorted((left, right) => right.area - left.area);
				const overlap = overlaps[0];
				if (!overlap) return null;
				const point = { x: (overlap.left + overlap.right) / 2, y: (overlap.top + overlap.bottom) / 2 };
				const windowOrder = [];
				for (const element of document.elementsFromPoint(point.x, point.y)) {
					const owner = element.closest('[data-opaline-draggable-window]');
					const ownerId = owner?.getAttribute('data-opaline-window-id');
					if (ownerId && !windowOrder.includes(ownerId)) windowOrder.push(ownerId);
				}
				return { point, windowOrder };
			})()`);
			await session.screenshot(
				path.join(outputRoot, `focus-${id}-pressed.png`),
			);
			await dispatchPointer(session, "mouseReleased", point, 0);
			sequence.push({ id, point, before, pressed, paintStack });
		}

		const reportingPoint = await session.evaluate(`(() => {
			const button = document.querySelector('[data-opaline-use-case="Reporting"]');
			if (!(button instanceof HTMLElement)) return null;
			const bounds = button.getBoundingClientRect();
			return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
		})()`);
		if (!reportingPoint) throw new Error("Reporting control is unavailable");
		const beforeClick = await snapshotWindows(session);
		await dispatchPointer(session, "mouseMoved", reportingPoint, 0);
		await dispatchPointer(session, "mousePressed", reportingPoint, 1);
		const pressedClick = await snapshotWindows(session);
		await dispatchPointer(session, "mouseReleased", reportingPoint, 0);
		await session.waitFor(
			'document.querySelector("[data-opaline-dashboard-panel=Reporting]")',
		);
		await wait(80);
		const afterClick = await snapshotWindows(session);
		const clickResult = await session.evaluate(`(() => ({
			selected: document.querySelector('[data-opaline-use-case="Reporting"]')?.getAttribute("aria-selected"),
			panel: document.querySelector("[data-opaline-dashboard-panel]")?.getAttribute("data-opaline-dashboard-panel"),
		}))()`);
		await session.screenshot(path.join(outputRoot, "main-content-click.png"));
		return {
			sequence,
			mainContentClick: {
				point: reportingPoint,
				before: beforeClick,
				pressed: pressedClick,
				after: afterClick,
				result: clickResult,
			},
		};
	} finally {
		await session.close();
	}
};

const recordDrags = async () => {
	const session = await prepareDesktop();
	try {
		const results = [];
		for (const id of windowIds) {
			const requestedDelta = dragDeltas[id];
			const start = await pointForWindow(session, id);
			if (!start) throw new Error(`Window drag target missing: ${id}`);
			const before = await snapshotWindows(session);
			await dispatchPointer(session, "mouseMoved", start, 0);
			await dispatchPointer(session, "mousePressed", start, 1);
			for (let step = 1; step <= 6; step += 1) {
				await dispatchPointer(
					session,
					"mouseMoved",
					{
						x: start.x + (requestedDelta.x * step) / 6,
						y: start.y + (requestedDelta.y * step) / 6,
					},
					1,
				);
				await wait(16);
			}
			await dispatchPointer(
				session,
				"mouseReleased",
				{
					x: start.x + requestedDelta.x,
					y: start.y + requestedDelta.y,
				},
				0,
			);
			await wait(50);
			const after = await snapshotWindows(session);
			const beforeTarget = before.find((window) => window.id === id);
			const afterTarget = after.find((window) => window.id === id);
			results.push({
				id,
				requestedDelta,
				before: beforeTarget,
				after: afterTarget,
				actualDelta: {
					x: afterTarget.rect.x - beforeTarget.rect.x,
					y: afterTarget.rect.y - beforeTarget.rect.y,
				},
				stack: after,
			});
			await session.screenshot(path.join(outputRoot, `drag-${id}.png`));
		}
		return results;
	} finally {
		await session.close();
	}
};

const captureDpr2 = async (viewport) => {
	const url = viewport.mobile
		? "http://127.0.0.1:4321/preview/dashboard-mobile-reporting-branded"
		: candidateUrl;
	const session = await createBrowserSession({
		url,
		...viewport,
	});
	try {
		if (!viewport.mobile) {
			await session.completeAperture(1);
			await session.waitFor(
				'document.querySelector("[data-opaline-use-case=Reporting]")',
			);
			await session.scrollTo(500);
			await session.evaluate(
				'document.querySelector("[data-opaline-use-case=Reporting]")?.click()',
			);
		}
		await session.waitFor(
			'[...document.querySelectorAll("[data-opaline-reporting-static-visual] img")].some((image) => image.complete && image.getBoundingClientRect().width > 0)',
		);
		await wait(150);
		const audit = await session.evaluate(`(() => {
			const image = [...document.querySelectorAll("[data-opaline-reporting-static-visual] img")]
				.find((candidate) => candidate.getBoundingClientRect().width > 0);
			if (!(image instanceof HTMLImageElement)) return null;
			const bounds = image.getBoundingClientRect();
			return {
				devicePixelRatio,
				currentSrc: image.currentSrc,
				naturalWidth: image.naturalWidth,
				naturalHeight: image.naturalHeight,
				rendered: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
				imageRendering: getComputedStyle(image).imageRendering,
			};
		})()`);
		if (!audit)
			throw new Error(`DPR-2 Reporting image missing: ${viewport.name}`);
		const screenshotPath = path.join(
			outputRoot,
			`reporting-dpr2-${viewport.name}.png`,
		);
		await session.screenshot(screenshotPath);
		return { viewport, url, audit, screenshotPath };
	} finally {
		await session.close();
	}
};

await mkdir(outputRoot, { recursive: true });
const focusAndClick = await recordFocusAndClick();
const drags = await recordDrags();
const dpr2 = [];
for (const viewport of dprViewports) {
	dpr2.push(await captureDpr2(viewport));
}

const trace = {
	generatedAt: new Date().toISOString(),
	candidateUrl,
	windowIds,
	focusAndClick,
	drags,
	dpr2,
};
const tracePath = path.join(outputRoot, "trace.json");
await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`);
console.log(tracePath);
