import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const sourceUrl =
	"http://127.0.0.1:4175/__lens-atoms/interfere-title?opaline-copy=agent-sessions";
const candidateUrl =
	process.env.HERO_TITLE_CANDIDATE_URL ??
	"http://127.0.0.1:4321/preview/hero-title";
const gateName = process.env.HERO_TITLE_GATE_NAME ?? "g1";
const sanctionedTextChange = process.env.HERO_TITLE_SANCTIONED_TEXT_CHANGE
	? JSON.parse(process.env.HERO_TITLE_SANCTIONED_TEXT_CHANGE)
	: null;
const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const outputRoot = path.resolve(
	marketingRoot,
	`../../.context/gates/hero-title/${gateName}`,
);
const reverseClassMap = process.env.HERO_TITLE_RENAME_MAP
	? Object.fromEntries(
			Object.entries(
				JSON.parse(
					await readFile(
						path.resolve(marketingRoot, process.env.HERO_TITLE_RENAME_MAP),
						"utf8",
					),
				).classes,
			).map(([source, candidate]) => [candidate, source]),
		)
	: {};

const viewports = {
	phone: { width: 390, height: 844, dpr: 1, mobile: true },
	tablet: { width: 768, height: 1024, dpr: 1, mobile: true },
	desktop: { width: 1280, height: 800, dpr: 1, mobile: false },
	wide: { width: 1680, height: 1050, dpr: 1, mobile: false },
};
const cases = Object.keys(viewports).flatMap((viewport) =>
	["default", "secondary-hover", "focus-visible"].map((state) => ({
		viewport,
		state,
	})),
);

