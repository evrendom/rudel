import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot = resolve(root, "../../../..");
const { values: args } = parseArgs({
	args: process.argv.slice(2),
	options: {
		fragment: { type: "string" },
		page: { type: "string" },
	},
});
const pageSourcePath = resolve(
	workspaceRoot,
	args.page ||
		".context/attachments/nRAhuX/pasted_text_2026-08-13_11-52-49.txt",
);
const fragmentSourcePath = resolve(
	workspaceRoot,
	args.fragment ||
		".context/attachments/J6V24a/pasted_text_2026-08-13_11-52-38.txt",
);
const pageOutputPath = resolve(root, "interfere-engineers-v2.capture.html");
const heroOutputPath = resolve(
	root,
	"interfere-engineers-v2-hero.capture.html",
);
const inventoryOutputPath = resolve(
	root,
	"interfere-engineers-v2.inventory.json",
);
const inventoryGuidePath = resolve(root, "INTERFERE-ENGINEERS-V2-DESIGN.md");
const assetsDirectoryName = "engineers-v2-assets";
const assetsDirectory = resolve(root, assetsDirectoryName);
const sourceUrl = "https://interfere.com/product/engineers";
const replicaRuntimeName = "engineers-v2-runtime.js";

const stylesheetUrls = [
	"https://assets.interfere.com/assets/globals-B_d8NU87.css",
	"https://assets.interfere.com/assets/logo-wall-CIY0ozwo.css",
	"https://assets.interfere.com/assets/persona-feature-grid-DDaQJLUS.css",
	"https://assets.interfere.com/assets/engineers-CnpybajK.css",
];

const replicaRuntime = `const initializeReplica = () => {
	const root = document.documentElement;
	root.dataset.opalineReplicaRuntime = "ready";

	const updateScrolledState = () => {
		root.toggleAttribute("data-scrolled", window.scrollY > 8);
	};
	updateScrolledState();
	window.addEventListener("scroll", updateScrolledState, { passive: true });

	if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		for (const spinner of document.querySelectorAll(
			'output[aria-label="Loading"] > svg',
		)) {
			const capturedAngle = Number.parseFloat(
				spinner.style.transform.match(/rotate\\(([-.\\d]+)deg\\)/)?.[1] || "0",
			);
			spinner.animate(
				[
					{ transform: \`rotate(\${capturedAngle}deg)\` },
					{ transform: \`rotate(\${capturedAngle + 360}deg)\` },
				],
				{ duration: 1_000, iterations: Infinity, easing: "linear" },
			);
		}
	}

	for (const button of document.querySelectorAll(
		'button[aria-label="Scroll changelog left"], button[aria-label="Scroll changelog right"]',
	)) {
		button.addEventListener("click", () => {
			const direction = button.getAttribute("aria-label")?.endsWith("right")
				? 1
				: -1;
			const section = button.closest("section") || button.parentElement;
			const scroller = section?.querySelector(
				'[data-slot="scroll-area-viewport"], [data-overflow-x-start], .overflow-x-auto',
			);
			if (scroller instanceof HTMLElement) {
				scroller.scrollBy({
					behavior: "smooth",
					left: direction * Math.max(240, scroller.clientWidth * 0.7),
				});
			}
		});
	}
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeReplica, { once: true });
} else {
	initializeReplica();
}
`;

function sha1(value) {
	return createHash("sha1").update(value).digest("hex");
}

function localAssetName(url) {
	return decodeURIComponent(basename(new URL(url).pathname)).replaceAll(
		" ",
		"-",
	);
}

