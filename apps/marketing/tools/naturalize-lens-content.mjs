import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const marketingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(marketingRoot, "src/styles/vendor/lens/content");
const sourceDataPath = path.join(
	marketingRoot,
	"src/components/generated/lens-content-source-data.ts",
);
const naturalizedDataPath = path.join(
	marketingRoot,
	"src/components/generated/lens-content-data.ts",
);
const renameMapPath = path.join(
	marketingRoot,
	"tools/rename-map/lens-content.json",
);
const scopeClass = "opaline-lens-content-scope";
const rootFontClasses = {
	"inter_f05be44d-module__oejGIq__variable": "opaline-lens-font-inter-variable",
	"saans_2a59db7f-module__o9bOXG__variable": "opaline-lens-font-saans-variable",
	"sfmono_2a3ca64-module__fB1F7G__variable": "opaline-lens-font-mono-variable",
	"inter_f05be44d-module__oejGIq__className": "opaline-lens-font-inter",
	"lfe_6b127040-module__uvnWxW__variable": "opaline-lens-font-lfs-variable",
};
const moduleNames = {
	"1xjNtG": "page",
	"iwFn6W": "topbar",
	"zSSrMW": "intro",
	"dyHaOG": "intro-lockup",
	"yvozIa": "brand-mark",
	"2kXzVG": "eyebrow",
	HICQDG: "button",
	"jd8z-a": "spinner",
	p9poVW: "divider",
	EYXGkW: "all-in-one",
	"5YpdwW": "performance",
	X7Ct7W: "primitives",
	zVfO1q: "onboarding",
	"l-1wIW": "developer-docs",
	eqYL5W: "social-primitives",
	c2rIDa: "grove",
	SFsO5a: "footer",
};

const readExportedValue = (source, name) => {
	const match = source.match(new RegExp(`export const ${name} = (.*?)(?: as const)?;\\n`));
	if (!match?.[1]) throw new Error(`Could not read Lens content field: ${name}`);
	return JSON.parse(match[1]);
};
const kebab = (value) => value
	.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
	.replace(/[^a-zA-Z0-9]+/g, "-")
	.replace(/^-|-$/g, "")
	.toLowerCase();

const [sourceCss, sourceRouteCss, sourceData] = await Promise.all([
	readFile(path.join(vendorRoot, "source.css"), "utf8"),
	readFile(path.join(vendorRoot, "source-route.css"), "utf8"),
	readFile(sourceDataPath, "utf8"),
]);
const sourceHtml = readExportedValue(sourceData, "mainHtml");
const pageRoot = readExportedValue(sourceData, "lensContentPageRoot");
const markupClasses = [...sourceHtml.matchAll(/class="([^"]*)"/g)]
	.flatMap((match) => match[1].split(/\s+/))
	.filter(Boolean);
const classes = {};
for (const className of new Set(markupClasses)) {
	const moduleMatch = className.match(
		/^styles-module-scss-module__([^_]+)__([a-zA-Z0-9_-]+)$/,
	);
	if (moduleMatch) {
		const [, moduleId, localName] = moduleMatch;
		classes[className] = `opaline-lens-${moduleNames[moduleId] ?? `module-${kebab(moduleId)}`}-${kebab(localName)}`;
	} else {
		classes[className] = `opaline-lens-graphic-${kebab(className)}`;
	}
}
Object.assign(classes, rootFontClasses);
const renameMap = { classes, attributes: {} };

const naturalizeMarkup = (markup) => markup.replace(
	/class="([^"]*)"/g,
	(_match, value) => `class="${value.split(/\s+/).map((name) => classes[name] ?? name).join(" ")}"`,
);

const scopeNode = () => selectorParser.className({ value: scopeClass });
const zeroSpecificityScope = () => {
	const scope = selectorParser.pseudo({ value: ":where" });
	scope.append(selectorParser.selector({ nodes: [scopeNode()] }));
	return scope;
};
const rootSelectors = new Set(["html", ":root", "body", "html body", "html,html body"]);
const transformSelector = selectorParser((selectors) => {
	selectors.each((selector) => {
		const original = selector.toString().trim();
		if (rootSelectors.has(original)) {
			selector.removeAll();
			selector.append(scopeNode());
			return;
		}
		selector.walkClasses((node) => {
			const renamed = classes[node.value];
			if (renamed) node.value = renamed;
		});
		const targetsRootFont = Object.values(rootFontClasses).some((className) => {
			let found = false;
			selector.walkClasses((node) => {
				if (node.value === className) found = true;
			});
			return found;
		});
		if (targetsRootFont) {
			selector.prepend(scopeNode());
			return;
		}
		selector.prepend(selectorParser.combinator({ value: " " }));
		selector.prepend(zeroSpecificityScope());
	});
});

const pxValue = (value) => value.replace(
	/(-?(?:\d+\.?\d*|\.\d+))rem\b/g,
	(_match, number) => `${Number(number) * 16}px`,
);
const naturalizeCss = (source, from, { sourceRoute = false } = {}) => {
	const root = postcss.parse(source, { from });
	root.walkAtRules((rule) => {
		if (rule.params?.includes("rem")) rule.params = pxValue(rule.params);
	});
	root.walkDecls((declaration) => {
		if (declaration.value.includes("rem")) declaration.value = pxValue(declaration.value);
	});
	root.walkRules((rule) => {
		if (rule.parent?.type === "atrule" && rule.parent.name.endsWith("keyframes")) return;
		if (sourceRoute) {
			if (rule.selector.includes("body > :not(main)")) {
				rule.remove();
				return;
			}
			if (rule.selector.trim() === "html,\n\tbody") {
				rule.selector = `.${scopeClass}`;
				return;
			}
			rule.selector = rule.selector.replaceAll("body > main", `:where(.${scopeClass}) > main`);
			return;
		}
		rule.selector = transformSelector.processSync(rule.selector);
	});
	return root.toString();
};

const naturalizedCss = [
	`@layer lens {`,
	`.${scopeClass} { display: contents; font-feature-settings: normal; font-synthesis: initial; }`,
	naturalizeCss(sourceCss, path.join(vendorRoot, "source.css")),
	naturalizeCss(sourceRouteCss, path.join(vendorRoot, "source-route.css"), { sourceRoute: true }),
	`}`,
].join("\n");
const naturalizedHtml = naturalizeMarkup(sourceHtml);
const scopeClasses = [
	scopeClass,
	...pageRoot.htmlClass
		.split(/\s+/)
		.filter((name) => name && !name.endsWith("__className"))
		.map((name) => classes[name] ?? name),
];

await Promise.all([
	mkdir(path.dirname(naturalizedDataPath), { recursive: true }),
	mkdir(path.dirname(renameMapPath), { recursive: true }),
]);
await Promise.all([
	writeFile(path.join(vendorRoot, "naturalized.css"), naturalizedCss),
	writeFile(
		naturalizedDataPath,
		[
			"// Generated by tools/naturalize-lens-content.mjs from the gated source snapshot.",
			`export const mainHtml = ${JSON.stringify(naturalizedHtml)};`,
			`export const scopeClasses = ${JSON.stringify(scopeClasses.join(" "))};`,
			"",
		].join("\n"),
	),
	writeFile(renameMapPath, `${JSON.stringify(renameMap, null, 2)}\n`),
]);

console.log(JSON.stringify({ classesRenamed: Object.keys(classes).length, scopeClass }, null, 2));
