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
	await expect(scroller).toHaveAttribute(
		"data-transcript-true-blank-frames",
		"0",
	);
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

async function getTurnSectionRange(scroller: Locator, turnId: string) {
	return scroller.evaluate((element, targetTurnId) => {
		const bounds = element.getBoundingClientRect();
		const rows = Array.from(
			element.querySelectorAll<HTMLElement>(
				`[data-transcript-turn-id="${targetTurnId}"][data-transcript-row-kind="section"]`,
			),
		).map((row) => {
			const rect = row.getBoundingClientRect();
			return {
				end: rect.bottom - bounds.top + element.scrollTop,
				id: row.dataset.transcriptRowId ?? "",
				start: rect.top - bounds.top + element.scrollTop,
			};
		});
		if (rows.length === 0) {
			throw new Error(`No measured section rows found for ${targetTurnId}`);
		}
		return {
			end: Math.max(...rows.map((row) => row.end)),
			rowIds: rows.map((row) => row.id),
			start: Math.min(...rows.map((row) => row.start)),
		};
	}, turnId);
}

async function getTurnRowRange(
	scroller: Locator,
	turnId: string,
	kind: string,
) {
	return scroller.evaluate(
		(element, input) => {
			const bounds = element.getBoundingClientRect();
			const row = element.querySelector<HTMLElement>(
				`[data-transcript-turn-id="${input.turnId}"][data-transcript-row-kind="${input.kind}"]`,
			);
			if (!row) {
				throw new Error(`No ${input.kind} row found for ${input.turnId}`);
			}
			const rect = row.getBoundingClientRect();
			return {
				end: rect.bottom - bounds.top + element.scrollTop,
				start: rect.top - bounds.top + element.scrollTop,
			};
		},
		{ kind, turnId },
	);
}

async function sampleStickyHeaderAtTop(scroller: Locator) {
	return scroller.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const overlay = element.querySelector<HTMLElement>(
			"[data-transcript-sticky-header-overlay]",
		);
		if (!overlay) {
			throw new Error("Expected the measured transcript-header overlay");
		}
		const rect = overlay.getBoundingClientRect();
		return {
			atTop: rect.top <= bounds.top + 1 && rect.bottom > bounds.top,
			bottom: rect.bottom - bounds.top,
			height: rect.height,
			label:
				overlay
					.querySelector("[data-trace-model-label]")
					?.textContent?.trim() ?? "",
			kind: overlay.dataset.transcriptStickyHeaderKind,
			owner: overlay.dataset.transcriptStickyHeaderOwner,
			top: rect.top - bounds.top,
			translateY: new DOMMatrix(getComputedStyle(overlay).transform).m42,
			visible: getComputedStyle(overlay).visibility === "visible",
			userLabel:
				overlay.querySelector("[data-trace-user-label]")?.textContent?.trim() ??
				"",
			width: rect.width,
		};
	});
}

type SplitSectionEventGeometry = {
	continues: boolean;
	depth: number;
	descends: boolean;
	id: string;
};

async function captureSplitSectionGeometry(input: {
	display: "normal" | "request";
	page: Page;
	scroller: Locator;
}) {
	const geometryByEventId = new Map<string, SplitSectionEventGeometry>();
	const continuationRowIds = new Set<string>();
	let continuationScreenshot: Buffer | undefined;
	const maximum = await input.scroller.evaluate(
		(element) => element.scrollHeight - element.clientHeight,
	);
	for (let step = 0; step <= 28; step += 1) {
		await input.scroller.evaluate(
			(element, scrollTop) => {
				element.scrollTop = scrollTop;
			},
			Math.round((maximum * step) / 28),
		);
		await waitForFrames(input.page, 1);
		const samples = await input.scroller.evaluate(() =>
			Array.from(
				document.querySelectorAll<HTMLElement>(
					'[data-transcript-turn-id="fixture-turn-1"][data-transcript-row-kind="section"]',
				),
			).map((sectionRow) => ({
				events: Array.from(
					sectionRow.querySelectorAll<HTMLElement>("[data-trace-expansion-id]"),
				).map((eventRow) => {
					const treeItem = eventRow.closest<HTMLElement>(
						"[data-trace-tree-item-depth]",
					);
					if (!treeItem) {
						throw new Error("Expected every trace event to own tree geometry");
					}
					const expansionId = eventRow.dataset.traceExpansionId ?? "";
					return {
						continues: treeItem.dataset.traceTreeContinues === "true",
						depth: Number(treeItem.dataset.traceTreeItemDepth),
						descends: treeItem.dataset.traceTreeDescends === "true",
						id: expansionId.slice(expansionId.lastIndexOf("::") + 2),
					};
				}),
				hasIncomingModelRail:
					sectionRow.querySelector('[data-trace-tree-line-depth="1"]') !== null,
				id: sectionRow.dataset.transcriptRowId ?? "",
			})),
		);
		for (const sample of samples) {
			if (/s\d+b\d+$/u.test(sample.id)) {
				continuationRowIds.add(sample.id);
				expect(
					sample.hasIncomingModelRail,
					`${sample.id} must retain the incoming model rail`,
				).toBe(true);
				continuationScreenshot ??= await input.scroller.screenshot();
			}
			for (const geometry of sample.events) {
				geometryByEventId.set(geometry.id, geometry);
			}
		}
	}

	expect(continuationRowIds.size).toBeGreaterThan(0);
	expect(continuationScreenshot).toBeDefined();
	for (const request of [1, 2]) {
		const reasoning = geometryByEventId.get(`fx-t1-r${request}-reasoning`);
		const message = geometryByEventId.get(`fx-t1-r${request}-message`);
		expect(reasoning, `${input.display} reasoning geometry`).toBeDefined();
		expect(message, `${input.display} message geometry`).toBeDefined();
		for (let tool = 1; tool <= 12; tool += 1) {
			const toolGeometry = geometryByEventId.get(
				`fx-t1-r${request}-tool-${tool}`,
			);
			expect(
				toolGeometry,
				`${input.display} tool ${tool} geometry`,
			).toBeDefined();
			expect(toolGeometry?.depth).toBe((message?.depth ?? 0) + 1);
		}
	}
	return continuationScreenshot;
}

