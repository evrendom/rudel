import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page, test } from "@playwright/test";

const FIXTURE_ROUTE = "/dev/trace-tree-fixture";
const ROW_HEIGHT = 40;
const POSITION_TOLERANCE = 0.5;
const SCROLL_STEP = 80;
const ROW_SELECTOR = "[data-trace-tree-row-owner]";
const STICKY_ROW_SELECTOR = "[data-trace-tree-sticky-top]";
const SCREENSHOT_STYLE_PATH = fileURLToPath(
	new URL("./trace-tree-boundary-screenshot.css", import.meta.url),
);

type RowPosition = {
	bottom: number;
	key: string;
	top: number;
};

type ScrollSample = {
	rows: readonly RowPosition[];
	scrollTop: number;
};

type HitRow = {
	depth: number;
	turn: number;
};

async function waitForStableLayout(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
	});
}

async function openFixture(page: Page) {
	await page.goto(FIXTURE_ROUTE);
	const scroller = page.locator("[data-trace-fixture-scroller]");
	await expect(scroller).toBeVisible();
	await expect(page.locator(ROW_SELECTOR).first()).toBeVisible();
	await waitForStableLayout(page);
	return scroller;
}

async function openContinuousFixture(
	page: Page,
	display: "normal" | "request" = "request",
) {
	await page.goto(`${FIXTURE_ROUTE}?mode=continuous&display=${display}`);
	const scroller = page.locator("[data-trace-fixture-continuous-scroller]");
	await expect(scroller).toBeVisible();
	await expect(scroller).toHaveAttribute("data-trace-fixture-active-turn", "1");
	await expect(page.locator(ROW_SELECTOR).first()).toBeVisible();
	await expect(
		scroller.locator("[data-session-turn-metadata-tags]"),
	).toHaveCount(0);
	await expect(
		scroller.locator('[title$="in this member message"]'),
	).toHaveCount(0);
	const modelTriggers = scroller
		.locator("[data-trace-model-label]")
		.locator("xpath=ancestor::button[1]");
	for (const trigger of await modelTriggers.all()) {
		await trigger.evaluate((button) => {
			if (!(button instanceof HTMLButtonElement)) {
				throw new Error("Fixture model trigger must be a button");
			}
			if (button.getAttribute("aria-expanded") === "false") {
				button.click();
			}
		});
	}
	const requestTriggers = scroller
		.locator("[data-trace-request-label]")
		.locator("xpath=ancestor::button[1]");
	for (const trigger of await requestTriggers.all()) {
		await trigger.evaluate((button) => {
			if (!(button instanceof HTMLButtonElement)) {
				throw new Error("Fixture request trigger must be a button");
			}
			if (button.getAttribute("aria-expanded") === "false") {
				button.click();
			}
		});
	}
	await waitForStableLayout(page);
	return scroller;
}

async function setScrollTop(
	scroller: Locator,
	page: Page,
	requestedTop: number,
) {
	const scrollTop = await scroller.evaluate((element, nextTop) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Trace fixture scroller must be an HTMLElement");
		}
		element.scrollTop = nextTop;
		return element.scrollTop;
	}, requestedTop);
	await waitForStableLayout(page);
	return scrollTop;
}

async function getScrollPositions(scroller: Locator) {
	const maximumScrollTop = await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Trace fixture scroller must be an HTMLElement");
		}
		return element.scrollHeight - element.clientHeight;
	});
	const regularPositions = Array.from(
		{ length: Math.floor(maximumScrollTop / SCROLL_STEP) + 1 },
		(_, index) => index * SCROLL_STEP,
	);
	return Array.from(new Set([...regularPositions, maximumScrollTop])).sort(
		(left, right) => left - right,
	);
}

