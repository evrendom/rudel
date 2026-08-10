import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateName = process.env.LENS_CONTENT_GATE_NAME ?? "g1";
const sourceUrl = process.env.LENS_CONTENT_SOURCE_URL ??
	"http://127.0.0.1:4175/build?opaline-source=lens-content";
const candidateUrl = process.env.LENS_CONTENT_CANDIDATE_URL ??
	"http://127.0.0.1:4321/preview/lens-content";
const outputRoot = path.resolve(
	marketingRoot,
	`../../.context/gates/lens-content/${gateName}`,
);
const manifest = JSON.parse(
	await readFile(
		path.resolve(marketingRoot, "../../.context/extractions/lens-content/manifest.json"),
		"utf8",
	),
);
const resourceMap = Object.fromEntries(
	manifest.resources.map((resource) => [resource.url, resource.localUrl]),
);
const renameMap = process.env.LENS_CONTENT_RENAME_MAP
	? JSON.parse(
			await readFile(
				path.resolve(marketingRoot, process.env.LENS_CONTENT_RENAME_MAP),
				"utf8",
			),
		)
	: { classes: {} };
const reverseClassMap = Object.fromEntries(
	Object.entries(renameMap.classes ?? {}).map(([source, candidate]) => [candidate, source]),
);

const viewports = {
	phone: { width: 390, height: 844, dpr: 1, mobile: true },
	tablet: { width: 768, height: 1024, dpr: 1, mobile: true },
	desktop: { width: 1280, height: 800, dpr: 1, mobile: false },
	wide: { width: 1680, height: 1050, dpr: 1, mobile: false },
};
const allStates = [
	{ id: "top", kind: "top" },
	...Array.from({ length: 8 }, (_, index) => ({
		id: `section-${index + 1}`,
		kind: "section",
		index,
	})),
	{ id: "footer", kind: "footer" },
];
const selectedViewport = process.env.LENS_CONTENT_VIEWPORT;
const selectedState = process.env.LENS_CONTENT_STATE;
const activeViewports = Object.fromEntries(
	Object.entries(viewports).filter(([name]) => !selectedViewport || name === selectedViewport),
);
const states = allStates.filter((state) => !selectedState || state.id === selectedState);

const readyExpression = `(() => {
	const main = document.querySelector("[data-opaline-lens-content] > main, body > main");
	if (!(main instanceof HTMLElement) || main.getBoundingClientRect().height <= 0) return false;
	return [...main.querySelectorAll("img")].every((image) => image.complete && image.naturalWidth > 0);
})()`;

const anchorExpression = (state) => `(() => {
	const main = document.querySelector("[data-opaline-lens-content] > main, body > main");
	if (!(main instanceof HTMLElement)) throw new Error("Lens content main is unavailable");
	main.style.setProperty("transform", "none", "important");
	let target = null;
	if (${JSON.stringify(state.kind)} === "section") {
		const sections = [...main.querySelectorAll("section")].filter((section) => {
			const rect = section.getBoundingClientRect();
			return getComputedStyle(section).display !== "none" && rect.width > 0 && rect.height > 0;
		});
		target = sections[${state.index ?? 0}] ?? null;
	} else if (${JSON.stringify(state.kind)} === "footer") {
		target = main.querySelector("footer");
	}
	const offset = target instanceof HTMLElement ? target.getBoundingClientRect().top : 0;
	main.style.setProperty("transform", "translateY(" + (-offset) + "px)", "important");
	return { offset, target: target?.tagName.toLowerCase() ?? "main" };
})()`;

const structureExpression = `(() => {
	const root = document.querySelector("[data-opaline-lens-content] > main, body > main");
	if (!(root instanceof HTMLElement)) throw new Error("Lens content main is unavailable");
	const resourceMap = ${JSON.stringify(resourceMap)};
	const normalize = (value) => {
		let normalized = value;
		for (const [source, local] of Object.entries(resourceMap)) {
			normalized = normalized.replaceAll(source, local);
		}
		return normalized
			.replaceAll("http://127.0.0.1:4175", "")
			.replaceAll("http://127.0.0.1:4321", "");
	};
	const styleRecord = (style) => Object.fromEntries(
		Array.from(style)
			.filter((property) => !property.startsWith("--"))
			.map((property) => [property, normalize(style.getPropertyValue(property))]),
	);
	const nodes = [];
	const visit = (element, path) => {
		const rect = element.getBoundingClientRect();
		nodes.push({
			path,
			tag: element.tagName.toLowerCase(),
			attributes: Object.fromEntries(
				[...element.attributes]
					.map((attribute) => [attribute.name, normalize(attribute.value)])
					.sort(([left], [right]) => left.localeCompare(right)),
			),
			text: [...element.childNodes]
				.filter((node) => node.nodeType === Node.TEXT_NODE)
				.map((node) => node.textContent)
				.join(""),
			bounds: [rect.x, rect.y, rect.width, rect.height],
			style: styleRecord(getComputedStyle(element)),
			before: styleRecord(getComputedStyle(element, "::before")),
			after: styleRecord(getComputedStyle(element, "::after")),
		});
		const counts = new Map();
		for (const child of element.children) {
			const tag = child.tagName.toLowerCase();
			const index = counts.get(tag) ?? 0;
			counts.set(tag, index + 1);
			visit(child, path + "/" + tag + "[" + index + "]");
		}
	};
	visit(root, "main[0]");
	return nodes;
})()`;