test("budget-split agent sections preserve nesting and rail continuity in both levels", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ height: 1_200, width: 1_200 });
	for (const display of ["request", "normal"] as const) {
		const scroller = await openVirtualFixture(
			page,
			`turns=1&display=${display}`,
		);
		const screenshot = await captureSplitSectionGeometry({
			display,
			page,
			scroller,
		});
		if (!screenshot) {
			throw new Error(`Expected a ${display} continuation screenshot`);
		}
		await testInfo.attach(`budget-split-${display}.png`, {
			body: screenshot,
			contentType: "image/png",
		});
	}
});

test("the model-header overlay continuously covers every offset in a split section and tracks pane width", async ({
	page,
}) => {
	await page.setViewportSize({ height: 1_200, width: 1_200 });
	const scroller = await openVirtualFixture(page, "turns=2&modelHeader=split");
	const memberHeader = await sampleStickyHeaderAtTop(scroller);
	expect(memberHeader.visible).toBe(true);
	expect(memberHeader.atTop).toBe(true);
	expect(memberHeader.kind).toBe("member");
	expect(memberHeader.owner).toBe("fixture-turn-1");
	expect(memberHeader.userLabel).toBe("Evren");
	const firstRange = await getTurnSectionRange(scroller, "fixture-turn-1");
	expect(
		firstRange.rowIds.filter((id) => /b\d+$/u.test(id)).length,
	).toBeGreaterThanOrEqual(2);
	const overlay = scroller.locator("[data-transcript-sticky-header-overlay]");
	const measuredHeights = await overlay.evaluate((element) =>
		Object.fromEntries(
			Array.from(
				element.querySelectorAll<HTMLElement>(
					"[data-transcript-sticky-header-measure]",
				),
			).map((measurement) => [
				measurement.dataset.transcriptStickyHeaderMeasure,
				measurement.getBoundingClientRect().height,
			]),
		),
	);
	expect(measuredHeights).toMatchObject({ member: 56, model: 40 });
	for (
		let scrollTop = firstRange.start;
		scrollTop < firstRange.end;
		scrollTop = Math.min(firstRange.end, scrollTop + 20)
	) {
		await scroller.evaluate((element, nextScrollTop) => {
			element.scrollTop = nextScrollTop;
		}, scrollTop);
		await waitForFrames(page, 1);
		const sample = await sampleStickyHeaderAtTop(scroller);
		expect(sample.visible, `visibility at scrollTop ${scrollTop}`).toBe(true);
		expect(sample.atTop, `coverage at scrollTop ${scrollTop}`).toBe(true);
		expect(sample.owner).toBe("fixture-turn-1");
		expect(sample.label).toBe("Claude Fable 5");
		if (scrollTop + 20 >= firstRange.end) {
			break;
		}
	}

	await scroller.evaluate((element, scrollTop) => {
		element.scrollTop = scrollTop;
	}, firstRange.start + 200);
	await waitForFrames(page, 2);
	const widthBefore = (await sampleStickyHeaderAtTop(scroller)).width;
	const rowWidthBefore = await scroller
		.locator("[data-transcript-row-id]")
		.first()
		.evaluate((element) => element.getBoundingClientRect().width);
	expect(Math.abs(widthBefore - rowWidthBefore)).toBeLessThanOrEqual(1);
	await page.setViewportSize({ height: 1_200, width: 760 });
	await waitForFrames(page, 3);
	const widthAfter = (await sampleStickyHeaderAtTop(scroller)).width;
	const rowWidthAfter = await scroller
		.locator("[data-transcript-row-id]")
		.first()
		.evaluate((element) => element.getBoundingClientRect().width);
	expect(widthAfter).toBeLessThan(widthBefore);
	expect(Math.abs(widthAfter - rowWidthAfter)).toBeLessThanOrEqual(1);
	await expect(overlay).toBeVisible();
});

