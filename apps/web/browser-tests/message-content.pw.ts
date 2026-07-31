import { expect, test } from "@playwright/test";
import {
	MAX_FORMATTED_MESSAGE_PARTS,
	MAX_HIGHLIGHTED_CODE_BLOCKS,
} from "../src/components/conversation/message-content-parser";

// DOM size is the hard resource bound. Time is only a generous smoke check
// because shared CI runners vary substantially in speed.
const MAX_BROWSER_RENDER_MS = 5_000;
const MAX_BROWSER_DOM_NODES = 20_000;

for (const scenario of ["array", "code", "large-code", "xml"]) {
	test(`bounds maximum-size adversarial ${scenario} rendering`, async ({
		page,
	}) => {
		await page.goto(`/browser-tests/message-content.html?scenario=${scenario}`);

		const renderResult = page.locator("#render-result");
		await expect(renderResult).toHaveAttribute("data-complete", "true");

		if (scenario !== "large-code") {
			await expect(page.getByTestId("message-content-notice")).toBeVisible();
		}
		if (scenario === "array") {
			await expect(page.getByText(/array-tail-visible/)).toBeVisible();
		}

		const durationMs = Number(
			await renderResult.getAttribute("data-duration-ms"),
		);
		const domNodes = Number(await renderResult.getAttribute("data-dom-nodes"));
		const codeBlocks = Number(
			await renderResult.getAttribute("data-code-blocks"),
		);
		const highlightedCodeBlocks = Number(
			await renderResult.getAttribute("data-highlighted-code-blocks"),
		);
		const xmlBlocks = Number(
			await renderResult.getAttribute("data-xml-blocks"),
		);

		expect(durationMs).toBeLessThan(MAX_BROWSER_RENDER_MS);
		expect(domNodes).toBeLessThan(MAX_BROWSER_DOM_NODES);
		expect(highlightedCodeBlocks).toBeLessThanOrEqual(
			MAX_HIGHLIGHTED_CODE_BLOCKS,
		);

		if (scenario === "array" || scenario === "code") {
			expect(codeBlocks).toBe(MAX_FORMATTED_MESSAGE_PARTS);
			expect(xmlBlocks).toBe(0);
		} else if (scenario === "xml") {
			expect(codeBlocks).toBe(0);
			expect(xmlBlocks).toBe(Math.floor(MAX_FORMATTED_MESSAGE_PARTS / 2));
		} else {
			expect(codeBlocks).toBe(MAX_HIGHLIGHTED_CODE_BLOCKS + 1);
			expect(highlightedCodeBlocks).toBe(MAX_HIGHLIGHTED_CODE_BLOCKS);
			expect(xmlBlocks).toBe(0);
		}
	});
}