async function readRowPositions(scroller: Locator): Promise<RowPosition[]> {
	return scroller.evaluate((element, rowSelector) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Trace fixture scroller must be an HTMLElement");
		}
		const scrollerBounds = element.getBoundingClientRect();
		return Array.from(element.querySelectorAll(rowSelector)).map((row) => {
			if (!(row instanceof HTMLElement)) {
				throw new Error("Trace fixture row must be an HTMLElement");
			}
			const turn = row.closest("[data-trace-fixture-turn]");
			const item = row.closest("[data-trace-tree-item-depth]");
			if (!(turn instanceof HTMLElement) || !(item instanceof HTMLElement)) {
				throw new Error("Trace fixture row must belong to a keyed tree item");
			}
			const turnId = turn.getAttribute("data-trace-fixture-turn");
			const depth = item.getAttribute("data-trace-tree-item-depth");
			if (turnId === null || depth === null) {
				throw new Error("Trace fixture row identity is incomplete");
			}
			const ordinal = Array.from(turn.querySelectorAll(rowSelector)).indexOf(
				row,
			);
			const bounds = row.getBoundingClientRect();
			return {
				bottom: bounds.bottom - scrollerBounds.top,
				key: `turn-${turnId}-row-${ordinal}-depth-${depth}`,
				top: bounds.top - scrollerBounds.top,
			};
		});
	}, ROW_SELECTOR);
}

async function sweep(
	scroller: Locator,
	page: Page,
	positions: readonly number[],
): Promise<ScrollSample[]> {
	const samples: ScrollSample[] = [];
	for (const position of positions) {
		const scrollTop = await setScrollTop(scroller, page, position);
		samples.push({ rows: await readRowPositions(scroller), scrollTop });
	}
	return samples;
}

function findPathDifferences(
	downSamples: readonly ScrollSample[],
	upSamples: readonly ScrollSample[],
) {
	const downByScrollTop = new Map(
		downSamples.map((sample) => [sample.scrollTop, sample]),
	);
	const differences: string[] = [];

	for (const upSample of upSamples) {
		const downSample = downByScrollTop.get(upSample.scrollTop);
		if (downSample === undefined) {
			differences.push(`missing downward sample at ${upSample.scrollTop}`);
		} else {
			const downByKey = new Map(
				downSample.rows.map((position) => [position.key, position]),
			);
			for (const upPosition of upSample.rows) {
				const downPosition = downByKey.get(upPosition.key);
				if (downPosition === undefined) {
					differences.push(
						`${upPosition.key} missing at scrollTop ${upSample.scrollTop}`,
					);
				} else {
					const topDelta = Math.abs(upPosition.top - downPosition.top);
					const bottomDelta = Math.abs(upPosition.bottom - downPosition.bottom);
					if (
						topDelta > POSITION_TOLERANCE ||
						bottomDelta > POSITION_TOLERANCE
					) {
						differences.push(
							`${upPosition.key} at ${upSample.scrollTop}: top Δ${topDelta.toFixed(2)}, bottom Δ${bottomDelta.toFixed(2)}`,
						);
					}
				}
			}
		}
	}

	return differences;
}

function findMonotonicityViolations(
	samples: readonly ScrollSample[],
	direction: "down" | "up",
) {
	const violations: string[] = [];
	for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
		const previous = samples[sampleIndex - 1];
		const current = samples[sampleIndex];
		if (previous === undefined || current === undefined) {
			throw new Error("Monotonic sweep sample is missing");
		}
		const previousByKey = new Map(
			previous.rows.map((position) => [position.key, position]),
		);
		for (const currentPosition of current.rows) {
			const previousPosition = previousByKey.get(currentPosition.key);
			if (previousPosition === undefined) {
				violations.push(
					`${currentPosition.key} disappeared during ${direction} sweep`,
				);
			} else {
				const movedAgainstDownwardScroll =
					direction === "down" &&
					currentPosition.top > previousPosition.top + POSITION_TOLERANCE;
				const movedAgainstUpwardScroll =
					direction === "up" &&
					currentPosition.top < previousPosition.top - POSITION_TOLERANCE;
				if (movedAgainstDownwardScroll || movedAgainstUpwardScroll) {
					violations.push(
						`${currentPosition.key} moved ${previousPosition.top.toFixed(2)} → ${currentPosition.top.toFixed(2)} while scrolling ${direction}`,
					);
				}
			}
		}
	}
	return violations;
}

