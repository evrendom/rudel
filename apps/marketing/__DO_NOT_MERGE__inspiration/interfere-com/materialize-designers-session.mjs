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
		first: { type: "string" },
		fragment: { type: "string" },
		page: { type: "string" },
		support: { type: "string" },
		supportFirst: { type: "string" },
		supportSecond: { type: "string" },
	},
});

const pageSourcePath = resolve(
	workspaceRoot,
	args.page ||
		".context/attachments/McHr6K/pasted_text_2026-08-14_11-13-12.txt",
);
const fragmentSourcePath = resolve(
	workspaceRoot,
	args.fragment ||
		".context/attachments/hBqKos/pasted_text_2026-08-14_11-13-01.txt",
);
const firstSourcePath = resolve(
	workspaceRoot,
	args.first ||
		"apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/interfere-designers-ship-faster-state-1.source.html",
);
const supportSourcePath = resolve(
	workspaceRoot,
	args.support ||
		".context/attachments/O6mnKM/pasted_text_2026-08-14_13-13-12.txt",
);
const supportFirstSourcePath = resolve(
	workspaceRoot,
	args.supportFirst ||
		"apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/interfere-designers-support-state-1.source.html",
);
const supportSecondSourcePath = resolve(
	workspaceRoot,
	args.supportSecond ||
		"apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/interfere-designers-support-state-2.source.html",
);
const pageOutputPath = resolve(
	root,
	"interfere-designers-session.capture.html",
);
const sectionOutputPath = resolve(
	root,
	"interfere-designers-session-section.capture.html",
);
const firstSectionOutputPath = resolve(
	root,
	"interfere-designers-ship-faster-state-1.capture.html",
);
const thirdSectionOutputPath = resolve(
	root,
	"interfere-designers-ship-faster-state-3.capture.html",
);
const scrollOutputPath = resolve(
	root,
	"interfere-designers-ship-faster-scroll.capture.html",
);
const tokensOutputPath = resolve(
	root,
	"interfere-designers-session.tokens.json",
);
const guideOutputPath = resolve(root, "INTERFERE-DESIGNERS-SESSION-TOKENS.md");
const assetsDirectoryName = "designers-session-assets";
const assetsDirectory = resolve(root, assetsDirectoryName);
const sourceUrl = "https://interfere.com/product/designers";
const replicaRuntimeName = "designers-session-runtime.js";

