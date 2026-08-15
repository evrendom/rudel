import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL(".", import.meta.url));
const outputPath = resolve(
	root,
	"interfere-designers-ship-faster-state-1.source.html",
);
const sourceUrl = "https://interfere.com/product/designers";
const targetHeading =
	"Ship faster knowing you’ll understand when something breaks—and why.";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const page = await browser.newPage({
		deviceScaleFactor: 1,
		viewport: { height: 900, width: 1440 },
	});
	await page.goto(sourceUrl, {
		timeout: 60_000,
		waitUntil: "domcontentloaded",
	});
	await page
		.waitForLoadState("networkidle", { timeout: 30_000 })
		.catch(() => {});

	await page.evaluate(async () => {
		for (let top = 0; top < document.documentElement.scrollHeight; top += 700) {
			window.scrollTo({ behavior: "instant", top });
			await new Promise((resolveFrame) =>
				requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
			);
		}
	});

	const heading = page.getByRole("heading", { name: targetHeading });
	await heading.scrollIntoViewIfNeeded();
	await page
		.getByRole("button", { name: /^Follow ongoing problems/ })
		.first()
		.click();
	await page.waitForTimeout(500);

	const section = await heading.evaluate((node) => {
		const owner = node.closest("section");
		if (!owner) throw new Error("Unable to locate the ship-faster section.");
		return owner.outerHTML;
	});
	await writeFile(outputPath, `${section}\n`);
	console.log(`Wrote ${outputPath}`);
} finally {
	await browser.close();
}
