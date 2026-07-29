import { expect, test } from "@playwright/test";

// One second leaves ample shared-CI headroom while still catching tab-freezing
// regressions. The fixtures also enforce a measured ceiling on generated DOM.
const MAX_BROWSER_RENDER_MS = 1_000;
const MAX_BROWSER_DOM_NODES = 2_500;

for (const scenario of ["code", "large-code", "xml"]) {
	test(`bounds maximum-size adversarial ${scenario} rendering`, async ({
		page,
	}) => {
		await page.goto(`/browser-tests/message-content.html?scenario=${scenario}`);

		const renderResult = page.locator("#render-result");
		await expect(renderResult).toHaveAttribute("data-complete", "true");

		if (scenario !== "large-code") {
			await expect(
				page.getByText(
					"Remaining message shown as plain text because it contains too many formatted parts",
				),
			).toBeVisible();
		}

		const durationMs = Number(
			await renderResult.getAttribute("data-duration-ms"),
		);
		const domNodes = Number(await renderResult.getAttribute("data-dom-nodes"));
		const codeBlocks = Number(
			await renderResult.getAttribute("data-code-blocks"),
		);
		const xmlBlocks = Number(
			await renderResult.getAttribute("data-xml-blocks"),
		);

		expect(durationMs).toBeLessThan(MAX_BROWSER_RENDER_MS);
		expect(domNodes).toBeLessThan(MAX_BROWSER_DOM_NODES);

		if (scenario === "code") {
			expect(codeBlocks).toBe(99);
			expect(xmlBlocks).toBe(0);
		} else if (scenario === "xml") {
			expect(codeBlocks).toBe(0);
			expect(xmlBlocks).toBe(49);
		} else {
			expect(codeBlocks).toBe(2);
			expect(xmlBlocks).toBe(0);
		}
	});
}
