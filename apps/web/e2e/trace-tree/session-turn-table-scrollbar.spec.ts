import { expect, type Locator, type Page, test } from "@playwright/test";

const INTEGRATION_ROUTE = "/dev/session-detail-fast-integration";

async function waitForFrames(page: Page, count = 2) {
	await page.evaluate(async (frameCount) => {
		for (let index = 0; index < frameCount; index += 1) {
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
		}
	}, count);
}

async function requireBounds(locator: Locator, label: string) {
	const bounds = await locator.boundingBox();
	if (!bounds) {
		throw new Error(`Expected ${label} bounds`);
	}
	return bounds;
}

test("the ledger scrollbar stays below the sticky header and behaves like an overlay", async ({
	browserName,
	page,
}) => {
	await page.goto(INTEGRATION_ROUTE);
	const scroller = page.locator("[data-session-turn-table-scroll]");
	const proxy = page.locator("[data-session-turn-table-scrollbar]");
	const thumb = page.locator("[data-session-turn-table-scrollbar-thumb]");
	await expect(scroller).toBeVisible();
	await expect(scroller.locator("tbody tr")).toHaveCount(200);

	if (browserName === "firefox") {
		await expect(proxy).toBeHidden();
		expect(
			await page.evaluate(() => CSS.supports("scrollbar-width: thin")),
		).toBe(true);
	} else {
		await expect(proxy).toHaveAttribute("data-overflow", "true");
		const scrollerBounds = await requireBounds(scroller, "ledger scroller");
		const headerBounds = await requireBounds(
			scroller.locator("thead"),
			"ledger header",
		);
		const headerClip = {
			height: Math.floor(headerBounds.height),
			width: 8,
			x: Math.floor(scrollerBounds.x + scrollerBounds.width - 8),
			y: Math.floor(scrollerBounds.y),
		};
		const bodyClip = {
			height: Math.min(
				160,
				Math.floor(scrollerBounds.height - headerBounds.height - 8),
			),
			width: 8,
			x: headerClip.x,
			y: Math.ceil(headerBounds.y + headerBounds.height),
		};
		const trackBottom = await thumb.evaluate((element) =>
			Number(element.dataset.trackBottom),
		);

		await scroller.evaluate((element) => {
			element.scrollTop = 1;
		});
		await page.waitForTimeout(250);
		const headerAtTop = await page.screenshot({ clip: headerClip });
		const bodyAtTop = await page.screenshot({ clip: bodyClip });
		const thumbAtTop = await requireBounds(thumb, "top scrollbar thumb");
		expect(thumbAtTop.y).toBeGreaterThanOrEqual(
			headerBounds.y + headerBounds.height - 1,
		);
		expect(thumbAtTop.y + thumbAtTop.height).toBeLessThanOrEqual(
			scrollerBounds.y + trackBottom + 1,
		);

		await scroller.evaluate((element) => {
			element.scrollTop = element.scrollHeight - element.clientHeight;
		});
		await page.waitForTimeout(250);
		const headerAtBottom = await page.screenshot({ clip: headerClip });
		const bodyAtBottom = await page.screenshot({ clip: bodyClip });
		const thumbAtBottom = await requireBounds(thumb, "bottom scrollbar thumb");
		expect(headerAtBottom.equals(headerAtTop)).toBe(true);
		expect(bodyAtBottom.equals(bodyAtTop)).toBe(false);
		expect(thumbAtBottom.y).toBeGreaterThanOrEqual(
			headerBounds.y + headerBounds.height - 1,
		);
		expect(thumbAtBottom.y + thumbAtBottom.height).toBeLessThanOrEqual(
			scrollerBounds.y + trackBottom + 1,
		);

		await page.mouse.move(
			scrollerBounds.x + scrollerBounds.width / 2,
			scrollerBounds.y + scrollerBounds.height / 2,
		);
		await scroller.evaluate((element) => {
			element.scrollTop = 400;
		});
		await expect(proxy).toHaveAttribute("data-visible", "true");
		await expect(thumb).toHaveCSS("opacity", "1");
		await page.waitForTimeout(950);
		await expect(proxy).toHaveAttribute("data-visible", "false");
		await expect(thumb).toHaveCSS("opacity", "0");

		await scroller.evaluate((element) => {
			element.scrollTop = 500;
		});
		await expect(thumb).toHaveCSS("opacity", "1");
		const dragStartBounds = await requireBounds(thumb, "draggable thumb");
		const dragMetrics = await scroller.evaluate((element) => ({
			maximumScrollTop: element.scrollHeight - element.clientHeight,
			scrollTop: element.scrollTop,
		}));
		const trackHeight = trackBottom - headerBounds.height;
		const thumbTravel = trackHeight - dragStartBounds.height;
		const dragDistance = Math.min(100, thumbTravel / 3);
		const expectedScrollTop =
			dragMetrics.scrollTop +
			(dragDistance / thumbTravel) * dragMetrics.maximumScrollTop;
		await page.mouse.move(
			dragStartBounds.x + dragStartBounds.width / 2,
			dragStartBounds.y + dragStartBounds.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			dragStartBounds.x + dragStartBounds.width / 2,
			dragStartBounds.y + dragStartBounds.height / 2 + dragDistance,
		);
		await page.mouse.up();
		expect(await scroller.evaluate((element) => element.scrollTop)).toBeCloseTo(
			expectedScrollTop,
			-1,
		);
	}
});

test("horizontal scrolling keeps the ledger header and rows on one surface", async ({
	page,
}) => {
	await page.setViewportSize({ height: 800, width: 680 });
	await page.goto(INTEGRATION_ROUTE);
	const scroller = page.locator("[data-session-turn-table-scroll]");
	await expect(scroller).toBeVisible();
	const modelRow = scroller.locator('tbody tr[data-speaker="model"]').first();
	const headerCell = scroller.locator("thead th").nth(5);
	const bodyCell = modelRow.locator("td").nth(5);
	const scrollerBounds = await requireBounds(scroller, "ledger scroller");
	await page.mouse.move(
		scrollerBounds.x + scrollerBounds.width / 2,
		scrollerBounds.y + 100,
	);
	await page.mouse.wheel(190, 0);
	await waitForFrames(page, 3);
	expect(
		await scroller.evaluate((element) => element.scrollLeft),
	).toBeGreaterThan(0);
	expect(
		await headerCell.evaluate(
			(element, bodyLeft) => element.getBoundingClientRect().left - bodyLeft,
			(await requireBounds(bodyCell, "ledger body cell")).x,
		),
	).toBeCloseTo(0, 5);
});
