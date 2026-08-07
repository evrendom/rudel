import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const SOURCE_URL =
	"http://127.0.0.1:4176/next?opaline-source=navbar&opaline-links=rudel";
const CANDIDATE_URL =
	"http://127.0.0.1:4321/preview/navbar-naturalized";
const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/navbar/g3",
);

const scenarios = [
	{
		name: "product-hover-open",
		viewport: { width: 1280, height: 800, mobile: false },
		setup: [],
		actions: [
			{ type: "move", selector: 'button[id*="trigger-product"]' },
			{ type: "wait", duration: 520 },
		],
	},
	{
		name: "product-to-resources",
		viewport: { width: 1280, height: 800, mobile: false },
		setup: [
			{ type: "move", selector: 'button[id*="trigger-product"]' },
			{ type: "wait", duration: 420 },
		],
		actions: [
			{ type: "move", selector: 'button[id*="trigger-resources"]' },
			{ type: "wait", duration: 420 },
		],
	},
	{
		name: "pointer-leave-close",
		viewport: { width: 1280, height: 800, mobile: false },
		setup: [
			{ type: "move", selector: 'button[id*="trigger-product"]' },
			{ type: "wait", duration: 420 },
		],
		actions: [
			{ type: "move-point", x: 12, y: 520 },
			{ type: "wait", duration: 520 },
		],
	},
	{
		name: "mobile-open",
		viewport: { width: 390, height: 844, mobile: true },
		setup: [],
		actions: [
			{ type: "click", selector: 'button[aria-haspopup="dialog"]' },
			{ type: "wait", duration: 300 },
		],
	},
	{
		name: "mobile-escape-close",
		viewport: { width: 390, height: 844, mobile: true },
		setup: [
			{ type: "click", selector: 'button[aria-haspopup="dialog"]' },
			{ type: "wait", duration: 300 },
		],
		actions: [
			{ type: "key", key: "Escape", code: "Escape" },
			{ type: "wait", duration: 300 },
		],
	},
];

