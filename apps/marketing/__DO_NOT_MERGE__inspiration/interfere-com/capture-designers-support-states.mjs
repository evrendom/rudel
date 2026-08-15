import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL(".", import.meta.url));
const sourceUrl = "https://interfere.com/product/gtm";
const targetHeading = "Support customers with confidence";
const states = [
	{
		buttonName: "Identify impacted customers",
		outputName: "interfere-designers-support-state-1.source.html",
	},
	{
		buttonName: "Answer questions faster",
		outputName: "interfere-designers-support-state-2.source.html",
	},
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	console.log(`Opening ${sourceUrl}`);
	const page = await browser.newPage({
		deviceScaleFactor: 1,
		viewport: { height: 895, width: 1500 },
	});
	await page.goto(sourceUrl, {
		timeout: 60_000,
		waitUntil: "domcontentloaded",
	});

	const heading = page.getByRole("heading", { name: targetHeading });
	await heading.waitFor({ state: "visible", timeout: 30_000 });
	await heading.scrollIntoViewIfNeeded();
	await page.waitForTimeout(250);
	const section = heading.locator("xpath=ancestor::section[1]");

	for (const state of states) {
		await section
			.getByRole("button", { name: new RegExp(`^${state.buttonName}`) })
			.click();
		await page.waitForTimeout(500);
		const html = await section.evaluate((node) => node.outerHTML);
		const outputPath = resolve(root, state.outputName);
		await writeFile(outputPath, `${html}\n`);
		console.log(`Wrote ${outputPath}`);
	}
} finally {
	await browser.close();
}
