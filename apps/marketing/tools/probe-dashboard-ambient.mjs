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

const session = await createBrowserSession({ url: sourceUrl, ...viewport });
try {
	await session.completeAperture();
	const compositionFrame = (await session.frameTree()).find((frame) =>
		frame.url.includes("opaline-composition=lens-attio-lens"),
	);
	if (!compositionFrame) throw new Error("Attio composition frame was not found");
	await session.waitFor(
		'document.querySelector("[data-home-hero=attio-window-shell]") && document.querySelectorAll("[data-opaline-claude-window]").length >= 2',
		{ frameId: compositionFrame.id, timeout: 20_000 },
	);
	await session.evaluate("scrollTo(0, 400)", { frameId: compositionFrame.id });
	await wait(1_000);

	const inventory = await session.evaluate(`(() => {
		const shell = document.querySelector('[data-home-hero="attio-window-shell"]');
		const elementPath = (element, root) => {
			const parts = [];
			let current = element;
			while (current && current !== root) {
				const parent = current.parentElement;
				if (!parent) break;
				parts.unshift(Array.prototype.indexOf.call(parent.children, current));
				current = parent;
			}
			return parts.join('.');
		};
		const summarize = (element, root) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return {
				path: elementPath(element, root),
				tag: element.tagName.toLowerCase(),
				attributes: Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value])),
				text: element.textContent.replace(/\\s+/g, ' ').trim(),
				rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
				style: {
					display: style.display,
					visibility: style.visibility,
					opacity: style.opacity,
					transform: style.transform,
					translate: style.translate,
					filter: style.filter,
					backgroundColor: style.backgroundColor,
					color: style.color,
				},
			};
		};
		const windows = [...document.querySelectorAll('[data-home-hero="desktop-window"]')];
		const animated = [...document.querySelectorAll('*')]
			.filter((element) => element.getAnimations().length > 0)
			.map((element) => ({
				...summarize(element, shell),
				animations: element.getAnimations().map((animation) => ({
					currentTime: animation.currentTime,
					playState: animation.playState,
					playbackRate: animation.playbackRate,
					timing: animation.effect?.getComputedTiming(),
					keyframes: animation.effect?.getKeyframes(),
				})),
			}));
		const thinking = [...shell.querySelectorAll('*')]
			.filter((element) => element.children.length === 0 && element.textContent.includes('AI is thinking'))
			.map((element) => summarize(element, shell));
		const markers = [...shell.querySelectorAll('*')]
			.filter((element) => [...element.attributes].some(({ name }) => name.startsWith('data-home-hero') || name.startsWith('data-framer')))
			.map((element) => summarize(element, shell));
		const thinkingAncestors = [...shell.querySelectorAll('*')]
			.filter((element) => element.children.length === 0 && element.textContent.includes('AI is thinking'))
			.slice(0, 2)
			.map((element) => {
				const ancestors = [];
				let current = element;
				for (let depth = 0; current && current !== shell && depth < 8; depth += 1) {
					ancestors.push(summarize(current, shell));
					current = current.parentElement;
				}
				return ancestors;
			});
		const firstThinkingLeaf = [...shell.querySelectorAll('*')].find(
			(element) => element.children.length === 0 && element.textContent.includes('AI is thinking'),
		);
		const firstThinkingLayer = firstThinkingLeaf?.parentElement?.parentElement;
		const firstThinkingCell = firstThinkingLayer?.parentElement?.parentElement;
		const leaves = [...shell.querySelectorAll('*')]
			.filter((element) => element.children.length === 0 && element.textContent.trim())
			.map((element) => summarize(element, shell));
		return {
			shell: summarize(shell, shell),
			windows: windows.map((element) => summarize(element, shell)),
			animated,
			thinking,
			markers,
			thinkingAncestors,
			firstThinkingCellHtml: firstThinkingCell?.outerHTML ?? null,
			terminalHtml: windows.find((element) => element.getAttribute('data-home-hero-app') === 'terminal')?.outerHTML ?? null,
			leaves,
		};
	})()`, { frameId: compositionFrame.id });

	await mkdir(outputRoot, { recursive: true });
	await writeFile(
		path.join(outputRoot, "inventory.json"),
		`${JSON.stringify({ sourceUrl, viewport, capturedAt: new Date().toISOString(), ...inventory }, null, 2)}\n`,
	);
	console.log(
		JSON.stringify(
			{
				windows: inventory.windows.map(({ path: nodePath, attributes, text, style, rect }) => ({
					path: nodePath,
					app: attributes["data-home-hero-app"],
					text,
					style,
					rect,
				})),
				animatedCount: inventory.animated.length,
				thinkingCount: inventory.thinking.length,
				markers: inventory.markers.map(({ path: nodePath, attributes, text, style, rect }) => ({
					path: nodePath,
					attributes,
					text,
					style,
					rect,
				})),
				thinkingAncestors: inventory.thinkingAncestors,
				output: path.join(outputRoot, "inventory.json"),
			},
			null,
			2,
		),
	);
} finally {
	await session.close();
}
