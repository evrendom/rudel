import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const gateRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/hero-canvas/g1",
);
const posterRoot = path.join(marketingRoot, "public/vendor/lens-canvas");
const sourceUrl =
	"http://127.0.0.1:4175/__lens-atoms/hero?opaline-layer=canvas";
const viewports = [
	{ name: "phone", width: 390, height: 844, mobile: true },
	{ name: "tablet", width: 768, height: 1024, mobile: false },
	{ name: "desktop", width: 1280, height: 800, mobile: false },
	{ name: "wide", width: 1680, height: 1050, mobile: false },
];

const freezeLineBgTime = `(() => {
	const install = (Context) => {
		const prototype = Context.prototype;
		const originalGetUniformLocation = prototype.getUniformLocation;
		const originalUniform1f = prototype.uniform1f;
		const names = new WeakMap();
		prototype.getUniformLocation = function(program, name) {
			const location = originalGetUniformLocation.call(this, program, name);
			if (location) names.set(location, name);
			return location;
		};
		prototype.uniform1f = function(location, value) {
			return originalUniform1f.call(
				this,
				location,
				names.get(location) === "time" ? 0 : value,
			);
		};
	};
	for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
		if (Context) install(Context);
	}
})();`;

await Promise.all([
	mkdir(gateRoot, { recursive: true }),
	mkdir(posterRoot, { recursive: true }),
]);

for (const viewport of viewports) {
	const session = await createBrowserSession(viewport);
	try {
		await session.client.call("Page.addScriptToEvaluateOnNewDocument", {
			source: freezeLineBgTime,
		});
		await session.navigate(sourceUrl);
		const canvasFrame = await session.frameByName("lens-canvas-source");
		await session.waitFor(
			`[...document.querySelectorAll('canvas')].some((canvas) => canvas.width === ${viewport.width} && canvas.height === ${viewport.height})`,
			{ frameId: canvasFrame.id, timeout: 20_000 },
		);
		const rootFrame = (await session.frameTree())[0];
		await session.evaluate(
			`(() => {
				const style = document.createElement("style");
				style.textContent = "body > :not(#lens-canvas-source):not(script) { visibility: hidden !important; } #lens-canvas-source { visibility: visible !important; }";
				document.head.append(style);
			})()`,
			{ frameId: rootFrame.id },
		);
		await wait(500);
		const sourceScreenshot = path.join(
			gateRoot,
			`source-first-frame-${viewport.name}.png`,
		);
		const posterPath = path.join(
			posterRoot,
			`hero-poster-${viewport.name}.png`,
		);
		await session.screenshot(sourceScreenshot);
		await copyFile(sourceScreenshot, posterPath);
		if (viewport.name === "desktop") {
			await copyFile(
				sourceScreenshot,
				path.join(gateRoot, "source-first-frame.png"),
			);
			await copyFile(posterPath, path.join(posterRoot, "hero-poster.png"));
		}
		console.log(`${viewport.name}: ${sourceScreenshot}`);
	} finally {
		await session.close();
	}
}