async function getSecondTurnRootNaturalTop(page: Page) {
	const secondTurnRoot = page
		.locator('[data-trace-fixture-turn="2"]')
		.locator(
			'[data-trace-tree-item-depth="1"] > [data-trace-tree-row-owner][data-trace-tree-sticky-top="0"]',
		)
		.first();
	return secondTurnRoot.evaluate((row) => {
		if (!(row instanceof HTMLElement)) {
			throw new Error("Second turn root must be an HTMLElement");
		}
		const scroller = row.closest("[data-trace-fixture-scroller]");
		const item = row.parentElement;
		if (!(scroller instanceof HTMLElement) || !(item instanceof HTMLElement)) {
			throw new Error("Second turn root must belong to the fixture scroller");
		}
		return (
			item.getBoundingClientRect().top -
			scroller.getBoundingClientRect().top +
			scroller.scrollTop
		);
	});
}

async function readCoincidentStickyDepths(page: Page, turn: number) {
	return page
		.locator(`[data-trace-fixture-turn="${turn}"] ${STICKY_ROW_SELECTOR}`)
		.evaluateAll((rows, tolerance) => {
			const scroller = document.querySelector("[data-trace-fixture-scroller]");
			if (!(scroller instanceof HTMLElement)) {
				throw new Error("Trace fixture scroller must be an HTMLElement");
			}
			const scrollerTop = scroller.getBoundingClientRect().top;
			return rows
				.flatMap((row) => {
					if (!(row instanceof HTMLElement)) {
						throw new Error("Sticky trace row must be an HTMLElement");
					}
					const top = row.getBoundingClientRect().top - scrollerTop;
					const item = row.closest("[data-trace-tree-item-depth]");
					if (!(item instanceof HTMLElement)) {
						throw new Error("Sticky trace row must belong to a tree item");
					}
					const depth = Number(item.getAttribute("data-trace-tree-item-depth"));
					return Math.abs(top) <= tolerance ? [depth] : [];
				})
				.sort((left, right) => left - right);
		}, POSITION_TOLERANCE);
}

async function hitTestFirstSlot(scroller: Locator): Promise<HitRow | null> {
	return scroller.evaluate((element, rowSelector) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Trace fixture scroller must be an HTMLElement");
		}
		const bounds = element.getBoundingClientRect();
		const hit = document.elementFromPoint(bounds.left + 320, bounds.top + 20);
		const row = hit?.closest(rowSelector);
		const turn = row?.closest("[data-trace-fixture-turn]");
		const item = row?.closest("[data-trace-tree-item-depth]");
		if (!(turn instanceof HTMLElement) || !(item instanceof HTMLElement)) {
			return null;
		}
		return {
			depth: Number(item.getAttribute("data-trace-tree-item-depth")),
			turn: Number(turn.getAttribute("data-trace-fixture-turn")),
		};
	}, ROW_SELECTOR);
}