const replicaRuntime = `const initializeReplica = () => {
	const root = document.documentElement;
	root.dataset.opalineReplicaRuntime = "ready";

	const updateScrolledState = () => {
		root.toggleAttribute("data-scrolled", window.scrollY > 8);
	};
	updateScrolledState();
	window.addEventListener("scroll", updateScrolledState, { passive: true });

	const updateScreenScale = () => {
		const scale = Math.min(
			1,
			Math.max(0, window.innerWidth - 32) / 1200,
			Math.max(0, window.innerHeight - 32) / 640,
		);
		for (const viewport of document.querySelectorAll(
			"[data-opaline-screen-viewport]",
		)) {
			viewport.style.width = \`\${1200 * scale}px\`;
			viewport.style.height = \`\${640 * scale}px\`;
			const frame = viewport.querySelector("[data-opaline-screen-frame]");
			if (frame instanceof HTMLElement) {
				frame.style.transform = \`scale(\${scale})\`;
			}
		}
	};
	updateScreenScale();
	window.addEventListener("resize", updateScreenScale, { passive: true });
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

function unique(values) {
	return [...new Set(values)].sort();
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
	return {
		buffer: Buffer.from(await response.arrayBuffer()),
		contentType: response.headers.get("content-type")?.split(";", 1)[0] || null,
	};
}

async function fetchImageAsset(sourceValue) {
	const url = sourceValue.replaceAll("&amp;", "&");
	const { buffer, contentType } = await fetchAsset(url);
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
	const sourceName = new URL(url).pathname.split("/").at(-2) || "image";
	const slug = sourceName.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
	return {
		buffer,
		contentType,
		name: `${slug}-${sha1(url).slice(0, 10)}.${extension}`,
		sourceValue,
		url,
	};
}

function sourceImageUrls(...sources) {
	const urls = new Set();
	for (const source of sources) {
		for (const match of source.matchAll(
			/https:\/\/images\.interfere\.com\/[^'"<>\s]+/gi,
		)) {
			urls.add(match[0]);
		}
	}
	return [...urls].sort();
}

function sourceStylesheetUrls(source) {
	const urls = [];
	for (const match of source.matchAll(
		/<link\b[^>]*\brel=(['"])stylesheet\1[^>]*>/gi,
	)) {
		const href = match[0].match(/\bhref=(['"])(.*?)\1/i)?.[2];
		if (href?.startsWith("https://assets.interfere.com/assets/")) {
			urls.push(href.replaceAll("&amp;", "&"));
		}
	}
	return urls.filter((url, index) => urls.indexOf(url) === index);
}

function sourceInlineStyles(source) {
	return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
		(match, index) => ({
			name: `inline-style-${index + 1}`,
			sourceCss: match[1],
		}),
	);
}

function stripOriginRuntime(html) {
	return html
		.replace(/<link\b[^>]*\brel=(['"])modulepreload\1[^>]*>/gi, "")
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) =>
			/type=(['"])application\/ld\+json\1/i.test(script) ? script : "",
		)
		.replace(
			/<noscript\b[^>]*>[\s\S]*?(?:googletagmanager|redditstatic)[\s\S]*?<\/noscript>/gi,
			"",
		);
}

function absolutizeOriginRelativeUrls(html) {
	return html.replace(
		/\b(href|src|action|poster)=(['"])(\/(?!\/)[^'"<>]*)\2/gi,
		(_match, attribute, quote, value) =>
			`${attribute}=${quote}${new URL(value, sourceUrl).href}${quote}`,
	);
}

function removeRemoteStylesheets(html) {
	return html.replace(/<link\b[^>]*\brel=(['"])stylesheet\1[^>]*>/gi, (link) =>
		/https:\/\/assets\.interfere\.com\/assets\//i.test(link) ? "" : link,
	);
}

function addReferenceHead(html, stylesheetNames) {
	const referenceHead = [
		'<meta name="opaline-reference" content="interfere-designers-session">',
		...stylesheetNames.map(
			(name) =>
				`<link rel="stylesheet" href="/${assetsDirectoryName}/${name}" data-opaline-local-stylesheet>`,
		),
		`<script type="module" src="/${assetsDirectoryName}/${replicaRuntimeName}" data-opaline-replica-runtime></script>`,
	].join("");
	return html.replace(/<head>/i, `<head>${referenceHead}`);
}

function markReference(html) {
	const marked = html.replace(
		/<html\b/i,
		'<html data-opaline-reference="interfere-designers-session"',
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

function declarationMap(source, propertyPattern) {
	const declarations = new Map();
	const expression = new RegExp(`(${propertyPattern})\\s*:\\s*([^;}{]+)`, "g");
	for (const match of source.matchAll(expression)) {
		const values = declarations.get(match[1]) || new Set();
		values.add(match[2].trim());
		declarations.set(match[1], values);
	}
	return Object.fromEntries(
		[...declarations.entries()]
			.sort((left, right) => left[0].localeCompare(right[0]))
			.map(([name, values]) => [name, [...values].sort()]),
	);
}

function customPropertyDefinitions(sources) {
	const definitions = [];
	for (const source of sources) {
		for (const rule of source.sourceCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			const selector = rule[1].trim();
			for (const declaration of rule[2].matchAll(
				/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)/g,
			)) {
				definitions.push({
					name: declaration[1],
					selector,
					source: source.name,
					value: declaration[2].trim(),
				});
			}
		}
	}
	return definitions.sort(
		(left, right) =>
			left.name.localeCompare(right.name) ||
			left.source.localeCompare(right.source) ||
			left.selector.localeCompare(right.selector),
	);
}

function extractAtRules(source, name) {
	return unique(
		[...source.matchAll(new RegExp(`@${name}\\s+([^\\{]+)`, "g"))].map(
			(match) => match[1].trim(),
		),
	);
}

function extractFontFaces(source) {
	return [...source.matchAll(/@font-face\s*\{([^{}]*)\}/g)].map((match) =>
		declarationMap(match[1], "[a-zA-Z-]+"),
	);
}

function registeredCustomProperties(sources) {
	const registrations = [];
	for (const source of sources) {
		for (const match of source.sourceCss.matchAll(
			/@property\s+(--[a-zA-Z0-9_-]+)\s*\{([^{}]*)\}/g,
		)) {
			registrations.push({
				declarations: declarationMap(match[2], "[a-zA-Z-]+"),
				name: match[1],
				source: source.name,
			});
		}
	}
	return registrations.sort(
		(left, right) =>
			left.name.localeCompare(right.name) ||
			left.source.localeCompare(right.source),
	);
}

function countElements(source) {
	return [...source.matchAll(/<[a-z][^>]*>/gi)].length;
}

function extractElementAt(source, start, tagName) {
	const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
	const openingTag = new RegExp(`^<${tagName}\\b`, "i");
	tags.lastIndex = start;
	let depth = 0;
	for (let match = tags.exec(source); match; match = tags.exec(source)) {
		depth += openingTag.test(match[0]) ? 1 : -1;
		if (depth === 0) return source.slice(start, tags.lastIndex);
	}
	throw new Error(`Unable to find closing ${tagName} tag.`);
}

function removeElementContaining(source, needle, tagName) {
	const needleIndex = source.indexOf(needle);
	if (needleIndex < 0) return source;
	const start = source.lastIndexOf(`<${tagName}`, needleIndex);
	if (start < 0) return source;
	const element = extractElementAt(source, start, tagName);
	return `${source.slice(0, start)}${source.slice(start + element.length)}`;
}

function extractProductScreen(fragment) {
	const screenMarker =
		"border-border-default bg-card relative flex h-full w-full shrink-0 overflow-hidden rounded-2xl";
	const markerIndex = fragment.indexOf(screenMarker);
	if (markerIndex < 0) throw new Error("Unable to find the product screen.");
	const start = fragment.lastIndexOf("<div", markerIndex);
	const screen = extractElementAt(fragment, start, "div");
	return removeElementContaining(
		screen,
		"linear-gradient(135deg, transparent 50%, var(--color-bg-component) 95%)",
		"div",
	);
}

function screenOnlyPanel(state) {
	return `<section id="${state.id}" data-opaline-scroll-panel data-opaline-state="${state.number}" aria-label="${state.label}" class="opaline-screen-panel">
<div aria-hidden="true" class="opaline-screen-viewport" data-opaline-screen-viewport>
<div class="opaline-screen-frame" data-opaline-screen-frame>
${extractProductScreen(state.html)}
</div>
</div>
</section>`;
}

const screenOnlyStyles =
	".opaline-screen-panel{box-sizing:border-box;display:grid;min-height:100svh;padding:16px;place-items:center}.opaline-screen-viewport{aspect-ratio:15/8;position:relative;width:min(1200px,calc(100vw - 32px))}.opaline-screen-frame{height:640px;left:0;position:absolute;top:0;transform-origin:top left;width:1200px}";

function extractSectionContaining(source, needle) {
	const needleIndex = source.indexOf(needle);
	if (needleIndex < 0) {
		throw new Error(`Unable to find target section text: ${needle}`);
	}
	const start = source.lastIndexOf("<section", needleIndex);
	if (start < 0) throw new Error("Unable to find the target section start.");

	const sectionTags = /<\/?section\b[^>]*>/gi;
	let depth = 0;
	for (const match of source.slice(start).matchAll(sectionTags)) {
		depth += /^<section\b/i.test(match[0]) ? 1 : -1;
		if (depth === 0)
			return source.slice(start, start + match.index + match[0].length);
	}
	throw new Error("Unable to find the target section end.");
}

function localStylesheetMarkup(stylesheetNames) {
	return stylesheetNames
		.map(
			(name) =>
				`<link rel="stylesheet" href="/${assetsDirectoryName}/${name}" data-opaline-local-stylesheet>`,
		)
		.join("");
}

function isolatedSectionDocument(
	fragment,
	stylesheetNames,
	{ referenceId, title },
) {
	const stylesheets = localStylesheetMarkup(stylesheetNames);
	return `<!doctype html>
<html class="bg-page light" lang="en" style="color-scheme: light;" data-opaline-reference="${referenceId}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="opaline-reference" content="${referenceId}">
<title>${title}</title>
${stylesheets}
<script type="module" src="/${assetsDirectoryName}/${replicaRuntimeName}" data-opaline-replica-runtime></script>
<style data-opaline-section-isolation>html,body{min-height:100%;margin:0}body{overflow-x:hidden}main{min-height:100svh}${screenOnlyStyles}</style>
</head>
<body class="bg-page">
<main id="main" class="flex min-h-full w-full flex-1 flex-col">
${fragment.trim()}
</main>
</body>
</html>`;
}

function scrollStoryDocument(states, stylesheetNames) {
	const stylesheets = localStylesheetMarkup(stylesheetNames);
	const panels = states.map(screenOnlyPanel).join("\n");
	return `<!doctype html>
<html class="bg-page light" lang="en" style="color-scheme: light;" data-opaline-reference="interfere-designers-ship-faster-scroll">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="opaline-reference" content="interfere-designers-ship-faster-scroll">
<title>Interfere designers ship-faster scroll story</title>
${stylesheets}
<script type="module" src="/${assetsDirectoryName}/${replicaRuntimeName}" data-opaline-replica-runtime></script>
<style data-opaline-scroll-isolation>
html,body{min-height:100%;margin:0}html{scroll-behavior:smooth;scroll-snap-type:y proximity}body{overflow-x:hidden}main{min-height:100svh}${screenOnlyStyles}.opaline-screen-panel{border-top:.5px solid var(--color-border-default);scroll-snap-align:start;scroll-snap-stop:always}.opaline-screen-panel:first-child{border-top:0}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto;scroll-snap-type:none}}
</style>
</head>
<body class="bg-page">
<main id="main" class="flex min-h-full w-full flex-1 flex-col">
${panels}
</main>
</body>
</html>`;
}

await mkdir(assetsDirectory, { recursive: true });
const [
	pageSource,
	fragmentSource,
	firstSource,
	supportFirstSource,
	supportSecondSource,
	supportSource,
] = await Promise.all([
	readFile(pageSourcePath, "utf8"),
	readFile(fragmentSourcePath, "utf8"),
	readFile(firstSourcePath, "utf8"),
	readFile(supportFirstSourcePath, "utf8"),
	readFile(supportSecondSourcePath, "utf8"),
	readFile(supportSourcePath, "utf8"),
]);
const thirdSource = extractSectionContaining(
	pageSource,
	"Ship faster knowing you’ll understand when something breaks—and why.",
);
const stateSources = [
	{
		html: firstSource,
		id: "follow-ongoing-problems",
		label: "Follow ongoing problems",
		number: 1,
		origin: "live rendered interaction capture",
		path: firstSourcePath,
	},
	{
		html: fragmentSource,
		id: "understand-whats-going-on",
		label: "Understand what’s going on",
		number: 2,
		origin: "supplied isolated fragment",
		path: fragmentSourcePath,
	},
	{
		html: thirdSource,
		id: "follow-the-problems-resolution",
		label: "Follow the problem’s resolution",
		number: 3,
		origin: "extracted from supplied full-page capture",
		path: pageSourcePath,
	},
	{
		html: supportFirstSource,
		id: "identify-impacted-customers",
		label: "Identify impacted customers",
		number: 4,
		origin: "live rendered GTM first-tab interaction capture",
		path: supportFirstSourcePath,
	},
	{
		html: supportSecondSource,
		id: "answer-questions-faster",
		label: "Answer questions faster",
		number: 5,
		origin: "live rendered GTM second-tab interaction capture",
		path: supportSecondSourcePath,
	},
	{
		html: supportSource,
		id: "get-ahead-of-support-tickets",
		label: "Get ahead of support tickets",
		number: 6,
		origin: "supplied isolated GTM third-tab fragment",
		path: supportSourcePath,
	},
];

const stylesheetUrls = sourceStylesheetUrls(pageSource);
if (stylesheetUrls.length === 0) {
	throw new Error(
		"The supplied page does not reference Interfere stylesheets.",
	);
}

const imageAssets = await Promise.all(
	sourceImageUrls(pageSource, ...stateSources.map((state) => state.html)).map(
		fetchImageAsset,
	),
);
for (const asset of imageAssets) {
	await writeFile(resolve(assetsDirectory, asset.name), asset.buffer);
	asset.bytes = asset.buffer.byteLength;
	asset.sha1 = sha1(asset.buffer);
}

await writeFile(resolve(assetsDirectory, replicaRuntimeName), replicaRuntime);
const runtimeAsset = {
	bytes: Buffer.byteLength(replicaRuntime),
	name: replicaRuntimeName,
	sha1: sha1(replicaRuntime),
};

const stylesheetAssets = [];
const referencedAssetUrls = new Set();
for (const url of stylesheetUrls) {
	const { buffer } = await fetchAsset(url);
	const sourceCss = buffer.toString("utf8");
	for (const match of sourceCss.matchAll(
		/url\((?:['"])?(https:\/\/assets\.interfere\.com\/assets\/[^)'"\s]+)(?:['"])?\)/g,
	)) {
		referencedAssetUrls.add(match[1]);
	}
	stylesheetAssets.push({
		name: localAssetName(url),
		sourceCss,
		url,
	});
}

const referencedAssets = [];
for (const url of [...referencedAssetUrls].sort()) {
	const { buffer, contentType } = await fetchAsset(url);
	const name = localAssetName(url);
	await writeFile(resolve(assetsDirectory, name), buffer);
	referencedAssets.push({
		bytes: buffer.byteLength,
		contentType,
		name,
		sha1: sha1(buffer),
		url,
	});
}

for (const asset of stylesheetAssets) {
	let localizedCss = asset.sourceCss;
	for (const referencedAsset of referencedAssets) {
		localizedCss = localizedCss.replaceAll(
			referencedAsset.url,
			`./${referencedAsset.name}`,
		);
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
const localizedStates = stateSources.map((state) => ({
	...state,
	html: absolutizeOriginRelativeUrls(state.html),
}));
for (const asset of imageAssets) {
	const localUrl = `/${assetsDirectoryName}/${asset.name}`;
	pageCapture = pageCapture.replaceAll(asset.sourceValue, localUrl);
	for (const state of localizedStates) {
		state.html = state.html.replaceAll(asset.sourceValue, localUrl);
	}
}
for (const asset of referencedAssets) {
	pageCapture = pageCapture.replaceAll(
		asset.url,
		`/${assetsDirectoryName}/${asset.name}`,
	);
}

const [firstState, secondState, thirdState] = localizedStates;
const firstSectionCapture = isolatedSectionDocument(
	screenOnlyPanel(firstState),
	stylesheetNames,
	{
		referenceId: "interfere-designers-ship-faster-state-1",
		title: "Interfere designers ship-faster state 1",
	},
);
const sectionCapture = isolatedSectionDocument(
	screenOnlyPanel(secondState),
	stylesheetNames,
	{
		referenceId: "interfere-designers-ship-faster-state-2",
		title: "Interfere designers ship-faster state 2",
	},
);
const thirdSectionCapture = isolatedSectionDocument(
	screenOnlyPanel(thirdState),
	stylesheetNames,
	{
		referenceId: "interfere-designers-ship-faster-state-3",
		title: "Interfere designers ship-faster state 3",
	},
);
const scrollCapture = scrollStoryDocument(localizedStates, stylesheetNames);
const inlineStyles = sourceInlineStyles(pageSource);
const tokenSources = [
	...stylesheetAssets.map((asset) => ({
		name: asset.name,
		sourceCss: asset.localizedCss,
	})),
	...inlineStyles,
];
const allCss = tokenSources.map((source) => source.sourceCss).join("\n");
const allMarkupSources = [
	pageSource,
	...stateSources.map((state) => state.html),
];
const definitions = customPropertyDefinitions(tokenSources);
const registrations = registeredCustomProperties(tokenSources);
const customProperties = {};
for (const definition of definitions) {
	customProperties[definition.name] ||= [];
	if (!customProperties[definition.name].includes(definition.value)) {
		customProperties[definition.name].push(definition.value);
	}
}
for (const values of Object.values(customProperties)) values.sort();
const customPropertyReferences = unique(
	[
		...`${allCss}\n${allMarkupSources.join("\n")}`.matchAll(
			/var\(\s*(--[a-zA-Z0-9_-]+)/g,
		),
	].map((match) => match[1]),
);
const inlineCustomProperties = declarationMap(
	allMarkupSources
		.flatMap((source) =>
			[...source.matchAll(/\bstyle=(['"])([\s\S]*?)\1/g)].map(
				(match) => match[2],
			),
		)
		.join(";"),
	"--[a-zA-Z0-9_-]+",
);
const allCustomPropertyNames = unique([
	...Object.keys(customProperties),
	...registrations.map((registration) => registration.name),
	...customPropertyReferences,
	...Object.keys(inlineCustomProperties),
]);

const measuredProperties = [
	"animation-duration",
	"animation-timing-function",
	"border-radius",
	"box-shadow",
	"color",
	"font-family",
	"font-size",
	"font-weight",
	"letter-spacing",
	"line-height",
	"transition-duration",
	"transition-timing-function",
].join("|");
const inventory = {
	format: "opaline-interfere-design-tokens-v2",
	source: {
		url: sourceUrl,
		page: {
			bytes: Buffer.byteLength(pageSource),
			elements: countElements(pageSource),
			path: pageSourcePath,
			sha1: sha1(pageSource),
		},
		fragment: {
			bytes: Buffer.byteLength(fragmentSource),
			elements: countElements(fragmentSource),
			path: fragmentSourcePath,
			sha1: sha1(fragmentSource),
		},
		states: stateSources.map((state) => ({
			bytes: Buffer.byteLength(state.html),
			elements: countElements(state.html),
			id: state.id,
			label: state.label,
			number: state.number,
			origin: state.origin,
			path: state.path,
			sha1: sha1(state.html),
		})),
	},
	outputs: {
		fullPage: basename(pageOutputPath),
		scrollStory: basename(scrollOutputPath),
		states: [
			basename(firstSectionOutputPath),
			basename(sectionOutputPath),
			basename(thirdSectionOutputPath),
		],
		tokens: basename(tokensOutputPath),
	},
	assets: {
		images: imageAssets.map(
			({ bytes, contentType, name, sha1: hash, url }) => ({
				bytes,
				contentType,
				name,
				sha1: hash,
				url,
			}),
		),
		referenced: referencedAssets,
		scripts: [runtimeAsset],
		stylesheets: stylesheetAssets.map(({ bytes, name, sha1: hash, url }) => ({
			bytes,
			name,
			sha1: hash,
			url,
		})),
	},
	tokens: {
		allCustomPropertyNames,
		customProperties,
		customPropertyDefinitions: definitions,
		customPropertyReferences,
		declarationValues: declarationMap(allCss, measuredProperties),
		fontFaces: extractFontFaces(allCss),
		keyframes: extractAtRules(allCss, "keyframes"),
		mediaQueries: extractAtRules(allCss, "media"),
		registeredCustomProperties: registrations,
		supportsQueries: extractAtRules(allCss, "supports"),
	},
	usage: {
		fullPageUtilityClasses: classCounts(pageSource),
		inlineCustomProperties,
		inlineStyleDeclarations: declarationMap(
			allMarkupSources
				.flatMap((source) =>
					[...source.matchAll(/\bstyle=(['"])([\s\S]*?)\1/g)].map(
						(match) => match[2],
					),
				)
				.join(";"),
			"--[a-zA-Z0-9_-]+|[a-zA-Z-]+",
		),
		stateUtilityClasses: Object.fromEntries(
			stateSources.map((state) => [state.id, classCounts(state.html)]),
		),
	},
};

const guide = `# Interfere designers session-section design reference

