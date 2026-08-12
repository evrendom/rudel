import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBrowserSession, wait } from "./driver.mjs";

const outputRoot = path.resolve(
	process.env.OPALINE_AMBIENT_OUTPUT ??
		".context/extractions/dashboard/ambient",
);
const sourceUrl = "http://127.0.0.1:4180/?opaline-composition=lens-attio-lens";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };

const session = await createBrowserSession({ ...viewport });
try {
	await session.client.call("Page.addScriptToEvaluateOnNewDocument", {
		source: `
			(() => {
				const round = (value) => Number(Number(value).toFixed(4));
				const styleState = (element) => {
					const style = getComputedStyle(element);
					const rect = element.getBoundingClientRect();
					return {
						tag: element.tagName.toLowerCase(),
						marker:
							element.getAttribute('data-home-hero') ??
							element.getAttribute('data-home-hero-app') ??
							element.getAttribute('data-opaline-claude-code') ??
							'',
						className: typeof element.className === 'string' ? element.className : '',
						opacity: round(style.opacity),
						transform: style.transform,
						filter: style.filter,
						visibility: style.visibility,
						backgroundColor: style.backgroundColor,
						animations: element.getAnimations().map((animation) => ({
							currentTime: round(animation.currentTime ?? 0),
							playState: animation.playState,
							timing: animation.effect?.getComputedTiming?.() ?? null,
							keyframes: animation.effect?.getKeyframes?.() ?? [],
						})),
						rect: {
							x: round(rect.x),
							y: round(rect.y),
							width: round(rect.width),
							height: round(rect.height),
						},
					};
				};
				const output = document.createElement('output');
				output.id = 'opaline-dashboard-entrance-trace';
				output.hidden = true;
				const trace = [];
				const startedAt = performance.now();
				let previous = '';
				const tick = () => {
					if (!output.isConnected && document.body) document.body.append(output);
					const windows = [...document.querySelectorAll('[data-home-hero="desktop-window"]')];
					const state = windows.map((windowElement) => {
						const ancestors = [];
						let current = windowElement;
						for (let depth = 0; current && depth < 8; depth += 1) {
							ancestors.push(styleState(current));
							current = current.parentElement;
						}
						return {
							app: windowElement.getAttribute('data-home-hero-app'),
							ancestors,
						};
					});
					const signature = JSON.stringify(state);
					if (signature !== previous) {
						trace.push({ t: round(performance.now() - startedAt), windows: state });
						previous = signature;
						if (output.isConnected) output.textContent = JSON.stringify(trace);
					}
					if (performance.now() - startedAt < 4_000) requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			})();
		`,
	});
	await session.navigate(sourceUrl);
	await wait(4_100);
	const trace = await session.evaluate(`(() => {
		const output = document.querySelector('#opaline-dashboard-entrance-trace');
		return JSON.parse(output?.textContent || '[]');
	})()`);
	const changedAncestors = [];
	for (const app of ["call", "slack", "terminal"]) {
		const frames = trace
			.map((frame) => ({
				t: frame.t,
				ancestors:
					frame.windows.find((window) => window.app === app)?.ancestors ?? [],
			}))
			.filter((frame) => frame.ancestors.length > 0);
		const maximumDepth = Math.max(
			0,
			...frames.map((frame) => frame.ancestors.length),
		);
		for (let depth = 0; depth < maximumDepth; depth += 1) {
			const signatures = new Set(
				frames.map((frame) => {
					const ancestor = frame.ancestors[depth];
					return JSON.stringify({
						opacity: ancestor?.opacity,
						transform: ancestor?.transform,
						filter: ancestor?.filter,
						visibility: ancestor?.visibility,
					});
				}),
			);
			if (signatures.size > 1) {
				changedAncestors.push({
					app,
					depth,
					first: frames[0]?.ancestors[depth] ?? null,
					last: frames.at(-1)?.ancestors[depth] ?? null,
					distinctStates: signatures.size,
					animation:
						frames.find((frame) => frame.ancestors[depth]?.animations?.length)
							?.ancestors[depth].animations[0] ?? null,
				});
			}
		}
	}
	const report = {
		sourceUrl,
		viewport,
		capturedAt: new Date().toISOString(),
		frames: trace.length,
		firstWindowFrame:
			trace.find((frame) => frame.windows.length > 0)?.t ?? null,
		changedAncestors,
	};
	await mkdir(outputRoot, { recursive: true });
	await Promise.all([
		writeFile(
			path.join(outputRoot, "initial-entrance-trace.json"),
			`${JSON.stringify(trace, null, 2)}\n`,
		),
		writeFile(
			path.join(outputRoot, "initial-entrance-report.json"),
			`${JSON.stringify(report, null, 2)}\n`,
		),
	]);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await session.close();
}
