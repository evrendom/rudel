import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBrowserSession, wait } from "./driver.mjs";

const outputRoot = path.resolve(
	process.env.OPALINE_AMBIENT_OUTPUT ??
		".context/extractions/dashboard/ambient",
);
const sourceUrl =
	"http://127.0.0.1:4180/lens-attio-lens-aperture";
const viewport = { width: 1280, height: 800, dpr: 1, mobile: false };
const durationMs = Number(process.env.OPALINE_AMBIENT_DURATION ?? 40_000);

const session = await createBrowserSession({ url: sourceUrl, ...viewport });
try {
	await session.completeAperture();
	const compositionFrame = (await session.frameTree()).find((frame) =>
		frame.url.includes("opaline-composition=lens-attio-lens"),
	);
	if (!compositionFrame) throw new Error("Attio composition frame was not found");
	await session.waitFor(
		'document.querySelector("[data-home-hero=attio-window-shell]") && document.querySelectorAll("[data-home-hero=desktop-window]").length >= 3',
		{ frameId: compositionFrame.id, timeout: 20_000 },
	);

	const entrance = await session.evaluate(
		`new Promise((resolve) => {
			const startedAt = performance.now();
			const frames = [];
			const round = (value) => Number(Number(value).toFixed(4));
			const sample = () => {
				const t = performance.now() - startedAt;
				frames.push({
					t: round(t),
					scrollY,
					windows: [...document.querySelectorAll('[data-home-hero="desktop-window"]')].map((element) => {
						const style = getComputedStyle(element);
						const rect = element.getBoundingClientRect();
						return {
							app: element.getAttribute('data-home-hero-app'),
							opacity: round(style.opacity),
							transform: style.transform,
							filter: style.filter,
							backgroundColor: style.backgroundColor,
							rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
						};
					}),
				});
				if (t < 1_250) requestAnimationFrame(sample);
				else resolve(frames);
			};
			scrollTo(0, 0);
			requestAnimationFrame(() => {
				requestAnimationFrame(sample);
				scrollTo(0, 500);
			});
		})`,
		{ frameId: compositionFrame.id, awaitPromise: true },
	);

	await wait(250);
	await session.evaluate(
		`(() => {
			const round = (value) => Number(Number(value).toFixed(4));
			const visibleText = (element) => element?.innerText?.replace(/\\u00a0/g, ' ').trim() ?? '';
			const terminalState = (windowElement) => {
				const root = windowElement.querySelector(':scope > [data-opaline-claude-code]') ?? windowElement;
				const content = [...root.querySelectorAll('div')].find((element) =>
					element.classList.contains('bg-black-50') && element.classList.contains('font-mono')
				);
				const body = content?.children[0];
				const responseGrid = body?.children[0];
				const tokenRow = body?.children[1];
				const promptGrid = body?.children[2];
				return {
					app: windowElement.getAttribute('data-home-hero-app'),
					response: visibleText(responseGrid?.children[1]),
					token: visibleText(tokenRow),
					prompt: visibleText(promptGrid?.children[1]),
					all: visibleText(content),
				};
			};
			const tableState = () => {
				const table = document.querySelector('.home-ui-data-table');
				const cells = [...document.querySelectorAll('[data-home-hero="attio-window-shell"] span')]
					.filter((element) => element.children.length === 0 && element.textContent === 'AI is thinking...')
					.map((leaf, index) => {
						const thinking = leaf.parentElement?.parentElement;
						const overlay = thinking?.nextElementSibling;
						const result = overlay?.nextElementSibling;
						const thinkingStyle = thinking ? getComputedStyle(thinking) : null;
						const overlayStyle = overlay ? getComputedStyle(overlay) : null;
						const resultStyle = result ? getComputedStyle(result) : null;
						return {
							index,
							thinkingOpacity: round(thinkingStyle?.opacity ?? 0),
							thinkingTransform: thinkingStyle?.transform ?? 'none',
							thinkingBackgroundPosition: getComputedStyle(leaf).backgroundPosition,
							overlayOpacity: round(overlayStyle?.opacity ?? 0),
							resultOpacity: round(resultStyle?.opacity ?? 0),
							resultTransform: resultStyle?.transform ?? 'none',
							result: visibleText(result),
						};
					});
				return {
					start: table?.style.getPropertyValue('--home-ui-data-table-start') ?? '',
					end: table?.style.getPropertyValue('--home-ui-data-table-end') ?? '',
					thinkingCount: cells.filter((cell) => cell.thinkingOpacity > 0.5).length,
					resultCount: cells.filter((cell) => cell.resultOpacity > 0.5).length,
					cells,
				};
			};
			const state = () => ({
				terminals: [...document.querySelectorAll('[data-home-hero="desktop-window"]')].map(terminalState),
				table: tableState(),
				windows: [...document.querySelectorAll('[data-home-hero="desktop-window"]')].map((element) => {
					const style = getComputedStyle(element);
					return {
						app: element.getAttribute('data-home-hero-app'),
						opacity: round(style.opacity),
						transform: style.transform,
						filter: style.filter,
						backgroundColor: style.backgroundColor,
					};
				}),
			});
			document.querySelector('#opaline-ambient-trace-output')?.remove();
			const output = document.createElement('output');
			output.id = 'opaline-ambient-trace-output';
			output.hidden = true;
			output.dataset.recording = 'true';
			document.body.append(output);
			const trace = [];
			const startedAt = performance.now();
			let previous = '';
			const tick = () => {
				if (output.dataset.recording !== 'true') return;
				const next = state();
				const signature = JSON.stringify(next);
				if (signature !== previous) {
					trace.push({
						t: round(performance.now() - startedAt),
						...next,
					});
					previous = signature;
					output.textContent = JSON.stringify(trace);
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		})()`,
		{ frameId: compositionFrame.id },
	);

	await wait(durationMs);
	const ambient = await session.evaluate(
		`(() => {
			const output = document.querySelector('#opaline-ambient-trace-output');
			output.dataset.recording = 'false';
			return JSON.parse(output.textContent || '[]');
		})()`,
		{ frameId: compositionFrame.id },
	);
	await session.screenshot(path.join(outputRoot, "source-settled.png"));

	const report = {
		sourceUrl,
		viewport,
		durationMs,
		capturedAt: new Date().toISOString(),
		entranceFrames: entrance.length,
		ambientKeyframes: ambient.length,
		terminalSignatures: Object.fromEntries(
			["call", "slack", "terminal"].map((app) => [
				app,
				new Set(
					ambient.map(
						(frame) =>
							frame.terminals.find((terminal) => terminal.app === app)?.all ?? "",
					),
				).size,
			]),
		),
		tableThinkingCounts: [
			...new Set(ambient.map((frame) => frame.table.thinkingCount)),
		],
		tableResultCounts: [
			...new Set(ambient.map((frame) => frame.table.resultCount)),
		],
		settledWindows: ambient.at(-1)?.windows ?? [],
	};

	await mkdir(outputRoot, { recursive: true });
	await Promise.all([
		writeFile(
			path.join(outputRoot, "entrance-trace.json"),
			`${JSON.stringify(entrance, null, 2)}\n`,
		),
		writeFile(
			path.join(outputRoot, "ambient-trace.json"),
			`${JSON.stringify(ambient, null, 2)}\n`,
		),
		writeFile(
			path.join(outputRoot, "reference-report.json"),
			`${JSON.stringify(report, null, 2)}\n`,
		),
	]);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await session.close();
}
