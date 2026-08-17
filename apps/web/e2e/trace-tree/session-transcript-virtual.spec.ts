import { expect, type Locator, type Page, test } from "@playwright/test";

const FIXTURE_ROUTE = "/dev/trace-tree-fixture";
const ROW_SELECTOR = "[data-transcript-row-id]";

test.describe.configure({ mode: "serial" });

async function waitForFrames(page: Page, count = 2) {
	await page.evaluate(async (frames) => {
		for (let index = 0; index < frames; index += 1) {
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
		}
	}, count);
}

async function openVirtualFixture(
	page: Page,
	query = "turns=18&profile=scroll",
) {
	await page.goto(
		`${FIXTURE_ROUTE}?mode=continuous&transcript=virtual&${query}`,
	);
	const scroller = page.locator("[data-trace-fixture-continuous-scroller]");
	await expect(scroller).toBeVisible({ timeout: 15_000 });
	await expect(
		scroller.locator("[data-transcript-virtual-list]"),
	).toBeVisible();
	await expect(scroller.locator(ROW_SELECTOR).first()).toBeVisible();
	await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
	await waitForFrames(page);
	return scroller;
}

async function sampleRows(scroller: Locator) {
	return scroller.evaluate((element, selector) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript fixture scroller must be an HTMLElement");
		}
		const bounds = element.getBoundingClientRect();
		return {
			clientHeight: element.clientHeight,
			rows: Array.from(element.querySelectorAll(selector))
				.map((candidate) => {
					if (!(candidate instanceof HTMLElement)) {
						throw new Error("Transcript row must be an HTMLElement");
					}
					const rect = candidate.getBoundingClientRect();
					return {
						bottom: rect.bottom - bounds.top + element.scrollTop,
						id: candidate.dataset.transcriptRowId ?? "",
						top: rect.top - bounds.top + element.scrollTop,
					};
				})
				.sort((left, right) => left.top - right.top),
			scrollHeight: element.scrollHeight,
			scrollTop: element.scrollTop,
		};
	}, ROW_SELECTOR);
}

async function scrollSweep(scroller: Locator, page: Page, steps = 24) {
	const maximum = await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript fixture scroller must be an HTMLElement");
		}
		return element.scrollHeight - element.clientHeight;
	});
	let previousTop = -1;
	for (let step = 0; step <= steps; step += 1) {
		const requested = Math.round((maximum * step) / steps);
		await scroller.evaluate((element, scrollTop) => {
			if (element instanceof HTMLElement) {
				element.scrollTop = scrollTop;
			}
		}, requested);
		await waitForFrames(page, 1);
		const sample = await sampleRows(scroller);
		expect(sample.scrollTop).toBeGreaterThanOrEqual(previousTop);
		previousTop = sample.scrollTop;
		for (let index = 1; index < sample.rows.length; index += 1) {
			const previous = sample.rows[index - 1];
			const current = sample.rows[index];
			if (previous && current) {
				expect(
					current.top,
					`${previous.id} must not overlap ${current.id}`,
				).toBeGreaterThanOrEqual(previous.bottom - 2);
			}
		}
	}
}

async function profileScrollSweep(scroller: Locator, steps = 60) {
	await scroller.evaluate(async (element, sweepSteps) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript fixture scroller must be an HTMLElement");
		}
		const maximum = element.scrollHeight - element.clientHeight;
		for (let step = 0; step <= sweepSteps; step += 1) {
			element.scrollTop = Math.round((maximum * step) / sweepSteps);
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
		}
	}, steps);
}

test("virtual transcript sweeps without gaps or overlapping measured rows", async ({
	page,
}) => {
	const scroller = await openVirtualFixture(page);
	await scrollSweep(scroller, page);
	await scroller.evaluate((element) => {
		if (element instanceof HTMLElement) {
			element.scrollTop = 0;
		}
	});
	await waitForFrames(page, 10);
	await scroller
		.locator("[data-trace-fixture-reset-profile]")
		.dispatchEvent("click");
	await profileScrollSweep(scroller);
	await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
	await expect(scroller).toHaveAttribute(
		"data-trace-fixture-long-tasks",
		/^\d+$/,
	);
	const maxUpdateDuration = Number(
		await scroller.getAttribute(
			"data-trace-fixture-profile-max-update-duration",
		),
	);
	expect(maxUpdateDuration).toBeLessThanOrEqual(8);
});

