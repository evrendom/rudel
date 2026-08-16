import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/dashboard/g3",
);
const sourceUrl = "http://127.0.0.1:4180/?opaline-composition=lens-attio-lens";
const candidateUrl = "http://127.0.0.1:4321/preview/dashboard-branded";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };

const clickPoint = async (session, selector) => {
	const rect = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`,
	);
	if (!rect)
		throw new Error(`Could not resolve interaction target: ${selector}`);
	return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const click = async (session, point) => {
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		...point,
		button: "none",
		buttons: 0,
	});
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mousePressed",
		...point,
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		...point,
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
};

const traceTabSwitch = async ({ url, source, sample }) => {
	const session = await createBrowserSession({ url, ...viewport });
	try {
		if (source) {
			await session.waitFor(
				'document.querySelector("[data-home-hero=attio-window-shell][data-opaline-scene-ready]")',
			);
			await session.evaluate("scrollTo(0, 400)");
			await wait(1_800);
		} else {
			await session.waitFor(
				'document.querySelector("[data-opaline-dashboard-part=attio-window-shell]")',
			);
		}
		await session.evaluate(`(() => {
			const shell = document.querySelector('[data-home-hero="attio-window-shell"], [data-opaline-dashboard-part="attio-window-shell"]');
			shell.dataset.gateShellIdentity = "retained";
			const output = document.createElement("output");
			output.id = "dashboard-trace-output";
			output.dataset.start = String(performance.now());
			output.textContent = "[]";
			document.body.append(output);
			const events = [];
			new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					const target = mutation.target;
					if (target === output) continue;
					events.push({
						t: Number((performance.now() - Number(output.dataset.start)).toFixed(3)),
						type: mutation.type,
						attribute: mutation.attributeName,
						selected: target instanceof HTMLElement ? target.getAttribute("aria-selected") : null,
						scene: target instanceof HTMLElement ? target.getAttribute("data-opaline-use-case") : null,
						added: mutation.addedNodes.length,
						removed: mutation.removedNodes.length,
					});
				}
				output.textContent = JSON.stringify(events);
			}).observe(shell, {
				subtree: true,
				childList: true,
				attributes: true,
				attributeFilter: ["aria-selected"],
			});
		})()`);
		const point = await clickPoint(
			session,
			'[data-opaline-use-case="Reporting"]',
		);
		await session.evaluate(`(() => {
			const output = document.querySelector("#dashboard-trace-output");
			output.dataset.start = String(performance.now());
			output.textContent = "[]";
		})()`);
		await click(session, point);
		await session.waitFor(
			source
				? 'document.querySelector("[data-home-hero-preview-tab=Reporting]")'
				: 'document.querySelector("[data-opaline-dashboard-panel=Reporting]")',
		);
		await wait(40);
		const result = await session.evaluate(`(() => {
			const events = JSON.parse(document.querySelector("#dashboard-trace-output").textContent || "[]");
			const selected = events.find((event) => event.attribute === "aria-selected" && event.scene === "Reporting" && event.selected === "true");
			const panel = events.find((event) => event.type === "childList" && (event.added > 0 || event.removed > 0));
			return {
				events,
				selectedDelayMs: selected?.t ?? null,
				panelDelayMs: panel?.t ?? null,
				switchDelayMs: selected && panel ? Number((panel.t - selected.t).toFixed(3)) : null,
				shellRetained: Boolean(document.querySelector('[data-gate-shell-identity="retained"]')),
				panel: document.querySelector('[data-home-hero-preview-tab], [data-opaline-dashboard-panel]')?.getAttribute('data-home-hero-preview-tab') ?? document.querySelector('[data-opaline-dashboard-panel]')?.getAttribute('data-opaline-dashboard-panel'),
			};
		})()`);
		return { sample, ...result };
	} finally {
		await session.close();
	}
};

const median = (values) => {
	const sorted = values.toSorted((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
};

const traceSamples = { source: [], candidate: [] };
for (let sample = 0; sample < 3; sample += 1) {
	traceSamples.source.push(
		await traceTabSwitch({ url: sourceUrl, source: true, sample }),
	);
	traceSamples.candidate.push(
		await traceTabSwitch({ url: candidateUrl, source: false, sample }),
	);
}

const session = await createBrowserSession({ url: candidateUrl, ...viewport });
let drag;
try {
	await session.waitFor(
		'document.querySelector("[data-opaline-dashboard-app=call][data-opaline-draggable-window]")',
	);
	const selector = '[data-opaline-dashboard-app="call"]';
	const before = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`,
	);
	await session.screenshot(path.join(outputRoot, "default.png"));
	const start = { x: before.x + before.width / 2, y: before.y + 24 };
	const end = { x: start.x + 120, y: start.y - 60 };
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		...start,
		button: "none",
		buttons: 0,
	});
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mousePressed",
		...start,
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	for (let step = 1; step <= 6; step += 1) {
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: start.x + ((end.x - start.x) * step) / 6,
			y: start.y + ((end.y - start.y) * step) / 6,
			button: "left",
			buttons: 1,
		});
		await wait(16);
	}
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		...end,
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
	await wait(100);
	const after = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`,
	);
	const state = await session.evaluate(`(() => {
		const element = document.querySelector(${JSON.stringify(selector)});
		return {
			x: Number(element.dataset.opalineDragX),
			y: Number(element.dataset.opalineDragY),
			grabbed: element.getAttribute("aria-grabbed"),
			dragging: element.hasAttribute("data-opaline-dragging"),
		};
	})()`);
	await session.screenshot(
		path.join(outputRoot, "dragged-plus-120-minus-60.png"),
	);
	drag = {
		before,
		after,
		state,
		delta: { x: after.x - before.x, y: after.y - before.y },
	};
} finally {
	await session.close();
}

const sourcePanelMedian = median(
	traceSamples.source.map((sample) => sample.switchDelayMs),
);
const candidatePanelMedian = median(
	traceSamples.candidate.map((sample) => sample.switchDelayMs),
);
const report = {
	gate: "G3-dashboard",
	generatedAt: new Date().toISOString(),
	sourceUrl,
	candidateUrl,
	viewport,
	tabSwitch: {
		samples: traceSamples,
		sourcePanelMedianMs: sourcePanelMedian,
		candidatePanelMedianMs: candidatePanelMedian,
		differenceMs: Math.abs(sourcePanelMedian - candidatePanelMedian),
		maximumDifferenceMs: 16,
		passed:
			traceSamples.source.every(
				(sample) => sample.shellRetained && sample.panel === "Reporting",
			) &&
			traceSamples.candidate.every(
				(sample) => sample.shellRetained && sample.panel === "Reporting",
			) &&
			Math.abs(sourcePanelMedian - candidatePanelMedian) <= 16,
	},
	drag: {
		...drag,
		expectedDelta: { x: 120, y: -60 },
		tolerance: 0.1,
		passed:
			Math.abs(drag.delta.x - 120) <= 0.1 &&
			Math.abs(drag.delta.y + 60) <= 0.1 &&
			drag.state.x === 120 &&
			drag.state.y === -60 &&
			drag.state.grabbed === "false" &&
			!drag.state.dragging,
	},
};
report.passed = report.tabSwitch.passed && report.drag.passed;
await mkdir(outputRoot, { recursive: true });
await Promise.all([
	writeFile(
		path.join(outputRoot, "trace.json"),
		`${JSON.stringify(traceSamples, null, 2)}\n`,
	),
	writeFile(
		path.join(outputRoot, "report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	),
]);
console.log(
	`tabs ${sourcePanelMedian.toFixed(1)}ms → ${candidatePanelMedian.toFixed(1)}ms; drag ${drag.delta.x.toFixed(1)}, ${drag.delta.y.toFixed(1)}`,
);
if (!report.passed) process.exitCode = 1;