async function readPinnedRows(scroller: Locator): Promise<RowPosition[]> {
	return scroller.evaluate(
		(element, input) => {
			if (!(element instanceof HTMLElement)) {
				throw new Error("Trace fixture scroller must be an HTMLElement");
			}
			const scrollerBounds = element.getBoundingClientRect();
			return Array.from(element.querySelectorAll(input.stickySelector)).flatMap(
				(row) => {
					if (!(row instanceof HTMLElement)) {
						throw new Error("Sticky trace row must be an HTMLElement");
					}
					const declaredTop = Number(
						row.getAttribute("data-trace-tree-sticky-top"),
					);
					const bounds = row.getBoundingClientRect();
					const relativeTop = bounds.top - scrollerBounds.top;
					const turn = row.closest("[data-trace-fixture-turn]");
					const continuousTurn = row.closest("[data-continuous-turn-index]");
					const item = row.closest("[data-trace-tree-item-depth]");
					if (!(item instanceof HTMLElement)) {
						throw new Error("Sticky trace row identity is incomplete");
					}
					const turnId =
						turn instanceof HTMLElement
							? turn.getAttribute("data-trace-fixture-turn")
							: continuousTurn instanceof HTMLElement
								? String(
										Number(
											continuousTurn.getAttribute("data-continuous-turn-index"),
										) + 1,
									)
								: null;
					if (turnId === null) {
						throw new Error("Sticky trace row must belong to a fixture turn");
					}
					const turnScope = turn instanceof HTMLElement ? turn : continuousTurn;
					if (!(turnScope instanceof HTMLElement)) {
						throw new Error("Sticky trace row turn scope is incomplete");
					}
					const ordinal = Array.from(
						turnScope.querySelectorAll(input.rowSelector),
					).indexOf(row);
					const pinned =
						Math.abs(relativeTop - declaredTop) <= input.tolerance &&
						bounds.bottom > scrollerBounds.top &&
						bounds.top < scrollerBounds.bottom;
					return pinned
						? [
								{
									bottom: bounds.bottom - scrollerBounds.top,
									key: `turn-${turnId}-row-${ordinal}-depth-${item.getAttribute("data-trace-tree-item-depth")}`,
									top: relativeTop,
								},
							]
						: [];
				},
			);
		},
		{
			rowSelector: ROW_SELECTOR,
			stickySelector: STICKY_ROW_SELECTOR,
			tolerance: POSITION_TOLERANCE,
		},
	);
}

test("streamed turn bodies remain in non-overlapping document flow", async ({
	page,
}) => {
	await page.goto(
		`${FIXTURE_ROUTE}?mode=continuous&display=request&hydrate=manual&turns=6`,
	);
	const scroller = page.locator("[data-trace-fixture-continuous-scroller]");
	await expect(scroller).toBeVisible();
	await expect(scroller).toHaveAttribute(
		"data-trace-fixture-hydrated-turns",
		"0",
	);
	await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Hydration fixture scroller must be an HTMLElement");
		}
		element.scrollTop = element.scrollHeight * 0.55;
	});
	await waitForStableLayout(page);

	await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Hydration fixture scroller must be an HTMLElement");
		}
		const trigger = element.querySelector("[data-trace-fixture-hydrate]");
		if (!(trigger instanceof HTMLButtonElement)) {
			throw new Error("Hydration fixture trigger must be a button");
		}
		trigger.click();
	});
	await expect(scroller).toHaveAttribute(
		"data-trace-fixture-hydrated-turns",
		"6",
		{ timeout: 45_000 },
	);
	await waitForStableLayout(page);
	const rows = scroller.locator("[data-continuous-turn-index]");
	await expect(rows).toHaveCount(6);
	const rowDetails = await rows.evaluateAll((elements) =>
		elements.map((element, index) => ({
			bottom: element.getBoundingClientRect().bottom,
			containIntrinsicSize:
				element instanceof HTMLElement
					? element.style.containIntrinsicSize
					: "",
			contentVisibility:
				element instanceof HTMLElement ? element.style.contentVisibility : "",
			index,
			position: element instanceof HTMLElement ? element.style.position : "",
			text: element.textContent?.trim() ?? "",
			top: element.getBoundingClientRect().top,
			transform: element instanceof HTMLElement ? element.style.transform : "",
		})),
	);
	const overlaps = rowDetails.flatMap((row, index) => {
		const next = rowDetails[index + 1];
		return next && row.bottom > next.top + POSITION_TOLERANCE
			? [`turn ${row.index + 1} overlaps turn ${next.index + 1}`]
			: [];
	});
	expect(overlaps).toEqual([]);
	expect(rowDetails.every((row) => row.contentVisibility === "auto")).toBe(
		true,
	);
	expect(rowDetails.every((row) => row.containIntrinsicSize !== "none")).toBe(
		true,
	);
	expect(rowDetails.every((row) => row.position === "")).toBe(true);
	expect(rowDetails.every((row) => row.transform === "")).toBe(true);
	expect(rowDetails.every((row) => row.text.length > 0)).toBe(true);
});