const pointFor = async (session, selector) => {
	const rect = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`,
	);
	if (!rect) throw new Error(`Could not resolve hero title target: ${selector}`);
	return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const applyState = async (session, state) => {
	if (state === "secondary-hover") {
		await session.client.call("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			...(await pointFor(session, "[data-button], [data-opaline-action]")),
			button: "none",
			buttons: 0,
		});
		await wait(300);
		return;
	}
	if (state === "focus-visible") {
		for (const type of ["rawKeyDown", "keyUp"]) {
			await session.client.call("Input.dispatchKeyEvent", {
				type,
				key: "Tab",
				code: "Tab",
				windowsVirtualKeyCode: 9,
			});
		}
		await wait(150);
		return;
	}
	await wait(150);
};

const structureExpression = `(() => {
	const root = document.querySelector("[data-interfere-title-source], [data-opaline-hero-title]");
	if (!root) throw new Error("Hero title root not found");
	const visible = (element) => {
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
	};
	const serializeStyle = (style) => Object.fromEntries(
		Array.from(style)
			.filter((property) => !property.startsWith("--"))
			.map((property) => [
				property,
				style.getPropertyValue(property)
					.replaceAll("https://assets.interfere.com/assets/InterVariable-DiVDrmQJ.woff2", "/fonts/interfere-inter-variable.woff2"),
			]),
	);
	const result = [];
	const visit = (element, path) => {
		if (!visible(element)) return;
		const rect = element.getBoundingClientRect();
		result.push({
			path,
			tag: element.tagName.toLowerCase(),
			className: element.getAttribute("class") ?? "",
			text: [...element.childNodes]
				.filter((node) => node.nodeType === Node.TEXT_NODE)
				.map((node) => node.textContent)
				.join("")
				.trim(),
			bounds: [rect.x, rect.y, rect.width, rect.height],
			style: serializeStyle(getComputedStyle(element)),
			before: serializeStyle(getComputedStyle(element, "::before")),
			after: serializeStyle(getComputedStyle(element, "::after")),
		});
		const tagCounts = new Map();
		for (const child of element.children) {
			const tag = child.tagName.toLowerCase();
			const index = tagCounts.get(tag) ?? 0;
			tagCounts.set(tag, index + 1);
			visit(child, path + "/" + tag + "[" + index + "]");
		}
	};
	visit(root, root.tagName.toLowerCase() + "[0]");
	return result;
})()`;

const compareStructures = (source, candidate) => {
	const differences = [];
	const sourceNodes = new Map(source.map((node) => [node.path, node]));
	const candidateNodes = new Map(candidate.map((node) => [node.path, node]));
	for (const key of new Set([...sourceNodes.keys(), ...candidateNodes.keys()])) {
		const left = sourceNodes.get(key);
		const right = candidateNodes.get(key);
		if (!left || !right) {
			differences.push({ type: "node", path: key, source: left, candidate: right });
			continue;
		}
		for (const field of ["tag", "className", "text"]) {
			const candidateValue = field === "className"
				? right[field].split(/\s+/).map((className) => reverseClassMap[className] ?? className).join(" ")
				: right[field];
			if (left[field] !== candidateValue) {
				differences.push({ type: "value", path: key, field, source: left[field], candidate: candidateValue });
			}
		}
		for (let index = 0; index < 4; index += 1) {
			if (Math.abs(left.bounds[index] - right.bounds[index]) > 0.01) {
				differences.push({
					type: "geometry",
					path: key,
					property: ["x", "y", "width", "height"][index],
					source: left.bounds[index],
					candidate: right.bounds[index],
				});
			}
		}
		for (const field of ["style", "before", "after"]) {
			if (JSON.stringify(left[field]) !== JSON.stringify(right[field])) {
				differences.push({ type: field, path: key, source: left[field], candidate: right[field] });
			}
		}
	}
	return differences;
};

const capture = async ({ url, viewport, state, label }) => {
	const session = await createBrowserSession({ url, ...viewport });
	try {
		await session.waitFor(
			'document.querySelector("[data-interfere-title-source], [data-opaline-hero-title]")?.getBoundingClientRect().height > 0',
		);
		await applyState(session, state);
		const screenshotPath = path.join(outputRoot, `${label}.png`);
		await session.screenshot(screenshotPath);
		const structure = await session.evaluate(structureExpression);
		await writeFile(
			path.join(outputRoot, `${label}.structure.json`),
			`${JSON.stringify(structure)}\n`,
		);
		return { screenshotPath, structure };
	} finally {
		await session.close();
	}
};

await mkdir(outputRoot, { recursive: true });
const results = [];
for (const testCase of cases) {
	const viewport = viewports[testCase.viewport];
	const name = `${testCase.viewport}-${testCase.state}`;
	const [source, candidate] = await Promise.all([
		capture({ url: sourceUrl, viewport, state: testCase.state, label: `${name}-source` }),
		capture({ url: candidateUrl, viewport, state: testCase.state, label: `${name}-candidate` }),
	]);
	const pixel = await comparePngs({
		leftPath: source.screenshotPath,
		rightPath: candidate.screenshotPath,
		diffPath: path.join(outputRoot, `${name}-diff.png`),
		exact: false,
	});
	const structuralDifferences = compareStructures(source.structure, candidate.structure);
	const unsanctionedStructuralDifferences = sanctionedTextChange
		? structuralDifferences.filter(
				(difference) =>
					!(
						difference.type === "value" &&
						difference.field === "text" &&
						difference.source === sanctionedTextChange.source &&
						difference.candidate === sanctionedTextChange.candidate
					),
			)
		: structuralDifferences;
	results.push({
		name,
		viewport,
		pixel,
		structuralDifferenceCount: structuralDifferences.length,
		structuralDifferences,
		unsanctionedStructuralDifferenceCount:
			unsanctionedStructuralDifferences.length,
	});
	console.log(
		`${name}: ${pixel.diffPercent.toFixed(6)}% pixels, ${structuralDifferences.length} structural`,
	);
}

const report = {
	gate: `${gateName.toUpperCase()}-hero-title`,
	generatedAt: new Date().toISOString(),
	sourceUrl,
	candidateUrl,
	thresholds: { maximumPixelDifferencePercent: 0.1, structuralDifferences: 0 },
	sanctionedTextChange,
	passed: results.every(
		(result) =>
			(sanctionedTextChange || result.pixel.diffPercent <= 0.1) &&
			result.unsanctionedStructuralDifferenceCount === 0 &&
			(!sanctionedTextChange || result.structuralDifferenceCount === 1),
	),
	results,
};
await writeFile(
	path.join(outputRoot, "report.json"),
	`${JSON.stringify(report, null, 2)}\n`,
);
if (!report.passed) process.exitCode = 1;