async function fetchAsset(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Unable to fetch ${url}: ${response.status}`);
	}
	return Buffer.from(await response.arrayBuffer());
}

async function fetchImageAsset(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Unable to fetch ${url}: ${response.status}`);
	}
	const contentType = response.headers.get("content-type")?.split(";", 1)[0];
	const extension = new Map([
		["image/avif", "avif"],
		["image/gif", "gif"],
		["image/jpeg", "jpg"],
		["image/png", "png"],
		["image/svg+xml", "svg"],
		["image/webp", "webp"],
	]).get(contentType);
	if (!extension) {
		throw new Error(
			`Unsupported image type ${contentType || "unknown"}: ${url}`,
		);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	const sourceName = new URL(url).pathname.split("/").at(-2) || "image";
	const slug = sourceName.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
	return {
		buffer,
		contentType,
		name: `${slug}-${sha1(url).slice(0, 10)}.${extension}`,
		url,
	};
}

function sourceImageUrls(...sources) {
	const urls = new Set();
	for (const source of sources) {
		for (const match of source.matchAll(
			/\b(?:src|poster)=(['"])(https:\/\/images\.interfere\.com\/[^'"<>\s]+)\1/gi,
		)) {
			urls.add(match[2]);
		}
	}
	return [...urls].sort();
}

function stripOriginRuntime(html) {
	return html
		.replace(/<link\b[^>]*\brel=(['"])modulepreload\1[^>]*>/gi, "")
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) =>
			/type=(['"])application\/ld\+json\1/i.test(script) ? script : "",
		);
}

function absolutizeOriginRelativeUrls(html) {
	return html.replace(
		/\b(href|src|action|poster)=(['"])(\/(?!\/)[^'"<>]*)\2/gi,
		(_match, attribute, quote, value) =>
			`${attribute}=${quote}${new URL(value, sourceUrl).href}${quote}`,
	);
}

function addReferenceHead(html, stylesheetNames) {
	const referenceHead = [
		'<meta name="opaline-reference" content="interfere-engineers-v2">',
		...stylesheetNames.map(
			(name) =>
				`<link rel="stylesheet" href="/${assetsDirectoryName}/${name}" data-opaline-local-stylesheet>`,
		),
		`<script type="module" src="/${assetsDirectoryName}/${replicaRuntimeName}" data-opaline-replica-runtime></script>`,
	].join("");
	return html.replace(/<head>/i, `<head>${referenceHead}`);
}

function removeRemoteStylesheets(html) {
	return html.replace(/<link\b[^>]*\brel=(['"])stylesheet\1[^>]*>/gi, (link) =>
		/https:\/\/assets\.interfere\.com\/assets\//i.test(link) ? "" : link,
	);
}

function markReference(html) {
	const marked = html.replace(
		/<html\b/i,
		'<html data-opaline-reference="interfere-engineers-v2"',
	);
	return /^\s*<!doctype html>/i.test(marked)
		? marked
		: `<!doctype html>\n${marked}`;
}

function classCounts(source) {
	const counts = new Map();
	for (const match of source.matchAll(/\bclass=(['"])([\s\S]*?)\1/g)) {
		for (const token of match[2].split(/\s+/).filter(Boolean)) {
			counts.set(token, (counts.get(token) || 0) + 1);
		}
	}
	return Object.fromEntries(
		[...counts.entries()].sort((left, right) =>
			left[0].localeCompare(right[0]),
		),
	);
}

function customProperties(css) {
	const properties = new Map();
	for (const match of css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)/g)) {
		const values = properties.get(match[1]) || new Set();
		values.add(match[2].trim());
		properties.set(match[1], values);
	}
	return Object.fromEntries(
		[...properties.entries()]
			.sort((left, right) => left[0].localeCompare(right[0]))
			.map(([name, values]) => [name, [...values]]),
	);
}

function inlineStyleProperties(source) {
	const counts = new Map();
	for (const styleMatch of source.matchAll(/\bstyle=(['"])([\s\S]*?)\1/g)) {
		for (const declaration of styleMatch[2].split(";")) {
			const name = declaration.split(":", 1)[0]?.trim();
			if (name) counts.set(name, (counts.get(name) || 0) + 1);
		}
	}
	return Object.fromEntries(
		[...counts.entries()].sort((left, right) => right[1] - left[1]),
	);
}

function topEntries(record, predicate, limit = 160) {
	return Object.entries(record)
		.filter(([name]) => predicate(name))
		.sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)
		.slice(0, limit)
		.map(([name, count]) => ({ name, count }));
}

function isolatedHeroDocument(fragment, stylesheetNames) {
	const stylesheets = stylesheetNames
		.map(
			(name) =>
				`<link rel="stylesheet" href="/${assetsDirectoryName}/${name}" data-opaline-local-stylesheet>`,
		)
		.join("");
	return `<!doctype html>
<html class="bg-page light" lang="en" style="color-scheme: light;" data-opaline-reference="interfere-engineers-v2-hero">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="opaline-reference" content="interfere-engineers-v2-hero">
<title>Interfere engineers v2 hero reference</title>
${stylesheets}
<script type="module" src="/${assetsDirectoryName}/${replicaRuntimeName}" data-opaline-replica-runtime></script>
<style data-opaline-hero-isolation>
html,body{min-height:100%;margin:0}body{overflow-x:hidden}.opaline-engineers-v2-hero-stage{min-height:100svh;padding-block:3rem 4rem}
</style>
</head>
<body class="bg-page">
<main id="main" class="flex min-h-full w-full flex-1 flex-col">
<section class="to-page opaline-engineers-v2-hero-stage">
<div class="overflow-x-clip">
<div class="mx-auto w-full max-w-[calc(var(--constrained-max)+var(--spacing)*6*2)] px-6 sm:max-w-[calc(var(--constrained-max)+var(--spacing)*5.5*2)] sm:px-5.5">
${fragment.trim()}
</div>
</div>
</section>
</main>
</body>
</html>`;
}

await mkdir(assetsDirectory, { recursive: true });
const [pageSource, fragmentSource] = await Promise.all([
	readFile(pageSourcePath, "utf8"),
	readFile(fragmentSourcePath, "utf8"),
]);

const imageAssets = await Promise.all(
	sourceImageUrls(pageSource, fragmentSource).map(fetchImageAsset),
);
await writeFile(resolve(assetsDirectory, replicaRuntimeName), replicaRuntime);
const runtimeAsset = {
	bytes: Buffer.byteLength(replicaRuntime),
	name: replicaRuntimeName,
	sha1: sha1(replicaRuntime),
};
for (const asset of imageAssets) {
	await writeFile(resolve(assetsDirectory, asset.name), asset.buffer);
	asset.bytes = asset.buffer.byteLength;
	asset.sha1 = sha1(asset.buffer);
}

const stylesheetAssets = [];
const fontUrls = new Set();
for (const url of stylesheetUrls) {
	const sourceBuffer = await fetchAsset(url);
	const sourceCss = sourceBuffer.toString("utf8");
	for (const match of sourceCss.matchAll(
		/url\((?:['"])?(https:\/\/assets\.interfere\.com\/assets\/[^)'"\s]+)(?:['"])?\)/g,
	)) {
		fontUrls.add(match[1]);
	}
	stylesheetAssets.push({
		url,
		name: localAssetName(url),
		sourceCss,
	});
}

const fontAssets = [];
for (const url of [...fontUrls].sort()) {
	const buffer = await fetchAsset(url);
	const name = localAssetName(url);
	await writeFile(resolve(assetsDirectory, name), buffer);
	fontAssets.push({ bytes: buffer.byteLength, name, sha1: sha1(buffer), url });
}

for (const asset of stylesheetAssets) {
	let localizedCss = asset.sourceCss;
	for (const font of fontAssets) {
		localizedCss = localizedCss.replaceAll(font.url, `./${font.name}`);
	}
	await writeFile(resolve(assetsDirectory, asset.name), localizedCss);
	asset.bytes = Buffer.byteLength(localizedCss);
	asset.sha1 = sha1(localizedCss);
	asset.localizedCss = localizedCss;
}

const stylesheetNames = stylesheetAssets.map((asset) => asset.name);
let pageCapture = markReference(
	addReferenceHead(
		absolutizeOriginRelativeUrls(
			removeRemoteStylesheets(stripOriginRuntime(pageSource)),
		),
		stylesheetNames,
	),
);
for (const font of fontAssets) {
	pageCapture = pageCapture.replaceAll(
		font.url,
		`/${assetsDirectoryName}/${font.name}`,
	);
}
for (const imageAsset of imageAssets) {
	pageCapture = pageCapture.replaceAll(
		imageAsset.url,
		`/${assetsDirectoryName}/${imageAsset.name}`,
	);
}
let localizedFragment = absolutizeOriginRelativeUrls(fragmentSource);
for (const imageAsset of imageAssets) {
	localizedFragment = localizedFragment.replaceAll(
		imageAsset.url,
		`/${assetsDirectoryName}/${imageAsset.name}`,
	);
}
const heroCapture = isolatedHeroDocument(localizedFragment, stylesheetNames);
const classes = classCounts(pageSource);
const fragmentClasses = classCounts(fragmentSource);
const allCss = stylesheetAssets.map((asset) => asset.localizedCss).join("\n");
const inventory = {
	format: "opaline-interfere-design-inventory-v1",
	source: {
		url: sourceUrl,
		page: {
			bytes: Buffer.byteLength(pageSource),
			path: pageSourcePath,
			sha1: sha1(pageSource),
		},
		fragment: {
			bytes: Buffer.byteLength(fragmentSource),
			path: fragmentSourcePath,
			sha1: sha1(fragmentSource),
		},
	},
	outputs: {
		page: basename(pageOutputPath),
		hero: basename(heroOutputPath),
	},
	assets: {
		stylesheets: stylesheetAssets.map(({ bytes, name, sha1: hash, url }) => ({
			bytes,
			name,
			sha1: hash,
			url,
		})),
		fonts: fontAssets,
		images: imageAssets.map(
			({ bytes, contentType, name, sha1: hash, url }) => ({
				bytes,
				contentType,
				name,
				sha1: hash,
				url,
			}),
		),
		scripts: [runtimeAsset],
	},
	design: {
		customProperties: customProperties(allCss),
		inlineStyleProperties: inlineStyleProperties(pageSource),
		keyframes: [...allCss.matchAll(/@keyframes\s+([^\s{]+)/g)]
			.map((match) => match[1])
			.filter((name, index, values) => values.indexOf(name) === index)
			.sort(),
		responsiveClasses: topEntries(classes, (name) => name.includes(":")),
		typographyClasses: topEntries(
			classes,
			(name) => name.startsWith("font-") || name.startsWith("text-"),
		),
		utilityClasses: classes,
		fragmentUtilityClasses: fragmentClasses,
	},
};

const guide = `# Interfere engineers v2 design reference

This reference is generated from the supplied rendered page and hero DOM captures. It deliberately preserves the source HTML, Tailwind utility vocabulary, semantic color tokens, P3 palettes, responsive rules, shadows, typography, and CSS keyframes while removing analytics and the origin-dependent application runtime.

## Routes

- Full page: \`http://127.0.0.1:4174/product/engineers-v2\`
- Isolated 523-element product hero: \`http://127.0.0.1:4174/product/engineers-v2/hero\`
- Previous engineers reference: \`http://127.0.0.1:4174/\`

## Source contract

- Page SHA-1: \`${inventory.source.page.sha1}\`
- Hero SHA-1: \`${inventory.source.fragment.sha1}\`
- CSS is localized from four immutable, hashed Interfere bundles.
- Thirteen font files are localized so typography is stable and offline.
- Six unique source images are localized so all 21 image instances are stable and offline.
- A safe local replica runtime restores captured spinner motion, header scroll state, and changelog scrolling without loading analytics or origin-dependent hydration.
- Local visual assets resolve against the current preview origin; original root-relative navigation and metadata URLs are rewritten to explicit \`https://interfere.com\` URLs.
- The full machine-readable token/class inventory is \`interfere-engineers-v2.inventory.json\`.

## Parity boundary

- The full-page body is DOM-identical to the supplied page after removing only non-JSON-LD scripts and rewriting visual asset URLs locally; the isolated hero root has the same contract.
- All four source CSS bundles and all thirteen referenced font files are localized. CSS responsive states, hover/focus rules, keyframes, and reduced-motion rules remain intact.
- The two supplied captures differ only in the loading spinner's instantaneous inline rotation, so the full route preserves the page capture's phase and the isolated route preserves the fragment capture's phase.
- Runtime-only event listeners and open overlay state cannot be recovered from pasted rendered HTML. The local runtime covers behavior supported by the supplied state without restoring origin-dependent application hydration.

## Design-system formulation

### Spacing and responsive layout

- Base spacing unit: \`--spacing: .25rem\` (4px).
- Breakpoints represented in the source CSS: 40rem, 48rem, 64rem, 80rem, and 96rem.
- The hero uses a constrained centered shell with 24px phone gutters and 22px small-screen gutters, then deliberately overflows horizontally for the large product-stage composition.
- The product-stage shell is 640px tall on phone and 800px at medium widths, with a 1440px minimum composition width.

### Typography

- Primary sans: InterVariable, weights 100–900, with \`ss03\` enabled.
- Secondary families: Berkeley Mono, Departure Mono, Heldane Text, and Redaction 35.
- Font scale: 8, 10, 11, 12, 13, 15, 18, 20, 24, 28, 36, 44, and 56px.
- Caption large is 12/16 at weight 400 by default; emphasized inline values use 500.
- Body small is 13/20; body base is 15/24; body large is 18/24.
- Heading sizes are 24/32, 28/36, 36/44, 44/56, and 56/56 with -0.01em tracking.

### Color and surfaces

- Semantic layers are page, shell, container, recessed container, card, component, component hover/active, and inverted standout.
- Foreground hierarchy is primary, secondary, tertiary, and disabled rather than ad-hoc opacity on each element.
- Status semantics are brand, positive, warning, and danger, each with solid, subtle, foreground, and border roles.
- Hairline borders use 0.5px and derive from semantic border tokens; default cards combine a 0.5px inset highlight with three low-opacity drop layers.

### Shape, density, and composition

- Small controls use 4–8px radii; cards use 8–12px radii; avatars and status dots are fully rounded.
- The product timeline uses 16px event icons, 0.5px vertical rails, 4px terminal dots, 8px vertical row padding, and 4–6px internal gaps.
- Timeline cards favor transparent hierarchy: semantic surface, hairline outline, restrained shadow, and compact 12/16 metadata over heavy headings.

### Motion

- Preserved CSS motion includes shimmer, spinner, signal flow, marquee, breathe, logo cascade, viewfinder focus/scan, border beam, accordion, enter, and exit keyframes.
- Core easing curves include out-quad, out-cubic, out-quint, and in-out-cubic.
- Reduced-motion selectors remain in the localized source CSS.

## Regeneration

From the repository root:

\`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/materialize-engineers-v2.mjs\`

Pass \`--page\` and \`--fragment\` to use replacement captures. Generated output must be visually rechecked whenever either source hash changes.
`;

await Promise.all([
	writeFile(pageOutputPath, pageCapture),
	writeFile(heroOutputPath, heroCapture),
	writeFile(inventoryOutputPath, `${JSON.stringify(inventory, null, 2)}\n`),
	writeFile(inventoryGuidePath, guide),
]);

console.log(`Wrote ${pageOutputPath}`);
console.log(`Wrote ${heroOutputPath}`);
console.log(`Wrote ${inventoryOutputPath}`);
console.log(`Wrote ${inventoryGuidePath}`);
