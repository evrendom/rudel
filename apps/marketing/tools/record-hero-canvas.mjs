import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/hero-canvas/recording",
);
await mkdir(outputRoot, { recursive: true });

const dynamicTimeHook = `(() => {
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
			const forced = Number(document.documentElement.dataset.opalineCanvasTime);
			return originalUniform1f.call(
				this,
				location,
				names.get(location) === "time" && Number.isFinite(forced) ? forced : value,
			);
		};
	};
	for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
		if (Context) install(Context);
	}
})();`;

const source = await createBrowserSession({ width: 1280, height: 800 });
const candidate = await createBrowserSession({
	url: "http://127.0.0.1:4321/preview/hero-canvas?opaline-canvas-time=0",
	width: 1280,
	height: 800,
});

const combine = async (leftPath, rightPath, outputPath) => {
	const left = PNG.sync.read(await readFile(leftPath));
	const right = PNG.sync.read(await readFile(rightPath));
	const output = new PNG({
		width: left.width + right.width,
		height: Math.max(left.height, right.height),
	});
	for (let row = 0; row < left.height; row += 1) {
		const leftStart = row * left.width * 4;
		const outputStart = row * output.width * 4;
		output.data.set(
			left.data.subarray(leftStart, leftStart + left.width * 4),
			outputStart,
		);
	}
	for (let row = 0; row < right.height; row += 1) {
		const rightStart = row * right.width * 4;
		const outputStart = (row * output.width + left.width) * 4;
		output.data.set(
			right.data.subarray(rightStart, rightStart + right.width * 4),
			outputStart,
		);
	}
	await writeFile(outputPath, PNG.sync.write(output));
};

try {
	await source.client.call("Page.addScriptToEvaluateOnNewDocument", {
		source: dynamicTimeHook,
	});
	await source.navigate(
		"http://127.0.0.1:4175/__lens-atoms/hero?opaline-layer=canvas",
	);
	const sourceFrame = await source.frameByName("lens-canvas-source");
	const sourceRoot = (await source.frameTree())[0];
	await source.waitFor(
		"[...document.querySelectorAll('canvas')].some((canvas) => canvas.width === 1280 && canvas.height === 800)",
		{ frameId: sourceFrame.id, timeout: 20_000 },
	);
	await source.evaluate(
		`(() => {
			const style = document.createElement("style");
			style.textContent = "body > :not(#lens-canvas-source):not(script) { visibility: hidden !important; } #lens-canvas-source { visibility: visible !important; }";
			document.head.append(style);
		})()`,
		{ frameId: sourceRoot.id },
	);
	await candidate.waitFor(
		'document.querySelector("[data-hero-canvas-stage]")?.hasAttribute("data-canvas-ready")',
		{ timeout: 10_000 },
	);

	const frames = [];
	for (let index = 0; index < 20; index += 1) {
		const seconds = index / 2;
		await source.evaluate(
			`document.documentElement.dataset.opalineCanvasTime = ${JSON.stringify(String(seconds))}`,
			{ frameId: sourceFrame.id },
		);
		await candidate.evaluate(
			`(() => { document.documentElement.dataset.opalineCanvasTime = ${JSON.stringify(String(seconds))}; dispatchEvent(new Event("resize")); })()`,
		);
		await wait(80);
		const suffix = String(index).padStart(3, "0");
		const sourcePath = path.join(outputRoot, `source-${suffix}.png`);
		const candidatePath = path.join(outputRoot, `candidate-${suffix}.png`);
		const abPath = path.join(outputRoot, `ab-${suffix}.png`);
		await source.screenshot(sourcePath);
		await candidate.screenshot(candidatePath);
		const pixel = await comparePngs({
			leftPath: sourcePath,
			rightPath: candidatePath,
			diffPath: path.join(outputRoot, `diff-${suffix}.png`),
		});
		await combine(sourcePath, candidatePath, abPath);
		frames.push({ index, seconds, pixel, sourcePath, candidatePath, abPath });
	}

	const videoPath = path.join(outputRoot, "canvas-ab-10s.webm");
	const ffmpeg = spawnSync(
		"ffmpeg",
		[
			"-y",
			"-loglevel",
			"error",
			"-framerate",
			"2",
			"-i",
			path.join(outputRoot, "ab-%03d.png"),
			"-c:v",
			"libvpx-vp9",
			"-b:v",
			"8M",
			"-pix_fmt",
			"yuv420p",
			videoPath,
		],
		{ encoding: "utf8" },
	);
	if (ffmpeg.status !== 0) {
		throw new Error(
			ffmpeg.stderr || "ffmpeg failed to encode the A/B recording",
		);
	}
	const report = {
		generatedAt: new Date().toISOString(),
		durationSeconds: 10,
		framesPerSecond: 2,
		left: "reference",
		right: "candidate",
		maximumDiffPercent: Math.max(
			...frames.map(({ pixel }) => pixel.diffPercent),
		),
		videoPath,
		frames,
	};
	await writeFile(
		path.join(outputRoot, "report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	console.log(
		JSON.stringify(
			{
				maximumDiffPercent: report.maximumDiffPercent,
				videoPath,
			},
			null,
			2,
		),
	);
} finally {
	await Promise.all([source.close(), candidate.close()]);
}