test("sticky geometry is path-independent after down and up sweeps", async ({
	page,
}) => {
	const scroller = await openFixture(page);
	const positions = await getScrollPositions(scroller);
	const downSamples = await sweep(scroller, page, positions);
	const upSamples = await sweep(scroller, page, [...positions].reverse());

	expect(findPathDifferences(downSamples, upSamples)).toEqual([]);
});

test("every row moves monotonically in both scroll directions", async ({
	page,
}) => {
	const scroller = await openFixture(page);
	const positions = await getScrollPositions(scroller);
	const downSamples = await sweep(scroller, page, positions);
	const upSamples = await sweep(scroller, page, [...positions].reverse());

	expect(findMonotonicityViolations(downSamples, "down")).toEqual([]);
	expect(findMonotonicityViolations(upSamples, "up")).toEqual([]);
});

test("the terminal stack paints the depth-1 survivor before the next root takes over", async ({
	page,
}) => {
	const scroller = await openFixture(page);
	const secondTurnRootNaturalTop = await getSecondTurnRootNaturalTop(page);
	const collapseScrollTop = secondTurnRootNaturalTop - ROW_HEIGHT;

	await setScrollTop(scroller, page, collapseScrollTop);
	expect(await readCoincidentStickyDepths(page, 1)).toEqual([1, 2, 3]);
	expect(await hitTestFirstSlot(scroller)).toEqual({ depth: 1, turn: 1 });

	const scrollerBounds = await scroller.boundingBox();
	if (scrollerBounds === null) {
		throw new Error("Trace fixture scroller must have a screenshot boundary");
	}
	await expect(page).toHaveScreenshot("terminal-survivor.webp", {
		animations: "disabled",
		caret: "hide",
		clip: {
			height: 120,
			width: Math.min(scrollerBounds.width, 520),
			x: scrollerBounds.x,
			y: scrollerBounds.y,
		},
		scale: "css",
		stylePath: SCREENSHOT_STYLE_PATH,
	});

	await setScrollTop(scroller, page, secondTurnRootNaturalTop + 1);
	expect(await hitTestFirstSlot(scroller)).toEqual({ depth: 1, turn: 2 });
});

