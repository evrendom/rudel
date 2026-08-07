const chromeOrigin = process.env.CHROME_DEBUG_ORIGIN ?? "http://127.0.0.1:9254";
const candidateUrl =
	process.env.OPALINE_CANDIDATE_URL ?? "http://127.0.0.1:4321/";

const response = await fetch(
	`${chromeOrigin}/json/new?${encodeURIComponent("about:blank")}`,
	{ method: "PUT" },
);
if (!response.ok) throw new Error(`Chrome target failed: ${response.status}`);
const target = await response.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
let requestId = 0;
const pending = new Map();
const runtimeErrors = [];

const call = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const id = ++requestId;
		pending.set(id, { resolve, reject });
		socket.send(JSON.stringify({ id, method, params }));
	});

socket.addEventListener("message", (event) => {
	const message = JSON.parse(event.data);
	if (message.method === "Runtime.exceptionThrown") {
		runtimeErrors.push(message.params.exceptionDetails.text);
	}
	if (
		message.method === "Log.entryAdded" &&
		message.params.entry.level === "error"
	) {
		runtimeErrors.push(message.params.entry.text);
	}
	if (!message.id || !pending.has(message.id)) return;
	const request = pending.get(message.id);
	pending.delete(message.id);
	if (message.error) request.reject(new Error(message.error.message));
	else request.resolve(message.result);
});

await new Promise((resolve, reject) => {
	socket.addEventListener("open", resolve, { once: true });
	socket.addEventListener("error", reject, { once: true });
});

const evaluate = async (expression, awaitPromise = false) => {
	const result = await call("Runtime.evaluate", {
		expression,
		awaitPromise,
		returnByValue: true,
	});
	return result.result.value;
};
const wait = (duration) =>
	new Promise((resolve) => setTimeout(resolve, duration));
const waitFor = async (expression, timeout = 4000) => {
	const startedAt = Date.now();
	while (!(await evaluate(expression))) {
		if (Date.now() - startedAt > timeout) {
			throw new Error(`Timed out waiting for: ${expression}`);
		}
		await wait(40);
	}
};

