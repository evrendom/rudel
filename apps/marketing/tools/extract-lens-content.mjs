import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const sourceUrl = "http://127.0.0.1:4175/build?opaline-source=lens-content";
const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const vendorRoot = path.join(marketingRoot, "src/styles/vendor/lens/content");
const generatedRoot = path.join(marketingRoot, "src/components/generated");
const assetRoot = path.join(marketingRoot, "public/vendor/lens-content");
const artifactRoot = path.resolve(
	marketingRoot,
	"../../.context/extractions/lens-content",
);

const session = await createBrowserSession({
	url: sourceUrl,
	width: 1280,
	height: 800,
	dpr: 1,
});
let capture;
try {
	await session.waitFor(
		'document.querySelector("body > main > :nth-child(2)")?.getBoundingClientRect().height > 0',
	);
	await session.waitFor(
		'[...document.querySelectorAll("main img")].filter((image) => image.getBoundingClientRect().width > 0).every((image) => image.complete && image.naturalWidth > 0)',
	);
	await wait(500);
	await mkdir(artifactRoot, { recursive: true });
	await session.screenshot(path.join(artifactRoot, "source-top.png"));
	capture = await session.evaluate(`(() => {
		const main = document.querySelector("body > main");
		if (!(main instanceof HTMLElement)) throw new Error("Lens content source main is unavailable");
		const sections = [...main.querySelectorAll("section")]
			.map((section, index) => {
				const rect = section.getBoundingClientRect();
				return {
					index,
					display: getComputedStyle(section).display,
					y: rect.y,
					width: rect.width,
					height: rect.height,
					text: section.textContent?.replace(/\\s+/g, " ").trim().slice(0, 120) ?? "",
				};
			})
			.filter((section) => section.display !== "none" && section.height > 0);
		const footer = main.querySelector("footer");
		return {
			mainHtml: main.outerHTML,
			pageRoot: {
				htmlClass: document.documentElement.className,
				htmlStyle: document.documentElement.getAttribute("style") ?? "",
				bodyClass: document.body.className,
			},
			stylesheets: [...document.styleSheets].map((sheet) => sheet.href).filter(Boolean),
			contentSourceCss: document.querySelector("style[data-lens-content-source]")?.textContent ?? "",
			sections,
			footer: footer ? {
				y: footer.getBoundingClientRect().y,
				height: footer.getBoundingClientRect().height,
				text: footer.textContent?.replace(/\\s+/g, " ").trim() ?? "",
			} : null,
			images: [...main.querySelectorAll("img")].map((image) => ({
				src: image.getAttribute("src") ?? "",
				srcset: image.getAttribute("srcset") ?? "",
				currentSrc: image.currentSrc,
			})),
		};
	})()`);
	await session.freezeAtDeterministicState();
	const snapshot = await session.snapshot({
		component: "lens-content",
		sourceUrl,
	});
	await writeFile(
		path.join(artifactRoot, "source.structure.json"),
		`${JSON.stringify(snapshot)}\n`,
	);
} finally {
	await session.close();
}

const uniqueStylesheets = [...new Set(capture.stylesheets)];
const cssChunks = await Promise.all(
	uniqueStylesheets.map(async (url) => {
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(`Could not download ${url}: ${response.status}`);
		return { url, css: await response.text() };
	}),
);

const contentExtension = (url, contentType) => {
	if (contentType.includes("woff2")) return "woff2";
	if (contentType.includes("opentype") || url.includes(".otf")) return "otf";
	if (contentType.includes("svg")) return "svg";
	if (contentType.includes("png")) return "png";
	if (contentType.includes("jpeg")) return "jpg";
	if (contentType.includes("webp")) return "webp";
	const suffix = new URL(url).pathname.split(".").at(-1)?.toLowerCase();
	return suffix && /^[a-z0-9]+$/.test(suffix) ? suffix : "bin";
};

const resourceManifest = [];
const resourceByUrl = new Map();
await mkdir(assetRoot, { recursive: true });
const localizeResource = async (url) => {
	if (resourceByUrl.has(url)) return resourceByUrl.get(url);
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Could not download ${url}: ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const extension = contentExtension(
		url,
		response.headers.get("content-type") ?? "application/octet-stream",
	);
	const filename = `asset-${String(resourceManifest.length + 1).padStart(2, "0")}.${extension}`;
	const localUrl = `/vendor/lens-content/${filename}`;
	await writeFile(path.join(assetRoot, filename), bytes);
	const resource = {
		url,
		filename,
		localUrl,
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
	resourceManifest.push(resource);
	resourceByUrl.set(url, localUrl);
	return localUrl;
};

const localizedCssChunks = [];
for (const chunk of cssChunks) {
	let css = chunk.css;
	const replacements = [];
	for (const match of chunk.css.matchAll(/url\(([^)]+)\)/g)) {
		const raw = match[1].trim().replace(/^['"]|['"]$/g, "");
		if (!raw || raw.startsWith("data:") || raw.startsWith("#")) continue;
		const absoluteUrl = new URL(raw, chunk.url).href;
		const localUrl = await localizeResource(absoluteUrl);
		replacements.push({ raw, localUrl });
	}
	for (const replacement of replacements) {
		css = css.replaceAll(replacement.raw, replacement.localUrl);
	}
	localizedCssChunks.push(css);
}

let mainHtml = capture.mainHtml;
for (const image of capture.images) {
	if (!image.currentSrc) continue;
	const localUrl = await localizeResource(image.currentSrc);
	if (image.src) mainHtml = mainHtml.replaceAll(image.src, localUrl);
	if (image.srcset)
		mainHtml = mainHtml.replaceAll(image.srcset, `${localUrl} 1x`);
}

const sourceCss = localizedCssChunks.join("\n");
await Promise.all([
	mkdir(vendorRoot, { recursive: true }),
	mkdir(generatedRoot, { recursive: true }),
]);
await Promise.all([
	writeFile(path.join(vendorRoot, "source.css"), sourceCss),
	writeFile(
		path.join(vendorRoot, "source-route.css"),
		capture.contentSourceCss,
	),
	writeFile(
		path.join(generatedRoot, "lens-content-source-data.ts"),
		[
			"// Generated by tools/extract-lens-content.mjs from the gated Lens content route.",
			`export const mainHtml = ${JSON.stringify(mainHtml)};`,
			`export const lensContentPageRoot = ${JSON.stringify(capture.pageRoot)} as const;`,
			`export const lensContentAnchors = ${JSON.stringify({ sections: capture.sections, footer: capture.footer })} as const;`,
			"",
		].join("\n"),
	),
	writeFile(path.join(artifactRoot, "main.html"), mainHtml),
	writeFile(
		path.join(artifactRoot, "manifest.json"),
		`${JSON.stringify(
			{
				sourceUrl,
				stylesheets: uniqueStylesheets,
				cssBytes: Buffer.byteLength(sourceCss),
				sourceRouteCssBytes: Buffer.byteLength(capture.contentSourceCss),
				mainBytes: Buffer.byteLength(mainHtml),
				resources: resourceManifest,
				sections: capture.sections,
				footer: capture.footer,
			},
			null,
			2,
		)}\n`,
	),
]);

console.log(
	JSON.stringify(
		{
			cssBytes: Buffer.byteLength(sourceCss),
			sourceRouteCssBytes: Buffer.byteLength(capture.contentSourceCss),
			mainBytes: Buffer.byteLength(mainHtml),
			resources: resourceManifest.length,
			sections: capture.sections.length,
			footer: capture.footer,
		},
		null,
		2,
	),
);