test("the permanent overlay is pixel-stable as the real header slides underneath", async ({
	page,
}) => {
	await page.setViewportSize({ height: 1_200, width: 1_200 });
	const scroller = await openVirtualFixture(page, "turns=2&modelHeader=split");
	const firstRange = await getTurnSectionRange(scroller, "fixture-turn-1");
	const overlay = scroller.locator("[data-transcript-sticky-header-overlay]");
	await scroller.evaluate((element, scrollTop) => {
		element.scrollTop = scrollTop;
	}, firstRange.start + 39);
	await waitForFrames(page, 2);
	const box = await overlay.boundingBox();
	if (!box) {
		throw new Error("Expected model-header overlay bounds");
	}
	const clip = {
		height: Math.floor(box.height),
		width: Math.min(500, Math.floor(box.width)),
		x: Math.floor(box.x),
		y: Math.floor(box.y),
	};
	const before = await page.screenshot({ animations: "disabled", clip });
	await scroller.evaluate((element, scrollTop) => {
		element.scrollTop = scrollTop;
	}, firstRange.start + 40);
	await waitForFrames(page, 1);
	const after = await page.screenshot({ animations: "disabled", clip });
	expect(after.equals(before)).toBe(true);
});

test("the measured overlay pushes off and swaps owners without an uncovered boundary frame", async ({
	page,
}) => {
	await page.setViewportSize({ height: 1_200, width: 1_200 });
	const scroller = await openVirtualFixture(page, "turns=2&modelHeader=split");
	const firstRange = await getTurnSectionRange(scroller, "fixture-turn-1");
	const secondMemberRange = await getTurnRowRange(
		scroller,
		"fixture-turn-2",
		"member",
	);
	const secondModelRange = await getTurnSectionRange(
		scroller,
		"fixture-turn-2",
	);
	const sampleHandoff = async (boundary: number) => {
		const samples: Array<
			Awaited<ReturnType<typeof sampleStickyHeaderAtTop>> & {
				scrollTop: number;
			}
		> = [];
		for (let scrollTop = boundary - 32; scrollTop <= boundary; scrollTop += 4) {
			await scroller.evaluate((element, nextScrollTop) => {
				element.scrollTop = nextScrollTop;
			}, scrollTop);
			await waitForFrames(page, 1);
			samples.push({
				...(await sampleStickyHeaderAtTop(scroller)),
				scrollTop,
			});
		}
		for (let index = 1; index < samples.length - 1; index += 1) {
			const previous = samples[index - 1];
			const current = samples[index];
			if (!(previous && current)) {
				continue;
			}
			expect(current.visible).toBe(true);
			expect(current.atTop).toBe(true);
			expect(current.translateY).toBeLessThanOrEqual(previous.translateY);
			expect(
				Math.abs(current.top - previous.top),
				`header pop at ${current.scrollTop}`,
			).toBeLessThanOrEqual(current.scrollTop - previous.scrollTop + 1);
		}
		return samples;
	};
	const modelToMemberSamples = await sampleHandoff(firstRange.end);
	const outgoing = modelToMemberSamples.at(-2);
	if (!outgoing) {
		throw new Error("Expected an outgoing model-header sample");
	}
	expect(outgoing.visible).toBe(true);
	expect(outgoing.atTop).toBe(true);
	expect(outgoing.owner).toBe("fixture-turn-1");
	expect(outgoing.translateY).toBeLessThan(0);

	const incoming = modelToMemberSamples.at(-1);
	if (!incoming) {
		throw new Error("Expected an incoming member-header sample");
	}
	expect(incoming.visible).toBe(true);
	expect(incoming.atTop).toBe(true);
	expect(incoming.owner).toBe("fixture-turn-2");
	expect(incoming.kind).toBe("member");
	expect(incoming.userLabel).toBe("Evren");
	expect(incoming.height).toBe(56);

	const memberToModelSamples = await sampleHandoff(secondMemberRange.end);
	const incomingModel = memberToModelSamples.at(-1);
	if (!incomingModel) {
		throw new Error("Expected an incoming model-header sample");
	}
	expect(secondModelRange.start).toBeCloseTo(secondMemberRange.end, 0);
	expect(incomingModel.visible).toBe(true);
	expect(incomingModel.atTop).toBe(true);
	expect(incomingModel.owner).toBe("fixture-turn-2");
	expect(incomingModel.kind).toBe("model");
	expect(incomingModel.label).toBe("GPT 5.2");
	expect(incomingModel.height).toBe(40);
});