const pointFor = async (session, selector) => {
	const rect = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`,
	);
	if (!rect) throw new Error(`Could not resolve navbar target: ${selector}`);
	return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const dispatchActions = async (session, actions) => {
	for (const action of actions) {
		if (action.type === "wait") {
			await wait(action.duration);
			continue;
		}
		if (action.type === "key") {
			for (const type of ["rawKeyDown", "keyUp"]) {
				await session.client.call("Input.dispatchKeyEvent", {
					type,
					key: action.key,
					code: action.code,
					windowsVirtualKeyCode: 27,
				});
			}
			continue;
		}
		const point =
			action.type === "move-point"
				? { x: action.x, y: action.y }
				: action.point ?? (await pointFor(session, action.selector));
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			...point,
			button: "none",
			buttons: 0,
		});
		if (action.type === "click") {
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
		}
	}
};

const prepareActions = async (session, actions) =>
	Promise.all(
		actions.map(async (action) =>
			action.selector
				? { ...action, point: await pointFor(session, action.selector) }
				: action,
		),
	);

const installRecorder = async (session) => {
	await session.client.call("Runtime.evaluate", {
		expression: `(() => {
		const labelFor = (node) => {
			if (!(node instanceof Element)) return null;
			if (node === document.body) return "body";
			if (node.matches('button[id*="trigger-product"]')) return "trigger.product";
			if (node.matches('button[id*="trigger-resources"]')) return "trigger.resources";
			if (node.matches('button[aria-haspopup="dialog"]')) return "trigger.mobile";
			if (node.matches('[role="dialog"]')) return "dialog.mobile";
			if (node.id.includes("content-product")) return "content.product";
			if (node.id.includes("content-resources")) return "content.resources";
			if (node.matches('.TZTsQG_viewport, .opaline-nav-popover')) return "viewport";
			if (node.matches('.TZTsQG_viewportPosition, .opaline-nav-popover-position')) return "portal";
			const trigger = node.querySelector?.('button[id*="trigger-product"], button[id*="trigger-resources"]');
			if (trigger?.id.includes("product")) return "item.product";
			if (trigger?.id.includes("resources")) return "item.resources";
			return null;
		};
		const summarizeNode = (node) => {
			if (!(node instanceof Element)) return null;
			return labelFor(node) ??
				(node.matches('[data-radix-collection-item], [data-opaline-navbar-item]') ? "collection-item" : null);
		};
		const push = (event) => {
			if (!window.__opalineNavbarRecording) return;
			window.__opalineNavbarTrace.push({
				t: Number((performance.now() - window.__opalineNavbarStartedAt).toFixed(2)),
				...event,
			});
		};
		window.__opalineNavbarTrace = [];
		window.__opalineNavbarStartedAt = performance.now();
		window.__opalineNavbarRecording = false;
		window.__opalineNavbarObserver = new MutationObserver((records) => {
			for (const record of records) {
				const target = labelFor(record.target);
				if (record.type === "attributes") {
					if (!target || !new Set(["data-state", "data-motion", "aria-expanded", "aria-controls", "style"]).has(record.attributeName)) continue;
					if (target === "dialog.mobile" && record.attributeName === "style") continue;
					const value = record.target.getAttribute(record.attributeName);
					if (record.oldValue === value) continue;
					push({
						type: "attribute",
						target,
						name: record.attributeName,
						oldValue: record.oldValue,
						value,
					});
				}
			}
		});
		window.__opalineNavbarObserver.observe(document.documentElement, {
			attributes: true,
			attributeOldValue: true,
			childList: true,
			subtree: true,
		});
		window.__opalineNavbarStart = () => {
			window.__opalineNavbarTrace = [];
			window.__opalineNavbarStartedAt = performance.now();
			window.__opalineNavbarRecording = true;
		};
	})()`,
		returnByValue: true,
	});
};

const recordScenario = async (url, scenario) => {
	const session = await createBrowserSession({ url, ...scenario.viewport, dpr: 1 });
	try {
		if (!scenario.viewport.mobile) {
			await dispatchActions(session, [
				{ type: "move-point", x: 12, y: 520 },
				{ type: "wait", duration: 400 },
			]);
		}
		await installRecorder(session);
		await dispatchActions(session, scenario.setup);
		const preparedActions = await prepareActions(session, scenario.actions);
		await session.client.call("Runtime.evaluate", {
			expression: "window.__opalineNavbarStart()",
			returnByValue: true,
		});
		await dispatchActions(session, preparedActions);
		const trace = await session.client.call("Runtime.evaluate", {
			expression: `(() => {
				window.__opalineNavbarRecording = false;
				return window.__opalineNavbarTrace;
			})()`,
			returnByValue: true,
		});
		return trace.result.value;
	} finally {
		await session.close();
	}
};

const eventIdentity = (event) =>
	JSON.stringify({
		type: event.type,
		target: event.target,
		name: event.name,
		oldValue: event.oldValue,
		value: event.value,
		added: event.added,
		removed: event.removed,
	});

const results = [];
await mkdir(outputRoot, { recursive: true });
for (const scenario of scenarios) {
	const source = await recordScenario(SOURCE_URL, scenario);
	const candidate = await recordScenario(CANDIDATE_URL, scenario);
	const sourceSequence = source.map(eventIdentity);
	const candidateSequence = candidate.map(eventIdentity);
	const sequenceMatches =
		JSON.stringify(sourceSequence) === JSON.stringify(candidateSequence);
	const timingDifferences = sequenceMatches
		? source.map((event, index) => ({
			index,
			source: event.t,
			candidate: candidate[index].t,
			difference: Number(Math.abs(event.t - candidate[index].t).toFixed(2)),
		}))
		: [];
	const maximumTimingDifference = timingDifferences.length
		? Math.max(...timingDifferences.map(({ difference }) => difference))
		: null;
	const passed = sequenceMatches && maximumTimingDifference <= 17;
	results.push({
		name: scenario.name,
		passed,
		sequenceMatches,
		maximumTimingDifference,
		timingDifferences,
		source,
		candidate,
	});
	console.log(
		`${scenario.name}: ${sequenceMatches ? "sequence match" : "sequence mismatch"}, max timing ${maximumTimingDifference ?? "n/a"}ms`,
	);
}

const report = {
	generatedAt: new Date().toISOString(),
	sourceUrl: SOURCE_URL,
	candidateUrl: CANDIDATE_URL,
	thresholds: { timingMilliseconds: 17, sequence: "exact" },
	passed: results.every(({ passed }) => passed),
	results,
};
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
if (!report.passed) process.exitCode = 1;
