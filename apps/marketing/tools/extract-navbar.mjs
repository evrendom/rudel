import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserSession, wait } from "./driver.mjs";

const sourceUrl =
	"http://127.0.0.1:4176/next?opaline-source=navbar&opaline-links=rudel";
const marketingRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const vendorRoot = path.join(marketingRoot, "src/styles/vendor/linear/navbar");
const artifactRoot = path.resolve(
	marketingRoot,
	"../../.context/extractions/navbar",
);
const generatedDataPath = path.join(
	marketingRoot,
	"src/components/generated/navbar-source-data.ts",
);

const hash = (content) => createHash("sha256").update(content).digest("hex");

const writeText = async (filePath, content) => {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`);
};

const fetchBytes = async (url) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Could not fetch ${url}: ${response.status}`);
	}
	return Buffer.from(await response.arrayBuffer());
};

const movePointer = async (session, selector) => {
	const rect = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`,
	);
	if (!rect) throw new Error(`Navbar trigger not found: ${selector}`);
	await session.client.call("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: rect.x + rect.width / 2,
		y: rect.y + rect.height / 2,
		button: "none",
		buttons: 0,
	});
	await wait(350);
};

const clickPointer = async (session, selector) => {
	const rect = await session.evaluate(
		`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`,
	);
	if (!rect) throw new Error(`Navbar trigger not found: ${selector}`);
	const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
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
	await wait(250);
};

const captureDesktop = async () => {
	const session = await createBrowserSession({
		url: sourceUrl,
		width: 1280,
		height: 800,
		dpr: 1,
	});
	try {
		await session.waitFor(
			'document.querySelectorAll("[data-rudel-navbar-link]").length === 2 && Boolean(document.querySelector("[data-opaline-brand=wordmark]"))',
			{ timeout: 10_000 },
		);
		await wait(500);
		const base = await session.evaluate(`(() => ({
			rootFontSize: getComputedStyle(document.documentElement).fontSize,
			header: document.querySelector("header")?.outerHTML ?? "",
			stylesheets: [...document.styleSheets].map((sheet) => sheet.href).filter(Boolean),
			styledStyle: [...document.querySelectorAll("style[data-styled]")]
				.flatMap((style) => {
					try {
						return [...(style.sheet?.cssRules ?? [])].map((rule) => rule.cssText);
					} catch {
						return [];
					}
				})
				.join("\\n"),
			adoptedStyle: document.querySelector("style[data-opaline-captured-adopted-styles]")?.textContent ?? "",
			rudelLinksStyle: document.querySelector("style[data-rudel-navbar-links]")?.textContent ?? "",
		}))()`);

		await movePointer(session, 'button[id*="trigger-product"]');
		const product = await session.evaluate(
			'document.querySelector(".TZTsQG_viewportPosition")?.outerHTML ?? ""',
		);
		await movePointer(session, 'button[id*="trigger-resources"]');
		const resources = await session.evaluate(
			'document.querySelector(".TZTsQG_viewportPosition")?.outerHTML ?? ""',
		);
		const dynamicStyledStyle = await session.evaluate(
			`[...document.querySelectorAll("style[data-styled]")]
				.flatMap((style) => [...(style.sheet?.cssRules ?? [])].map((rule) => rule.cssText))
				.join("\\n")`,
		);
		return { ...base, product, resources, dynamicStyledStyle };
	} finally {
		await session.close();
	}
};

const captureMobile = async () => {
	const session = await createBrowserSession({
		url: sourceUrl,
		width: 390,
		height: 844,
		dpr: 1,
		mobile: true,
	});
	try {
		await session.waitFor(
			'document.querySelectorAll("[data-rudel-navbar-link]").length === 2 && Boolean(document.querySelector("[data-opaline-brand=wordmark]"))',
			{ timeout: 10_000 },
		);
		await wait(500);
		await clickPointer(session, 'button[aria-haspopup="dialog"]');
		return await session.evaluate(`(() => ({
			html: [...document.body.children]
				.filter((element) => element.matches('[role="dialog"][data-linear-navbar-portal]'))
				.map((element) => element.outerHTML)
				.join(""),
			styledStyle: [...document.querySelectorAll("style[data-styled]")]
				.flatMap((style) => [...(style.sheet?.cssRules ?? [])].map((rule) => rule.cssText))
				.join("\\n"),
		}))()`);
	} finally {
		await session.close();
	}
};

const main = async () => {
	const [desktop, mobile] = await Promise.all([
		captureDesktop(),
		captureMobile(),
	]);
	if (
		!desktop.header ||
		!desktop.product ||
		!desktop.resources ||
		!mobile.html
	) {
		throw new Error(
			"The settled navbar source did not expose every required state",
		);
	}

	await mkdir(vendorRoot, { recursive: true });
	await mkdir(artifactRoot, { recursive: true });
	const manifest = [];
	const stylesheetContents = [];
	for (const url of desktop.stylesheets) {
		const content = await fetchBytes(url);
		const fileName = path.basename(new URL(url).pathname);
		await writeFile(path.join(vendorRoot, fileName), content);
		stylesheetContents.push(content.toString("utf8"));
		manifest.push({
			url,
			file: fileName,
			bytes: content.byteLength,
			sha256: hash(content),
		});
	}

	const fontUrl = "https://static.linear.app/fonts/InterVariable.woff2?v=4.1";
	const font = await fetchBytes(fontUrl);
	const fontPath = path.join(
		marketingRoot,
		"public/fonts/linear-inter-variable.woff2",
	);
	await mkdir(path.dirname(fontPath), { recursive: true });
	await writeFile(fontPath, font);
	const localFontUrl = "/fonts/linear-inter-variable.woff2";
	const combinedStyles = stylesheetContents
		.join("\n")
		.replaceAll(fontUrl, localFontUrl);
	const localizeMarkup = (markup) =>
		markup.replaceAll(
			"http://127.0.0.1:4176/__opaline/wordmark.svg",
			"/opaline-wordmark.svg",
		);
	const generatedData = [
		"// Generated by tools/extract-navbar.mjs from the settled local reference.",
		`export const headerHtml = ${JSON.stringify(localizeMarkup(desktop.header))};`,
		`export const productPortalHtml = ${JSON.stringify(localizeMarkup(desktop.product))};`,
		`export const resourcesPortalHtml = ${JSON.stringify(localizeMarkup(desktop.resources))};`,
		`export const mobileDialogHtml = ${JSON.stringify(localizeMarkup(mobile.html))};`,
		"",
	].join("\n");

	await Promise.all([
		writeText(
			path.join(vendorRoot, "source.css"),
			`${combinedStyles}\n${desktop.styledStyle}\n${desktop.dynamicStyledStyle}\n${mobile.styledStyle}\n${desktop.adoptedStyle}\n${desktop.rudelLinksStyle}`,
		),
		writeText(
			path.join(vendorRoot, "styled.css"),
			`${desktop.styledStyle}\n${desktop.dynamicStyledStyle}\n${mobile.styledStyle}`,
		),
		writeText(path.join(vendorRoot, "adopted.css"), desktop.adoptedStyle),
		writeText(
			path.join(vendorRoot, "rudel-links.css"),
			desktop.rudelLinksStyle,
		),
		writeText(generatedDataPath, generatedData),
		writeText(path.join(artifactRoot, "closed.html"), desktop.header),
		writeText(path.join(artifactRoot, "product-open.html"), desktop.product),
		writeText(
			path.join(artifactRoot, "resources-open.html"),
			desktop.resources,
		),
		writeText(path.join(artifactRoot, "mobile-open.html"), mobile.html),
		writeText(
			path.join(artifactRoot, "manifest.json"),
			JSON.stringify(
				{
					sourceUrl,
					capturedAt: new Date().toISOString(),
					rootFontSize: desktop.rootFontSize,
					stylesheets: manifest,
					font: {
						url: fontUrl,
						file: "public/fonts/linear-inter-variable.woff2",
						bytes: font.byteLength,
						sha256: hash(font),
					},
				},
				null,
				2,
			),
		),
	]);

	console.log(
		JSON.stringify(
			{
				stylesheets: manifest.length,
				vendorRoot,
				artifactRoot,
				fontSha256: hash(font),
			},
			null,
			2,
		),
	);
};

await main();