const compareStructures = (source, candidate, tolerance) => {
	const differences = [];
	const normalizeAttributes = (attributes, reverse = false) => attributes.class
		? {
				...attributes,
				class: attributes.class
					.split(/\s+/)
					.filter(Boolean)
					.map((className) => reverse ? reverseClassMap[className] ?? className : className)
					.join(" "),
			}
		: attributes;
	if (source.length !== candidate.length) {
		differences.push({ type: "node-count", source: source.length, candidate: candidate.length });
	}
	for (let index = 0; index < Math.max(source.length, candidate.length); index += 1) {
		const left = source[index];
		const right = candidate[index];
		if (!left || !right) continue;
		for (const field of ["path", "tag", "attributes", "text", "style", "before", "after"]) {
			const sourceValue = field === "attributes"
				? normalizeAttributes(left.attributes)
				: left[field];
			const candidateValue = field === "attributes"
				? normalizeAttributes(right.attributes, true)
				: right[field];
			if (JSON.stringify(sourceValue) !== JSON.stringify(candidateValue)) {
				differences.push({ type: field, path: left.path, source: sourceValue, candidate: candidateValue });
			}
		}
		for (let coordinate = 0; coordinate < 4; coordinate += 1) {
			if (Math.abs(left.bounds[coordinate] - right.bounds[coordinate]) > tolerance) {
				differences.push({
					type: "geometry",
					path: left.path,
					property: ["x", "y", "width", "height"][coordinate],
					source: left.bounds[coordinate],
					candidate: right.bounds[coordinate],
				});
			}
		}
	}
	return differences;
};

const open = async (url, viewport) => {
	const session = await createBrowserSession({ url, ...viewport });
	await session.waitFor(readyExpression);
	await wait(500);
	await session.freezeAtDeterministicState();
	return session;
};

await mkdir(outputRoot, { recursive: true });
const results = [];
for (const [viewportName, viewport] of Object.entries(activeViewports)) {
	const [source, candidate] = await Promise.all([
		open(sourceUrl, viewport),
		open(candidateUrl, viewport),
	]);
	try {
		for (const state of states) {
			const [sourceAnchor, candidateAnchor] = await Promise.all([
				source.evaluate(anchorExpression(state)),
				candidate.evaluate(anchorExpression(state)),
			]);
			await wait(80);
			const prefix = `${viewportName}-${state.id}`;
			const sourceScreenshotPath = path.join(outputRoot, `${prefix}-source.png`);
			const candidateScreenshotPath = path.join(outputRoot, `${prefix}-candidate.png`);
			await Promise.all([
				source.screenshot(sourceScreenshotPath),
				candidate.screenshot(candidateScreenshotPath),
			]);
			const [sourceStructure, candidateStructure] = await Promise.all([
				source.evaluate(structureExpression),
				candidate.evaluate(structureExpression),
			]);
			const pixel = await comparePngs({
				leftPath: sourceScreenshotPath,
				rightPath: candidateScreenshotPath,
				diffPath: path.join(outputRoot, `${prefix}-diff.png`),
				exact: gateName === "g2",
			});
			const structuralDifferences = compareStructures(
				sourceStructure,
				candidateStructure,
				gateName === "g2" ? 0 : 0.5,
			);
			results.push({
				viewport: viewportName,
				state: state.id,
				sourceAnchor,
				candidateAnchor,
				pixel,
				structuralDifferenceCount: structuralDifferences.length,
				structuralDifferences: structuralDifferences.slice(0, 50),
			});
			console.log(
				`${prefix}: ${pixel.diffPercent.toFixed(6)}% pixels, ${structuralDifferences.length} structural`,
			);
		}
	} finally {
		await Promise.all([source.close(), candidate.close()]);
	}
}

const maximumPixelDifferencePercent = gateName === "g2" ? 0 : 0.1;
const report = {
	gate: `${gateName.toUpperCase()}-lens-content`,
	generatedAt: new Date().toISOString(),
	sourceUrl,
	candidateUrl,
	viewports: activeViewports,
	states: states.map((state) => state.id),
	thresholds: { maximumPixelDifferencePercent, structuralDifferences: 0 },
	passed: results.every(
		(result) => result.pixel.diffPercent <= maximumPixelDifferencePercent &&
			result.structuralDifferenceCount === 0,
	),
	results,
};
await writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
