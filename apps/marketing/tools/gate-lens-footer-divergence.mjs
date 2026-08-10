import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const marketingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/divergences/D004",
);
const sourceUrl = "http://127.0.0.1:4321/preview/lens-content-naturalized";
const candidateUrl = "http://127.0.0.1:4321/preview/lens-content-branded";
const viewports = {
	phone: { width: 390, height: 844, dpr: 1, mobile: true },
	tablet: { width: 768, height: 1024, dpr: 1, mobile: true },
	desktop: { width: 1280, height: 800, dpr: 1, mobile: false },
	wide: { width: 1680, height: 1050, dpr: 1, mobile: false },
};
const footerLogoClass = "opaline-lens-footer-footer-logo";
const copyrightClass = "opaline-lens-footer-footer-copyright";

const prepareExpression = `(() => {
	const main = document.querySelector("[data-opaline-lens-content] > main");
	const footer = main?.querySelector("footer");
	if (!(main instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
		throw new Error("Lens footer is unavailable");
	}
	main.style.setProperty("transform", "none", "important");
	const offset = footer.getBoundingClientRect().top;
	main.style.setProperty("transform", "translateY(" + (-offset) + "px)", "important");
	return offset;
})()`;
const captureExpression = `(() => {
	const root = document.querySelector("[data-opaline-lens-content] footer");
	if (!(root instanceof HTMLElement)) throw new Error("Lens footer is unavailable");
	const recordStyle = (element) => {
		const style = getComputedStyle(element);
		return Object.fromEntries(Array.from(style).filter((name) => !name.startsWith("--")).map((name) => [name, style.getPropertyValue(name)]));
	};
	const nodes = [];
	const visit = (element, path) => {
		const rect = element.getBoundingClientRect();
		const logoRoot = element.closest(".${footerLogoClass}");
		const copyrightRoot = element.closest(".${copyrightClass}");
		nodes.push({
			path,
			tag: element.tagName.toLowerCase(),
			attributes: Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value]).sort(([a], [b]) => a.localeCompare(b))),
			text: [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(""),
			bounds: [rect.x, rect.y, rect.width, rect.height],
			style: recordStyle(element),
			whitelist: logoRoot ? "footer-logo" : copyrightRoot ? "copyright" : null,
		});
		const counts = new Map();
		for (const child of element.children) {
			const tag = child.tagName.toLowerCase();
			const index = counts.get(tag) ?? 0;
			counts.set(tag, index + 1);
			visit(child, path + "/" + tag + "[" + index + "]");
		}
	};
	visit(root, "footer[0]");
	const boundsFor = (selector) => {
		const element = root.querySelector(selector);
		if (!(element instanceof HTMLElement || element instanceof SVGElement)) return null;
		const rect = element.getBoundingClientRect();
		return { x: Math.floor(rect.x) - 3, y: Math.floor(rect.y) - 3, width: Math.ceil(rect.width) + 6, height: Math.ceil(rect.height) + 6 };
	};
	return {
		nodes,
		allowedPaint: [boundsFor(".${footerLogoClass}"), boundsFor(".${copyrightClass}")].filter(Boolean),
	};
})()`;

const compareStructure = (source, candidate) => {
	const differences = [];
	const sourceByPath = new Map(source.map((node) => [node.path, node]));
	const candidateByPath = new Map(candidate.map((node) => [node.path, node]));
	for (const path of new Set([...sourceByPath.keys(), ...candidateByPath.keys()])) {
		const left = sourceByPath.get(path);
		const right = candidateByPath.get(path);
		const whitelist = left?.whitelist ?? right?.whitelist ?? null;
		if (!left || !right) {
			differences.push({ type: "node", path, source: left?.tag ?? null, candidate: right?.tag ?? null, whitelist });
			continue;
		}
		for (const field of ["tag", "attributes", "text", "bounds", "style"]) {
			if (JSON.stringify(left[field]) !== JSON.stringify(right[field])) {
				differences.push({ type: field, path, source: left[field], candidate: right[field], whitelist });
			}
		}
	}
	return differences;
};

const open = async (url, viewport) => {
	const session = await createBrowserSession({ url, ...viewport });
	await session.waitFor('document.querySelector("[data-opaline-lens-content] footer")?.getBoundingClientRect().height > 0');
	await session.waitFor('[...document.images].every((image) => image.complete && image.naturalWidth > 0)');
	await wait(300);
	await session.freezeAtDeterministicState();
	await session.evaluate(prepareExpression);
	await wait(80);
	return session;
};

await mkdir(outputRoot, { recursive: true });
const results = [];
for (const [name, viewport] of Object.entries(viewports)) {
	const [source, candidate] = await Promise.all([open(sourceUrl, viewport), open(candidateUrl, viewport)]);
	try {
		const sourcePath = path.join(outputRoot, `${name}-source.png`);
		const candidatePath = path.join(outputRoot, `${name}-candidate.png`);
		await Promise.all([source.screenshot(sourcePath), candidate.screenshot(candidatePath)]);
		const [sourceCapture, candidateCapture] = await Promise.all([
			source.evaluate(captureExpression),
			candidate.evaluate(captureExpression),
		]);
		const differences = compareStructure(sourceCapture.nodes, candidateCapture.nodes);
		const unsanctioned = differences.filter((difference) => !difference.whitelist);
		const masks = [...sourceCapture.allowedPaint, ...candidateCapture.allowedPaint];
		const [fullPixel, outsideApprovedPixel] = await Promise.all([
			comparePngs({
				leftPath: sourcePath,
				rightPath: candidatePath,
				diffPath: path.join(outputRoot, `${name}-full-diff.png`),
				exact: true,
			}),
			comparePngs({
				leftPath: sourcePath,
				rightPath: candidatePath,
				diffPath: path.join(outputRoot, `${name}-outside-approved-diff.png`),
				masks,
				exact: true,
			}),
		]);
		results.push({
			viewport: name,
			fullPixel,
			outsideApprovedPixel,
			allowedPaintRegions: masks,
			structuralDifferences: differences.map(({ source: _source, candidate: _candidate, ...difference }) => difference),
			unsanctionedStructuralDifferenceCount: unsanctioned.length,
		});
		console.log(`${name}: ${outsideApprovedPixel.differingPixels} outside pixels, ${unsanctioned.length} unsanctioned structural`);
	} finally {
		await Promise.all([source.close(), candidate.close()]);
	}
}

const report = {
	gate: "D004-footer-branding",
	generatedAt: new Date().toISOString(),
	sourceUrl,
	candidateUrl,
	allowedChanges: [
		"Lens footer logo subtree -> Opaline wordmark",
		"© 2026 Mask Network -> © 2026 Opaline",
	],
	passed: results.every((result) =>
		result.outsideApprovedPixel.differingPixels === 0 &&
		result.unsanctionedStructuralDifferenceCount === 0
	),
	results,
};
await writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
