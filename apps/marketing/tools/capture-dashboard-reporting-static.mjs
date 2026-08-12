import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const assetRoot = path.join(marketingRoot, "public/vendor/attio-dashboard");
const artifactRoot = path.resolve(
	marketingRoot,
	"../../.context/extractions/dashboard/reporting-static-dpr3",
);
const sourceUrl = "http://127.0.0.1:4180/?opaline-composition=lens-attio-lens";
const captureViewport = process.env.OPALINE_CAPTURE_VIEWPORT;
const viewports = [
	{ name: "phone", width: 390, height: 844, dpr: 3, mobile: true },
	{ name: "tablet", width: 768, height: 1024, dpr: 3, mobile: false },
	{ name: "desktop", width: 1280, height: 800, dpr: 3, mobile: false },
	{ name: "wide", width: 1680, height: 1050, dpr: 3, mobile: false },
].filter((viewport) => !captureViewport || viewport.name === captureViewport);
if (viewports.length === 0) {
	throw new Error(`Unknown capture viewport: ${captureViewport}`);
}

const visibleReportingPanel = `(() => [...document.querySelectorAll(
	"[data-home-hero-preview-tab=Reporting]",
)].find((element) => {
	const bounds = element.getBoundingClientRect();
	return bounds.width > 0 && bounds.height > 0;
}))()`;
const reportingCaptureRoot = (mobile) =>
	mobile
		? `(() => {
			const panel = ${visibleReportingPanel};
			return panel?.parentElement?.parentElement ?? null;
		})()`
		: visibleReportingPanel;

const capturePanel = async (session, outputPath, mobile) => {
	const geometry = await session.evaluate(`(() => {
		const captureRoot = ${reportingCaptureRoot(mobile)};
		if (!(captureRoot instanceof HTMLElement)) throw new Error("Reporting capture root is unavailable");
		const bounds = captureRoot.getBoundingClientRect();
		return {
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			scrollX,
			scrollY,
		};
	})()`);
	const screenshot = await session.client.call("Page.captureScreenshot", {
		format: "png",
		fromSurface: true,
		captureBeyondViewport: true,
		clip: {
			x: geometry.x + geometry.scrollX,
			y: geometry.y + geometry.scrollY,
			width: geometry.width,
			height: geometry.height,
			scale: 1,
		},
	});
	const bytes = Buffer.from(screenshot.data, "base64");
	await writeFile(outputPath, bytes);
	const png = PNG.sync.read(bytes);
	return {
		outputPath,
		cssSize: { width: geometry.width, height: geometry.height },
		pixelSize: { width: png.width, height: png.height },
		density: {
			x: png.width / geometry.width,
			y: png.height / geometry.height,
		},
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
};

const removeSanctionedControls = async (session, mobile) =>
	session.evaluate(
		`new Promise((resolve) => {
			const panel = ${reportingCaptureRoot(mobile)};
			if (!(panel instanceof HTMLElement)) throw new Error("Reporting capture root is unavailable");
			const normalize = (value) => value.replace(/\\s+/g, " ").trim();
			const removed = [];
			for (const label of ["Ask Attio", "Workflows"]) {
				const target = [...panel.querySelectorAll("*")]
					.filter((element) => element.querySelector("svg") && normalize(element.textContent ?? "") === label)
					.toSorted((left, right) => left.outerHTML.length - right.outerHTML.length)[0];
				if (!(target instanceof HTMLElement)) throw new Error("Could not remove " + label);
				removed.push(label);
				target.remove();
			}
			requestAnimationFrame(() => requestAnimationFrame(() => resolve(removed)));
		})`,
		{ awaitPromise: true },
	);

await Promise.all([
	mkdir(assetRoot, { recursive: true }),
	mkdir(artifactRoot, { recursive: true }),
]);

const captures = [];
for (const viewport of viewports) {
	const session = await createBrowserSession({ url: sourceUrl, ...viewport });
	try {
		await session.waitFor(
			'document.querySelector("[data-opaline-use-case=Reporting]")',
		);
		await session.evaluate("scrollTo(0, 400)");
		await wait(1_750);
		await session.evaluate(
			'document.querySelector("[data-opaline-use-case=Reporting]")?.click()',
		);
		await session.waitFor(`Boolean(${visibleReportingPanel})`, {
			timeout: 12_000,
		});
		// This is the already-approved static fallback timing, not another attempt
		// to modify or iterate the rejected live-DOM paint predicate.
		await wait(6_000);

		const sourceFilename = `reporting-panel-${viewport.name}-source@3x.png`;
		const brandedFilename = `reporting-panel-${viewport.name}-branded@3x.png`;
		const source = await capturePanel(
			session,
			path.join(assetRoot, sourceFilename),
			viewport.mobile,
		);
		const removed = await removeSanctionedControls(session, viewport.mobile);
		const branded = await capturePanel(
			session,
			path.join(assetRoot, brandedFilename),
			viewport.mobile,
		);
		captures.push({
			viewport,
			removed,
			source: { ...source, filename: sourceFilename },
			branded: { ...branded, filename: brandedFilename },
		});
		console.log(
			`${viewport.name}: ${branded.pixelSize.width}×${branded.pixelSize.height} (${branded.density.x.toFixed(3)}×)`,
		);
	} finally {
		await session.close();
	}
}

const metadataPath = path.join(artifactRoot, "metadata.json");
const previousCaptures = captureViewport
	? await readFile(metadataPath, "utf8")
			.then((source) => JSON.parse(source).captures ?? [])
			.catch(() => [])
	: [];
const captureNames = new Set(captures.map((capture) => capture.viewport.name));
const combinedCaptures = [
	...previousCaptures.filter(
		(capture) => !captureNames.has(capture.viewport.name),
	),
	...captures,
].toSorted(
	(left, right) =>
		["phone", "tablet", "desktop", "wide"].indexOf(left.viewport.name) -
		["phone", "tablet", "desktop", "wide"].indexOf(right.viewport.name),
);
const passed =
	combinedCaptures.length === 4 &&
	combinedCaptures.every(
		(capture) =>
			capture.removed.length === 2 &&
			capture.source.density.x >= 2.99 &&
			capture.source.density.y >= 2.99 &&
			capture.branded.density.x >= 2.99 &&
			capture.branded.density.y >= 2.99,
	);
await writeFile(
	metadataPath,
	`${JSON.stringify(
		{
			gate: "dashboard-reporting-dpr3-capture",
			generatedAt: new Date().toISOString(),
			passed,
			sourceUrl,
			captures: combinedCaptures,
		},
		null,
		2,
	)}\n`,
);
if (!passed) process.exitCode = 1;