test("a no-response turn keeps member-header coverage across its complete extent", async ({
	page,
}) => {
	await page.setViewportSize({ height: 240, width: 900 });
	const scroller = await openVirtualFixture(
		page,
		"turns=3&profile=scroll&modelHeader=no-response",
	);
	const memberRange = await getTurnRowRange(
		scroller,
		"fixture-turn-2:streamed:1",
		"member",
	);
	const noResponseRange = await getTurnRowRange(
		scroller,
		"fixture-turn-2:streamed:1",
		"no-response",
	);
	for (
		let scrollTop = memberRange.start;
		scrollTop < noResponseRange.end;
		scrollTop += 8
	) {
		await scroller.evaluate((element, nextScrollTop) => {
			element.scrollTop = nextScrollTop;
		}, scrollTop);
		await waitForFrames(page, 1);
		const sample = await sampleStickyHeaderAtTop(scroller);
		expect(sample.visible, `visibility at ${scrollTop}`).toBe(true);
		expect(sample.atTop, `coverage at ${scrollTop}`).toBe(true);
		expect(sample.owner).toBe("fixture-turn-2:streamed:1");
		expect(sample.kind).toBe("member");
	}
});

test("model-header overlay adds no scroll-driven React commits", async ({
	browserName,
	page,
}) => {
	const scroller = await openVirtualFixture(page, "turns=18&profile=scroll");
	await scroller.evaluate((element) => {
		element.scrollTop = Math.round(
			(element.scrollHeight - element.clientHeight) * 0.72,
		);
	});
	await waitForFrames(page, 8);
	await page.evaluate(() => window.__transcriptTrace?.reset());
	await scroller
		.locator("[data-trace-fixture-reset-profile]")
		.dispatchEvent("click");
	let runFrameCount: number | undefined;
	if (browserName === "chromium") {
		const bounds = await scroller.boundingBox();
		if (!bounds) {
			throw new Error("Expected transcript scroller bounds");
		}
		await page.evaluate(() =>
			window.__transcriptTrace?.beginRun("sticky-header-fling", -1),
		);
		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Input.synthesizeScrollGesture", {
			gestureSourceType: "mouse",
			interactionMarkerName: "rudel-sticky-header-upward-fling",
			preventFling: false,
			speed: 3_500,
			x: Math.round(bounds.x + bounds.width / 2),
			xDistance: 0,
			y: Math.round(bounds.y + bounds.height / 2),
			yDistance: 5_000,
		});
		await page.waitForTimeout(750);
		runFrameCount = await page.evaluate(
			() => window.__transcriptTrace?.endRun().frameCount,
		);
	} else {
		await profileScrollSweep(scroller);
	}
	const profile = await scroller.evaluate((element) => ({
		blankFrames: Number(element.dataset.transcriptTrueBlankFrames ?? "0"),
		maxUpdateDuration: Number(
			element.dataset.traceFixtureProfileMaxUpdateDuration ?? "0",
		),
		rowUpdates: JSON.parse(
			element.dataset.traceFixtureProfileRowUpdates ?? "{}",
		) as Record<string, number>,
	}));
	const ledger = await page.evaluate(() => window.__transcriptTrace?.dump());
	if (!ledger) {
		throw new Error("Expected the transcript forensics ledger");
	}
	expect(profile.blankFrames).toBe(0);
	expect(profile.maxUpdateDuration).toBeLessThanOrEqual(8);
	expect(
		Object.keys(profile.rowUpdates).some((id) => id.includes("model-header")),
	).toBe(false);
	expect(ledger.stickyHeaderOwnerChanges.length).toBeGreaterThan(1);
	expect(ledger.stickyHeaderOwnerChanges.length).toBeLessThan(50);
	if (runFrameCount !== undefined) {
		expect(ledger.stickyHeaderOwnerChanges.length).toBeLessThan(runFrameCount);
	}
	for (
		let index = 1;
		index < ledger.stickyHeaderOwnerChanges.length;
		index += 1
	) {
		expect(ledger.stickyHeaderOwnerChanges[index]?.to).not.toBe(
			ledger.stickyHeaderOwnerChanges[index - 1]?.to,
		);
	}
});

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
	await expect(scroller).toHaveAttribute(
		"data-transcript-true-blank-frames",
		"0",
	);
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
	await expect(scroller).toHaveAttribute(
		"data-transcript-true-blank-frames",
		"0",
	);
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
	const target = scroller
		.locator('[data-transcript-turn-id="fixture-turn-2:streamed:17"]')
		.first();
	await expect(target).toHaveAttribute("aria-current", "true");
	await expect(target).toBeFocused();
	await scroller
		.locator("[data-trace-fixture-toggle-level]")
		.dispatchEvent("click");
	await waitForFrames(page, 5);
	await page.setViewportSize({ height: 640, width: 900 });
	await waitForFrames(page, 5);
	await expect(scroller).toHaveAttribute(
		"data-transcript-true-blank-frames",
		"0",
	);
});