try {
	await call("Page.enable");
	await call("Runtime.enable");
	await call("Log.enable");
	await call("Page.addScriptToEvaluateOnNewDocument", {
		source: `
			window.__opalineCumulativeLayoutShift = 0;
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (!entry.hadRecentInput) window.__opalineCumulativeLayoutShift += entry.value;
				}
			}).observe({ type: "layout-shift", buffered: true });
		`,
	});
	await call("Emulation.setDeviceMetricsOverride", {
		width: 1280,
		height: 800,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await call("Page.navigate", { url: candidateUrl });
	await waitFor(
		'document.documentElement.dataset.aperture === "idle" || document.documentElement.dataset.aperture === "released"',
	);
	await call("Input.dispatchMouseEvent", {
		type: "mouseWheel",
		x: 640,
		y: 400,
		deltaX: 0,
		deltaY: 2400,
	});
	await waitFor('document.documentElement.dataset.aperture === "released"');

	const switchResult = await evaluate(
		`(async () => {
			const shell = document.querySelector("[data-dashboard-shell]");
			const reporting = document.querySelector('[data-scene-tab="reporting"]');
			const frames = [];
			reporting.click();
			for (let index = 0; index < 24; index += 1) {
				await new Promise(requestAnimationFrame);
				const rect = shell.getBoundingClientRect();
				frames.push({
					width: rect.width,
					height: rect.height,
					visiblePanels: [...document.querySelectorAll("[data-scene-panel]")].filter((panel) => !panel.hidden).length,
				});
			}
			return {
				selected: document.querySelector('[data-scene-tab][aria-selected="true"]').textContent.trim(),
				sizeVariants: [...new Set(frames.map((frame) => frame.width + "x" + frame.height))],
				emptyFrames: frames.filter((frame) => frame.visiblePanels !== 1).length,
			};
		})()`,
		true,
	);
	if (switchResult.selected !== "Reporting")
		throw new Error("Reporting did not select");
	if (switchResult.sizeVariants.length !== 1)
		throw new Error("Dashboard resized during switch");
	if (switchResult.emptyFrames !== 0)
		throw new Error("Dashboard scene flashed blank");

	const dragStart = await evaluate(`(() => {
		const windowElement = document.querySelector("[data-drag-window]");
		const handle = windowElement.querySelector("[data-drag-handle]");
		const rect = handle.getBoundingClientRect();
		return {
			x: rect.left + 30,
			y: rect.top + rect.height / 2,
		};
	})()`);
	await call("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: dragStart.x,
		y: dragStart.y,
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	await call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: dragStart.x + 72,
		y: dragStart.y + 36,
		button: "none",
		buttons: 1,
	});
	await call("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x: dragStart.x + 72,
		y: dragStart.y + 36,
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
	await wait(50);
	const drag = await evaluate(`(() => {
		const windowElement = document.querySelector("[data-drag-window]");
		return {
			x: windowElement.style.getPropertyValue("--drag-x"),
			y: windowElement.style.getPropertyValue("--drag-y"),
		};
	})()`);
	if (drag.x !== "72px" || drag.y !== "36px") {
		throw new Error(
			`Drag did not settle at the requested offset: ${JSON.stringify({ dragStart, drag, runtimeErrors })}`,
		);
	}

	const determinism = await evaluate(
		`(async () => {
			const shell = document.querySelector("[data-dashboard-shell]");
			const settle = async () => {
				await new Promise(requestAnimationFrame);
				await new Promise(requestAnimationFrame);
				const rect = shell.getBoundingClientRect();
				return {
					top: rect.top,
					width: rect.width,
					height: rect.height,
					titleProgress: getComputedStyle(document.documentElement).getPropertyValue("--title-progress").trim(),
				};
			};
			scrollTo(0, 0);
			const before = await settle();
			scrollTo(0, 500);
			const focused = await settle();
			scrollTo(0, 0);
			const after = await settle();
			return { before, focused, after };
		})()`,
		true,
	);
	if (
		JSON.stringify(determinism.before) !== JSON.stringify(determinism.after)
	) {
		throw new Error(
			`Scroll round-trip was not deterministic: ${JSON.stringify(determinism)}`,
		);
	}
	if (
		determinism.before.width !== determinism.focused.width ||
		determinism.before.height !== determinism.focused.height
	) {
		throw new Error("Dashboard scale changed while scrolling");
	}

	await wait(8200);
	const remainedReporting = await evaluate(
		'document.querySelector("[data-scene-tab][aria-selected=true]").textContent.trim()',
	);
	if (remainedReporting !== "Reporting")
		throw new Error("Scene autoplay is still active");

	const navigation = await evaluate(`(() => {
		const trigger = document.querySelector("[data-nav-trigger]");
		trigger.click();
		return {
			expanded: trigger.getAttribute("aria-expanded"),
			hidden: document.querySelector("[data-nav-popover-position]").hidden,
			menu: document.querySelector("[data-nav-popover]").dataset.menu,
		};
	})()`);
	if (
		navigation.expanded !== "true" ||
		navigation.hidden ||
		navigation.menu !== "product"
	) {
		throw new Error("Desktop navigation disclosure did not open");
	}
	await call("Input.dispatchKeyEvent", {
		type: "keyDown",
		key: "Escape",
		code: "Escape",
	});
	await call("Input.dispatchKeyEvent", {
		type: "keyUp",
		key: "Escape",
		code: "Escape",
	});

	const desktop = await evaluate(`({
		aperture: document.documentElement.dataset.aperture,
		cls: window.__opalineCumulativeLayoutShift,
		originCount: new Set(performance.getEntriesByType("resource").map((entry) => new URL(entry.name).origin)).size,
		origin: [...new Set(performance.getEntriesByType("resource").map((entry) => new URL(entry.name).origin))],
		navExpanded: document.querySelector("[data-nav-trigger]").getAttribute("aria-expanded"),
	})`);
	if (desktop.aperture !== "released")
		throw new Error("Aperture did not release");
	if (desktop.cls > 0.001)
		throw new Error(
			`Cumulative layout shift exceeded zero budget: ${desktop.cls}`,
		);
	if (
		desktop.origin.some((origin) => origin !== new URL(candidateUrl).origin)
	) {
		throw new Error(
			`Third-party resource detected: ${desktop.origin.join(", ")}`,
		);
	}
	if (desktop.navExpanded !== "false")
		throw new Error("Escape did not close navigation");

	await call("Emulation.setDeviceMetricsOverride", {
		width: 390,
		height: 844,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await call("Page.navigate", { url: candidateUrl });
	await waitFor(
		'document.documentElement.dataset.aperture === "idle" || document.documentElement.dataset.aperture === "released"',
	);
	await call("Input.dispatchMouseEvent", {
		type: "mouseWheel",
		x: 195,
		y: 422,
		deltaX: 0,
		deltaY: 2400,
	});
	await waitFor('document.documentElement.dataset.aperture === "released"');
	const mobile = await evaluate(`({
		overflow: document.documentElement.scrollWidth - innerWidth,
		titleLines: Math.round(document.querySelector("h1").getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector("h1")).lineHeight)),
		mobileMenuVisible: getComputedStyle(document.querySelector("[data-mobile-nav-trigger]")).display !== "none",
	})`);
	if (mobile.overflow > 0)
		throw new Error(`Mobile overflowed by ${mobile.overflow}px`);
	if (!mobile.mobileMenuVisible)
		throw new Error("Mobile menu trigger is hidden");
	if (mobile.titleLines !== 3)
		throw new Error(
			`Expected three mobile title lines, got ${mobile.titleLines}`,
		);

	const mobileNavigation = await evaluate(`(() => {
		const trigger = document.querySelector("[data-mobile-nav-trigger]");
		const menu = document.querySelector("[data-mobile-nav]");
		trigger.click();
		return {
			expanded: trigger.getAttribute("aria-expanded"),
			state: trigger.dataset.state,
			hidden: menu.hidden,
			bodyOverflow: document.body.style.overflow,
		};
	})()`);
	if (
		mobileNavigation.expanded !== "true" ||
		mobileNavigation.state !== "open" ||
		mobileNavigation.hidden ||
		mobileNavigation.bodyOverflow !== "hidden"
	) {
		throw new Error("Mobile navigation did not open cleanly");
	}
	await call("Input.dispatchKeyEvent", {
		type: "keyDown",
		key: "Escape",
		code: "Escape",
	});
	await call("Input.dispatchKeyEvent", {
		type: "keyUp",
		key: "Escape",
		code: "Escape",
	});
	const mobileClosed = await evaluate(`({
		expanded: document.querySelector("[data-mobile-nav-trigger]").getAttribute("aria-expanded"),
		hidden: document.querySelector("[data-mobile-nav]").hidden,
		bodyOverflow: document.body.style.overflow,
	})`);
	if (
		mobileClosed.expanded !== "false" ||
		!mobileClosed.hidden ||
		mobileClosed.bodyOverflow !== ""
	) {
		throw new Error("Escape did not close mobile navigation");
	}

	if (runtimeErrors.length > 0) {
		throw new Error(`Runtime errors: ${runtimeErrors.join("; ")}`);
	}

	console.log(
		JSON.stringify(
			{
				dashboardSwitch: switchResult,
				drag,
				determinism,
				desktop,
				mobile,
				mobileNavigation,
				runtimeErrors,
			},
			null,
			2,
		),
	);
} finally {
	socket.close();
	await fetch(`${chromeOrigin}/json/close/${target.id}`);
}
