import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const sourceDataPath = path.join(
	marketingRoot,
	"src/components/generated/dashboard-source-data.ts",
);
const artifactRoot = path.resolve(
	marketingRoot,
	"../../.context/gates/dashboard/reporting-static-fallback",
);
const staticVisual =
	'<picture data-opaline-reporting-static-visual aria-hidden="true"><source media="(max-width: 767px)" width="374" height="315" srcset="/vendor/attio-dashboard/reporting-panel-phone-source.png 1x, /vendor/attio-dashboard/reporting-panel-phone-source@3x.png 3x"><source media="(max-width: 991px)" width="506" height="380" srcset="/vendor/attio-dashboard/reporting-panel-tablet-source.png 1x, /vendor/attio-dashboard/reporting-panel-tablet-source@3x.png 3x"><source media="(max-width: 1554px)" width="946" height="514" srcset="/vendor/attio-dashboard/reporting-panel-desktop-source.png 1x, /vendor/attio-dashboard/reporting-panel-desktop-source@3x.png 3x"><img src="/vendor/attio-dashboard/reporting-panel-wide-source.png" srcset="/vendor/attio-dashboard/reporting-panel-wide-source.png 1x, /vendor/attio-dashboard/reporting-panel-wide-source@3x.png 3x" width="1246" height="675" alt=""></picture><span data-opaline-reporting-static-description>Business Metrics. Overview of our sales pipeline, revenue growth, customer demographics, and more. Revenue growth by paid plan. Closed-won deals by MQL type. Sales pipeline. New signups by creation cohort.</span>';
const voidElements = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

const readExportedValue = (source, name) => {
	const line = source
		.split("\n")
		.find((candidate) => candidate.startsWith(`export const ${name} = `));
	if (!line) throw new Error(`Could not read dashboard field: ${name}`);
	return JSON.parse(
		line
			.slice(`export const ${name} = `.length)
			.replace(/ as const;$/, "")
			.replace(/;$/, ""),
	);
};

const deactivateCoveredMedia = (markup) =>
	markup
		// Static Reporting imagery and Claude overlays own these pixels, so their
		// covered source media must not request assets that are not shipped.
		.replace(/\s+poster="\/videos\/[^"]*"/g, "")
		.replace(/\s+src="\/videos\/[^"]*"/g, "");

const elementRanges = (markup) => {
	const nodes = [];
	const stack = [];
	const tag = /<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*?)?\/?\s*>/g;
	for (const match of markup.matchAll(tag)) {
		const raw = match[0];
		const name = match[1].toLowerCase();
		if (raw.startsWith("</")) {
			for (let index = stack.length - 1; index >= 0; index -= 1) {
				if (stack[index].name !== name) continue;
				const node = stack[index];
				stack.length = index;
				node.endStart = match.index;
				node.end = match.index + raw.length;
				nodes.push(node);
				break;
			}
			continue;
		}
		if (raw.endsWith("/>") || voidElements.has(name)) continue;
		stack.push({
			name,
			start: match.index,
			innerStart: match.index + raw.length,
		});
	}
	return nodes;
};

const addStaticVisual = (markup, field) => {
	const cleanMarkup = deactivateCoveredMedia(markup)
		.replace(
			/<picture data-opaline-reporting-static-visual[\s\S]*?<\/picture><span data-opaline-reporting-static-description>[\s\S]*?<\/span>/g,
			"",
		)
		.replace(
			/<img data-opaline-reporting-static-visual[^>]*><span data-opaline-reporting-static-description>[\s\S]*?<\/span>/g,
			"",
		)
		.replace(' data-opaline-reporting-static-body=""', "");
	const target = elementRanges(cleanMarkup)
		.filter((node) => node.start === 0 && node.end === cleanMarkup.length)
		.at(0);
	if (!target)
		throw new Error(`Could not isolate the Reporting visual in ${field}`);
	const openingTag = cleanMarkup.slice(target.start, target.innerStart);
	const markedOpeningTag = openingTag.replace(
		/>$/,
		' data-opaline-reporting-static-body="">',
	);
	const result = [
		cleanMarkup.slice(0, target.start),
		markedOpeningTag,
		staticVisual,
		cleanMarkup.slice(target.innerStart),
	].join("");
	return {
		result,
		target: {
			field,
			name: target.name,
			start: target.start,
			end: target.end,
			bytes: target.end - target.start,
			sha256: createHash("sha256")
				.update(cleanMarkup.slice(target.start, target.end))
				.digest("hex"),
		},
	};
};

const source = await readFile(sourceDataPath, "utf8");
const reportingFields = new Set(["reportingPanelHtml", "mobileReportingHtml"]);
const stringFields = [
	"dashboardHtml",
	"shellHtml",
	"dataPanelHtml",
	"reportingPanelHtml",
	"mobileDataHtml",
	"mobileReportingHtml",
];
const transformed = {};
const targets = [];
for (const field of stringFields) {
	const value = deactivateCoveredMedia(readExportedValue(source, field));
	if (!reportingFields.has(field)) {
		transformed[field] = value;
		continue;
	}
	const change = addStaticVisual(value, field);
	transformed[field] = change.result;
	targets.push(change.target);
}
const pageRoot = readExportedValue(source, "dashboardPageRoot");

await mkdir(artifactRoot, { recursive: true });
await Promise.all([
	writeFile(
		sourceDataPath,
		[
			"// Generated by tools/extract-dashboard.mjs with the approved static Reporting visual fallback.",
			...stringFields.map(
				(field) =>
					`export const ${field} = ${JSON.stringify(transformed[field])};`,
			),
			`export const dashboardPageRoot = ${JSON.stringify(pageRoot)} as const;`,
			"",
		].join("\n"),
	),
	writeFile(
		path.join(artifactRoot, "codemod-report.json"),
		`${JSON.stringify(
			{
				gate: "dashboard-reporting-static-fallback",
				generatedAt: new Date().toISOString(),
				passed: targets.length === reportingFields.size,
				assets:
					"breakpoint-specific 1x and source-captured 3x PNGs selected through density srcset",
				transformation:
					"overlay-source-captured-report-body-with-a-static-image",
				targets,
			},
			null,
			2,
		)}\n`,
	),
]);

console.log(
	JSON.stringify({ reportingFields: targets.length, targets }, null, 2),
);