test("native keyed anchoring keeps an oversized visible row fixed on prepend", async ({
	page,
}) => {
	const scroller = await openVirtualFixture(page, "turns=12");
	await scroller.evaluate((element) => {
		if (element instanceof HTMLElement) {
			element.scrollTop = Math.round(element.scrollHeight * 0.45);
		}
	});
	await waitForFrames(page, 3);
	const anchor = await scroller.evaluate((element, selector) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript fixture scroller must be an HTMLElement");
		}
		const bounds = element.getBoundingClientRect();
		const rows = Array.from(element.querySelectorAll(selector)).filter(
			(candidate): candidate is HTMLElement => candidate instanceof HTMLElement,
		);
		const visible = rows.find((row) => {
			const rect = row.getBoundingClientRect();
			return (
				rect.top <= bounds.top + bounds.height * 0.5 && rect.bottom > bounds.top
			);
		});
		if (!visible?.dataset.transcriptRowId) {
			throw new Error("Expected a visible keyed transcript row");
		}
		return {
			id: visible.dataset.transcriptRowId,
			offset: visible.getBoundingClientRect().top - bounds.top,
			scrollTop: element.scrollTop,
		};
	}, ROW_SELECTOR);
	await scroller.locator("[data-trace-fixture-prepend]").dispatchEvent("click");
	await waitForFrames(page, 5);
	const after = await scroller.evaluate((element, anchorId) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript fixture scroller must be an HTMLElement");
		}
		const row = Array.from(
			element.querySelectorAll<HTMLElement>("[data-transcript-row-id]"),
		).find((candidate) => candidate.dataset.transcriptRowId === anchorId);
		if (!row) {
			throw new Error(`Anchor row ${anchorId} was not retained after prepend`);
		}
		return {
			offset:
				row.getBoundingClientRect().top - element.getBoundingClientRect().top,
			scrollTop: element.scrollTop,
		};
	}, anchor.id);
	expect(after.scrollTop).toBeGreaterThan(anchor.scrollTop);
	expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(2);
	await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
});

test("jump settling, level remeasurement, and viewport resize remain covered", async ({
	page,
}) => {
	const scroller = await openVirtualFixture(page, "turns=18&profile=scroll");
	await scroller
		.locator("[data-trace-fixture-jump-last]")
		.dispatchEvent("click");
	await expect
		.poll(
			async () =>
				await scroller.getAttribute("data-transcript-anchor-settle-ms"),
		)
		.toMatch(/^\d+$/);
	await expect(scroller).toHaveAttribute(
		"data-trace-fixture-active-turn",
		"18",
	);
	await scroller
		.locator("[data-trace-fixture-toggle-level]")
		.dispatchEvent("click");
	await waitForFrames(page, 5);
	await page.setViewportSize({ height: 640, width: 900 });
	await waitForFrames(page, 5);
	await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
});

test("pending rows and incremental body replacement never expose a blank frame", async ({
	page,
}) => {
	const scroller = await openVirtualFixture(
		page,
		"hydrate=manual&turns=18&profile=scroll",
	);
	await scrollSweep(scroller, page, 12);
	await scroller.locator("[data-trace-fixture-hydrate]").dispatchEvent("click");
	await scrollSweep(scroller, page, 20);
	await expect(scroller).toHaveAttribute(
		"data-trace-fixture-hydrated-turns",
		"18",
		{ timeout: 10_000 },
	);
	await scrollSweep(scroller, page, 12);
	await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
});

for (const mode of [
	"default",
	"direct-position",
	"direct-transform",
] as const) {
	test(`profiles ${mode} positioning with sticky trace rows`, async ({
		page,
	}) => {
		const scroller = await openVirtualFixture(
			page,
			`turns=18&profile=scroll&virtualMode=${mode}`,
		);
		await scroller
			.locator("[data-trace-fixture-reset-profile]")
			.dispatchEvent("click");
		await scrollSweep(scroller, page, mode === "default" ? 3 : 12);
		await expect(
			scroller.locator("[data-trace-tree-row-owner]").first(),
		).toBeVisible();
		await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
	});
}