for (const display of ["request", "normal"] as const) {
	test(`the code pane captures wheel only while focused and otherwise follows normal page flow (${display} display)`, async ({
		page,
	}) => {
		const scroller = await openContinuousFixture(page, display);
		const readButton = page
			.locator('[data-continuous-turn-index="0"]')
			.getByRole("button", { name: /Read/ })
			.first();
		await readButton.evaluate((button) => {
			if (!(button instanceof HTMLButtonElement)) {
				throw new Error("Fixture read trigger must be a button");
			}
			button.click();
		});

		const block = page.locator("[data-trace-code-block]").first();
		const content = block.locator("[data-trace-code-block-content]");
		await expect(block).toBeVisible();
		await expect(page.locator("[data-trace-code-scroll-range]")).toHaveCount(0);
		await waitForStableLayout(page);

		const metrics = await block.evaluate((element) => {
			const container = element.closest(
				"[data-trace-fixture-continuous-scroller]",
			);
			const codeContent = element.querySelector(
				"[data-trace-code-block-content]",
			);
			const item = element.closest("[data-trace-tree-item-depth]");
			const row = item?.querySelector(":scope > [data-trace-tree-row-owner]");
			if (
				!(container instanceof HTMLElement) ||
				!(codeContent instanceof HTMLElement) ||
				!(item instanceof HTMLElement) ||
				!(row instanceof HTMLElement)
			) {
				throw new Error("Code flow probe is missing geometry nodes");
			}
			const containerBounds = container.getBoundingClientRect();
			const cardBounds = element.getBoundingClientRect();
			const itemBounds = item.getBoundingClientRect();
			const rowBounds = row.getBoundingClientRect();
			return {
				cardHeight: cardBounds.height,
				cardNaturalTop:
					cardBounds.top - containerBounds.top + container.scrollTop,
				itemNaturalBottom:
					itemBounds.bottom - containerBounds.top + container.scrollTop,
				rowHeight: rowBounds.height,
				rowPosition: getComputedStyle(row).position,
				rowTop: Number.parseFloat(getComputedStyle(row).top) || 0,
				textScrollRange: codeContent.scrollHeight - codeContent.clientHeight,
			};
		});
		expect(metrics.textScrollRange).toBeGreaterThan(0);
		expect(metrics.rowPosition).toBe("sticky");

		const cardVisibleScrollTop = Math.max(metrics.cardNaturalTop - 120, 0);
		await setScrollTop(scroller, page, cardVisibleScrollTop);
		await content.hover();
		await content.evaluate((element) => {
			if (!(element instanceof HTMLElement)) {
				throw new Error("Code content must be an HTMLElement");
			}
			element.blur();
			element.scrollTop = 0;
		});
		const pageBeforeDefaultWheel = await scroller.evaluate((element) => {
			if (!(element instanceof HTMLElement)) {
				throw new Error("Trace fixture scroller must be an HTMLElement");
			}
			return element.scrollTop;
		});
		await page.mouse.wheel(0, 160);
		await expect
			.poll(() =>
				scroller.evaluate((element) => {
					if (!(element instanceof HTMLElement)) {
						throw new Error("Trace fixture scroller must be an HTMLElement");
					}
					return element.scrollTop;
				}),
			)
			.toBeGreaterThan(pageBeforeDefaultWheel);
		expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
		const normalFlow = await block.evaluate((element) => {
			const container = element.closest(
				"[data-trace-fixture-continuous-scroller]",
			);
			if (!(container instanceof HTMLElement)) {
				throw new Error("Normal-flow probe is missing its scroller");
			}
			const containerTop = container.getBoundingClientRect().top;
			return {
				cardTop: element.getBoundingClientRect().top - containerTop,
				scrollTop: container.scrollTop,
			};
		});
		expect(
			Math.abs(
				normalFlow.cardTop - (metrics.cardNaturalTop - normalFlow.scrollTop),
			),
		).toBeLessThanOrEqual(POSITION_TOLERANCE);

		await setScrollTop(scroller, page, cardVisibleScrollTop);
		await content.click({ position: { x: 40, y: 80 } });
		await expect(content).toBeFocused();
		const pageBeforeFocusedWheel = await scroller.evaluate((element) => {
			if (!(element instanceof HTMLElement)) {
				throw new Error("Trace fixture scroller must be an HTMLElement");
			}
			return element.scrollTop;
		});
		await page.mouse.wheel(0, 160);
		await expect
			.poll(() => content.evaluate((element) => element.scrollTop))
			.toBeGreaterThan(0);
		const focusedCodeScrollTop = await content.evaluate(
			(element) => element.scrollTop,
		);
		const pageAfterFocusedWheel = await scroller.evaluate((element) => {
			if (!(element instanceof HTMLElement)) {
				throw new Error("Trace fixture scroller must be an HTMLElement");
			}
			return element.scrollTop;
		});
		expect(
			Math.abs(pageAfterFocusedWheel - pageBeforeFocusedWheel),
		).toBeLessThanOrEqual(POSITION_TOLERANCE);

		await content.evaluate((element) => {
			if (!(element instanceof HTMLElement)) {
				throw new Error("Code content must be an HTMLElement");
			}
			element.blur();
		});
		await expect(content).not.toBeFocused();
		await setScrollTop(
			scroller,
			page,
			metrics.itemNaturalBottom + metrics.rowTop + metrics.rowHeight + 8,
		);
		const passed = await block.evaluate((element) => {
			const container = element.closest(
				"[data-trace-fixture-continuous-scroller]",
			);
			const codeContent = element.querySelector(
				"[data-trace-code-block-content]",
			);
			const item = element.closest("[data-trace-tree-item-depth]");
			const row = item?.querySelector(":scope > [data-trace-tree-row-owner]");
			if (
				!(container instanceof HTMLElement) ||
				!(codeContent instanceof HTMLElement) ||
				!(item instanceof HTMLElement) ||
				!(row instanceof HTMLElement)
			) {
				throw new Error("Passed-node probe is missing geometry nodes");
			}
			const containerTop = container.getBoundingClientRect().top;
			return {
				cardBottom: element.getBoundingClientRect().bottom - containerTop,
				cardHeight: element.getBoundingClientRect().height,
				codeScrollTop: codeContent.scrollTop,
				itemBottom: item.getBoundingClientRect().bottom - containerTop,
				rowBottom: row.getBoundingClientRect().bottom - containerTop,
			};
		});
		expect(passed.cardHeight).toBe(metrics.cardHeight);
		expect(passed.codeScrollTop).toBe(focusedCodeScrollTop);
		expect(passed.cardBottom).toBeLessThan(0);
		expect(passed.itemBottom).toBeLessThan(0);
		expect(passed.rowBottom).toBeLessThan(0);
	});
}

