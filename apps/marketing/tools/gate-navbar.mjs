import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePngs } from "./diff.mjs";
import { createBrowserSession, wait } from "./driver.mjs";

const sourceUrl =
	"http://127.0.0.1:4176/next?opaline-source=navbar&opaline-links=rudel";
const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const candidateUrl =
	process.env.NAVBAR_CANDIDATE_URL ?? "http://127.0.0.1:4321/preview/navbar";
const gateName = process.env.NAVBAR_GATE_NAME ?? "g1";
const outputRoot = path.resolve(
	marketingRoot,
	`../../.context/gates/navbar/${gateName}`,
);
const reverseClassMap = process.env.NAVBAR_RENAME_MAP
	? Object.fromEntries(
			Object.entries(
				JSON.parse(
					await readFile(
						path.resolve(marketingRoot, process.env.NAVBAR_RENAME_MAP),
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

const cases = [
	{ viewport: "phone", state: "closed" },
	{ viewport: "phone", state: "mobile-open" },
	{ viewport: "tablet", state: "closed" },
	{ viewport: "tablet", state: "mobile-open" },
	{ viewport: "desktop", state: "closed" },
	{ viewport: "desktop", state: "product-open" },
	{ viewport: "desktop", state: "product-item-hover" },
	{ viewport: "desktop", state: "resources-open" },
	{ viewport: "desktop", state: "npm-hover" },
	{ viewport: "desktop", state: "focus-visible" },
	{ viewport: "wide", state: "closed" },
	{ viewport: "wide", state: "product-open" },
	{ viewport: "wide", state: "resources-open" },
];

const pointFor = async (session, selector) => {
	const rect = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`,
	);
	if (!rect) throw new Error(`Could not resolve navbar target: ${selector}`);
	return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const moveTo = async (session, selector) => {
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		...(await pointFor(session, selector)),
		button: "none",
		buttons: 0,
	});
};

const click = async (session, selector) => {
	const point = await pointFor(session, selector);
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mousePressed",
		...point,
		button: "left",
		clickCount: 1,
	});
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		...point,
		button: "left",
		clickCount: 1,
	});
};

const applyState = async (session, state) => {
	if (state === "closed") {
		await wait(250);
		return;
	}
	if (state === "mobile-open") {
		await click(session, 'button[aria-haspopup="dialog"]');
		await wait(700);
		return;
	}
	if (state === "npm-hover") {
		await moveTo(
			session,
			"[data-rudel-navbar-link], [data-opaline-navbar-proof-link]",
		);
		await wait(200);
		return;
	}
	if (state === "focus-visible") {
		await session.client.call("Input.dispatchKeyEvent", {
			type: "rawKeyDown",
			key: "Tab",
			code: "Tab",
			windowsVirtualKeyCode: 9,
		});
		await session.client.call("Input.dispatchKeyEvent", {
			type: "keyUp",
			key: "Tab",
			code: "Tab",
			windowsVirtualKeyCode: 9,
		});
		await wait(120);
		return;
	}
	if (state === "resources-open") {
		await moveTo(session, 'button[id*="trigger-resources"]');
		await wait(700);
		return;
	}
	await moveTo(session, 'button[id*="trigger-product"]');
	await wait(700);
	if (state === "product-item-hover") {
		await moveTo(session, '[id*="content-product"] a div');
		await wait(120);
	}
};

const structureExpression = `(() => {
	const rootSelectors = [
		"header",
		"[data-opaline-navbar-desktop-portal]",
		"[data-linear-navbar-portal]",
		"[data-opaline-navbar-portal]",
		"[role=dialog]",
	];
	const visible = (element) => {
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		return style.display !== "none" && style.visibility !== "hidden" &&
			(rect.width > 0 || rect.height > 0 || element.matches("header"));
	};
	const roots = [...document.querySelectorAll(rootSelectors.join(","))]
		.filter((root) =>
			visible(root) &&
			!root.closest("template") &&
			(root.matches("header, [role=dialog]") || root.children.length > 0)
		);
	const serializeStyle = (style) => Object.fromEntries(
		Array.from(style)
			.filter((property) => !property.startsWith("--"))
			.map((property) => [
				property,
				style.getPropertyValue(property)
					.replaceAll('http://127.0.0.1:4176/__opaline/wordmark.svg', '/opaline-wordmark.svg')
					.replaceAll('http://127.0.0.1:4321/opaline-wordmark.svg', '/opaline-wordmark.svg'),
			]),
	);
	const serialize = (root, rootIndex) => {
		const result = [];
		const visit = (element, path) => {
			if (!visible(element)) return;
			const rect = element.getBoundingClientRect();
			result.push({
				root: rootIndex,
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
	};
	return roots.flatMap(serialize);
})()`;

const compareStructures = (left, right) => {
	const differences = [];
	const sourceNodes = new Map(
		left.map((node) => [`${node.root}:${node.path}`, node]),
	);
	const candidateNodes = new Map(
		right.map((node) => [`${node.root}:${node.path}`, node]),
	);
	const nodeKeys = new Set([...sourceNodes.keys(), ...candidateNodes.keys()]);
	for (const key of nodeKeys) {
		const source = sourceNodes.get(key);
		const candidate = candidateNodes.get(key);
		if (!source || !candidate) {
			differences.push({ type: "node", key, source, candidate });
			continue;
		}
		for (const field of ["root", "path", "tag", "className", "text"]) {
			const candidateValue =
				field === "className"
					? candidate[field]
							.split(/\s+/)
							.map((className) => reverseClassMap[className] ?? className)
							.join(" ")
					: candidate[field];
			if (source[field] !== candidateValue) {
				differences.push({
					type: "value",
					key,
					path: source.path,
					field,
					source: source[field],
					candidate: candidateValue,
				});
			}
		}
		for (let boundIndex = 0; boundIndex < 4; boundIndex += 1) {
			if (
				Math.abs(source.bounds[boundIndex] - candidate.bounds[boundIndex]) >
				0.01
			) {
				differences.push({
					type: "geometry",
					key,
					path: source.path,
					property: ["x", "y", "width", "height"][boundIndex],
					source: source.bounds[boundIndex],
					candidate: candidate.bounds[boundIndex],
				});
			}
		}
		for (const property of ["style", "before", "after"]) {
			const sourceValue = JSON.stringify(source[property]);
			const candidateValue = JSON.stringify(candidate[property]);
			if (sourceValue !== candidateValue) {
				differences.push({
					type: property,
					key,
					path: source.path,
					source: source[property],
					candidate: candidate[property],
				});
			}
		}
	}
	return differences;
};

const capture = async ({ url, viewport, state, label }) => {
	const session = await createBrowserSession({ url, ...viewport });
	try {
		await session.waitFor(
			'document.querySelectorAll("[data-rudel-navbar-link], [data-opaline-navbar-proof-link]").length === 2',
			{ timeout: 10_000 },
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

const main = async () => {
	await mkdir(outputRoot, { recursive: true });
	const results = [];
	for (const testCase of cases) {
		const viewport = viewports[testCase.viewport];
		const name = `${testCase.viewport}-${testCase.state}`;
		const [source, candidate] = await Promise.all([
			capture({
				url: sourceUrl,
				viewport,
				state: testCase.state,
				label: `${name}-source`,
			}),
			capture({
				url: candidateUrl,
				viewport,
				state: testCase.state,
				label: `${name}-candidate`,
			}),
		]);
		const pixel = await comparePngs({
			leftPath: source.screenshotPath,
			rightPath: candidate.screenshotPath,
			diffPath: path.join(outputRoot, `${name}-diff.png`),
			exact: false,
		});
		const structuralDifferences = compareStructures(
			source.structure,
			candidate.structure,
		);
		results.push({
			name,
			viewport,
			pixel,
			structuralDifferenceCount: structuralDifferences.length,
			structuralDifferences,
		});
		console.log(
			`${name}: ${pixel.diffPercent.toFixed(6)}% pixels, ${structuralDifferences.length} structural`,
		);
	}

	const report = {
		gate: `${gateName.toUpperCase()}-navbar`,
		generatedAt: new Date().toISOString(),
		sourceUrl,
		candidateUrl,
		thresholds: {
			maximumPixelDifferencePercent: 0.1,
			structuralDifferences: 0,
		},
		passed: results.every(
			(result) =>
				result.pixel.diffPercent <= 0.1 &&
				result.structuralDifferenceCount === 0,
		),
		results,
	};
	await writeFile(
		path.join(outputRoot, "report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	if (!report.passed) process.exitCode = 1;
};

await main();