test("wheel input cancels an in-flight programmatic anchor", async ({
	page,
}) => {
	const scroller = await openVirtualFixture(page, "turns=18&profile=scroll");
	await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript fixture scroller must be an HTMLElement");
		}
		const button = element.querySelector<HTMLButtonElement>(
			"[data-trace-fixture-jump-last]",
		);
		button?.click();
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
	});
	await expect(scroller).toHaveAttribute(
		"data-transcript-scroll-mode",
		"free-scrolling",
	);
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
	await expect(scroller).toHaveAttribute(
		"data-transcript-true-blank-frames",
		"0",
	);
});

test("semantic folds expand in place and survive keyed prepends", async ({
	page,
}) => {
	const scroller = await openVirtualFixture(page, "folds=1&turns=8");
	const fold = scroller.locator("[data-transcript-fold-turn-id]").first();
	await expect(fold).toBeVisible();
	await expect(fold).toHaveAttribute("aria-expanded", "false");
	await expect(fold).toContainText(/Show \d+ tool calls? and \d+ events?/);
	const turnId = await fold.getAttribute("data-transcript-fold-turn-id");
	if (!turnId) {
		throw new Error("Expected the fixture fold to identify its turn");
	}
	const foldRow = scroller.locator(`[data-transcript-row-id="${turnId}:fold"]`);
	const offsetBefore = await foldRow.evaluate(
		(element) =>
			element.getBoundingClientRect().top -
			(element.parentElement?.parentElement?.getBoundingClientRect().top ?? 0),
	);
	await fold.dispatchEvent("click");
	await expect(fold).toHaveAttribute("aria-expanded", "true");
	await waitForFrames(page, 5);
	const offsetAfter = await foldRow.evaluate(
		(element) =>
			element.getBoundingClientRect().top -
			(element.parentElement?.parentElement?.getBoundingClientRect().top ?? 0),
	);
	expect(Math.abs(offsetAfter - offsetBefore)).toBeLessThanOrEqual(2);

	await scroller.locator("[data-trace-fixture-prepend]").dispatchEvent("click");
	await waitForFrames(page, 5);
	await expect(
		scroller.locator(`[data-transcript-fold-turn-id="${turnId}"]`),
	).toHaveAttribute("aria-expanded", "true");
	await expect(scroller).toHaveAttribute(
		"data-transcript-true-blank-frames",
		"0",
	);
});

test("a programmatic hit expands its fold before anchoring", async ({
	page,
}) => {
	const scroller = await openVirtualFixture(page, "folds=1&turns=8");
	const fold = scroller.locator("[data-transcript-fold-turn-id]").first();
	await expect(fold).toHaveAttribute("aria-expanded", "false");
	const turnId = await fold.getAttribute("data-transcript-fold-turn-id");
	if (!turnId) {
		throw new Error("Expected the fixture fold to identify its turn");
	}
	await scroller
		.locator("[data-trace-fixture-jump-first]")
		.dispatchEvent("click");
	await expect
		.poll(
			async () =>
				await scroller.getAttribute("data-transcript-anchor-settle-ms"),
		)
		.toMatch(/^\d+$/);
	await expect(
		scroller.locator(`[data-transcript-fold-turn-id="${turnId}"]`),
	).toHaveCount(0);
	const target = scroller
		.locator(`[data-transcript-turn-id="${turnId}"]`)
		.first();
	await expect(target).toHaveAttribute("aria-current", "true");
	await expect(target).toBeFocused();
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
		await expect(scroller).toHaveAttribute(
			"data-transcript-true-blank-frames",
			"0",
		);
	});
}