test("expansion leaves scroll and active turn unchanged until a real scroll", async ({
	page,
}) => {
	const scroller = await openContinuousFixture(page);
	await setScrollTop(scroller, page, 0);
	const pinnedBefore = await readPinnedRows(scroller);
	const scrollTopBefore = await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Trace fixture scroller must be an HTMLElement");
		}
		return element.scrollTop;
	});
	const reasoningButton = page
		.locator('[data-continuous-turn-index="1"] [data-trace-call-index="2"]')
		.getByRole("button", { name: /Reasoning/ })
		.first();
	await expect(reasoningButton).toHaveAttribute("aria-expanded", "false");
	const buttonBounds = await reasoningButton.boundingBox();
	const scrollerBounds = await scroller.boundingBox();
	if (buttonBounds === null || scrollerBounds === null) {
		throw new Error("Expansion target and scroller must have layout bounds");
	}
	expect(buttonBounds.y).toBeGreaterThanOrEqual(
		scrollerBounds.y + scrollerBounds.height,
	);

	await reasoningButton.evaluate((button) => {
		if (!(button instanceof HTMLButtonElement)) {
			throw new Error("Fixture reasoning trigger must be a button");
		}
		button.click();
	});
	await expect(reasoningButton).toHaveAttribute("aria-expanded", "true");
	await waitForStableLayout(page);

	const scrollTopAfter = await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Trace fixture scroller must be an HTMLElement");
		}
		return element.scrollTop;
	});
	expect(scrollTopAfter).toBe(scrollTopBefore);
	expect(await readPinnedRows(scroller)).toEqual(pinnedBefore);
	await expect(scroller).toHaveAttribute("data-trace-fixture-active-turn", "1");

	const secondTurnNaturalTop = await page
		.locator('[data-continuous-turn-index="1"]')
		.evaluate((turn) => {
			if (!(turn instanceof HTMLElement)) {
				throw new Error(
					"Second continuous fixture turn must be an HTMLElement",
				);
			}
			const scrollContainer = turn.closest(
				"[data-trace-fixture-continuous-scroller]",
			);
			if (!(scrollContainer instanceof HTMLElement)) {
				throw new Error("Continuous fixture turn must belong to its scroller");
			}
			return (
				turn.getBoundingClientRect().top -
				scrollContainer.getBoundingClientRect().top +
				scrollContainer.scrollTop
			);
		});
	await setScrollTop(scroller, page, secondTurnNaturalTop + 1);
	await expect(scroller).toHaveAttribute("data-trace-fixture-active-turn", "2");
});