This reference preserves all three rendered states of Interfere’s “Ship faster” section, all three rendered states of its “Support customers with confidence” section, and the complete design-token vocabulary available across the supplied and live interaction captures. It retains the source utility classes, custom properties, light/dark and P3 palettes, responsive rules, typography, keyframes, inline state, and SVG artwork while removing analytics and origin-dependent application hydration.

## Routes

- Full supplied page: \`http://127.0.0.1:4174/product/designers-v2\`
- Six-screen scroll story: \`http://127.0.0.1:4174/product/designers-v2/ship-faster\`
- State 1: \`http://127.0.0.1:4174/product/designers-v2/ship-faster#follow-ongoing-problems\`
- State 2: \`http://127.0.0.1:4174/product/designers-v2/ship-faster#understand-whats-going-on\`
- State 3: \`http://127.0.0.1:4174/product/designers-v2/ship-faster#follow-the-problems-resolution\`
- Support state 1: \`http://127.0.0.1:4174/product/designers-v2/ship-faster#identify-impacted-customers\`
- Support state 2: \`http://127.0.0.1:4174/product/designers-v2/ship-faster#answer-questions-faster\`
- Support state 3: \`http://127.0.0.1:4174/product/designers-v2/ship-faster#get-ahead-of-support-tickets\`

## Source contract

- Full page: ${inventory.source.page.elements} elements, ${inventory.source.page.bytes} bytes, SHA-1 \`${inventory.source.page.sha1}\`.
- State 1: ${inventory.source.states[0].elements} elements, ${inventory.source.states[0].bytes} bytes, SHA-1 \`${inventory.source.states[0].sha1}\`; captured through the live rendered first-tab interaction.
- State 2: ${inventory.source.states[1].elements} elements, ${inventory.source.states[1].bytes} bytes, SHA-1 \`${inventory.source.states[1].sha1}\`; preserved from the supplied isolated fragment.
- State 3: ${inventory.source.states[2].elements} elements, ${inventory.source.states[2].bytes} bytes, SHA-1 \`${inventory.source.states[2].sha1}\`; extracted from the supplied full-page capture.
- Support state 1: ${inventory.source.states[3].elements} elements, ${inventory.source.states[3].bytes} bytes, SHA-1 \`${inventory.source.states[3].sha1}\`; captured through the live rendered first-tab interaction.
- Support state 2: ${inventory.source.states[4].elements} elements, ${inventory.source.states[4].bytes} bytes, SHA-1 \`${inventory.source.states[4].sha1}\`; captured through the live rendered second-tab interaction.
- Support state 3: ${inventory.source.states[5].elements} elements, ${inventory.source.states[5].bytes} bytes, SHA-1 \`${inventory.source.states[5].sha1}\`; preserved from the supplied isolated fragment.
- ${inventory.assets.stylesheets.length} hashed Interfere stylesheets are localized.
- ${inventory.assets.referenced.length} stylesheet-referenced assets and ${inventory.assets.images.length} image-CDN assets are localized.
- ${inventory.tokens.allCustomPropertyNames.length} custom-property names are inventoried across definitions, registrations, references, and inline values; ${Object.keys(inventory.tokens.customProperties).length} have captured stylesheet definitions with every value and selector occurrence.
- The machine-readable inventory is \`${basename(tokensOutputPath)}\`; the localized CSS bundles remain the canonical source for every selector and declaration.

## Token coverage

The JSON inventory includes every captured CSS custom-property definition with its selector and source file, all distinct values for typography, radii, shadows, colors, animation and transition timing, every font face, keyframe name, media/supports query, every full-page and fragment utility class, and every inline style declaration. Inline \`<style>\` blocks from the supplied page participate in token extraction as well as the external stylesheets.

## Parity boundary

- The full-page body remains source-faithful after removing non-JSON scripts, analytics boot code, remote stylesheet tags, and origin-dependent module preloads; visual assets are rewritten locally.
- The scroll story presents the six captured product screens in source order as independent vertical panels. Narrative copy and the source edge-fade layers are intentionally removed; each complete 1200 × 640 product screen is centered and scaled down uniformly when the viewport is narrower or shorter.
- Vertical scrolling and stable fragment anchors replace the origin carousel runtime. No inferred crossfade or autoplay behavior is introduced.
- Runtime-only event listeners are not recoverable from pasted DOM. The six panels are static rendered references, while responsive CSS, hover/focus selectors, keyframes, and reduced-motion rules remain available from the source bundles.
- Compare at the same viewport, DPR, color scheme, zoom, and scroll position. Generated output should be visually rechecked whenever either source hash changes.

## Regeneration

From the repository root:

\`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/capture-designers-ship-faster-first.mjs\`

\`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/capture-designers-support-states.mjs\`

Then:

\`node apps/marketing/__DO_NOT_MERGE__inspiration/interfere-com/materialize-designers-session.mjs\`

Pass \`--first\`, \`--page\`, \`--fragment\`, \`--supportFirst\`, \`--supportSecond\`, and \`--support\` to replace individual captures.
`;

await Promise.all([
	writeFile(pageOutputPath, pageCapture),
	writeFile(firstSectionOutputPath, firstSectionCapture),
	writeFile(sectionOutputPath, sectionCapture),
	writeFile(thirdSectionOutputPath, thirdSectionCapture),
	writeFile(scrollOutputPath, scrollCapture),
	writeFile(tokensOutputPath, `${JSON.stringify(inventory, null, 2)}\n`),
	writeFile(guideOutputPath, guide),
]);

console.log(`Wrote ${pageOutputPath}`);
console.log(`Wrote ${firstSectionOutputPath}`);
console.log(`Wrote ${sectionOutputPath}`);
console.log(`Wrote ${thirdSectionOutputPath}`);
console.log(`Wrote ${scrollOutputPath}`);
console.log(`Wrote ${tokensOutputPath}`);
console.log(`Wrote ${guideOutputPath}`);
