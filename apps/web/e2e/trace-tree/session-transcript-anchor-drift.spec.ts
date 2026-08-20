import {
	expect,
	type Locator,
	type Page,
	type TestInfo,
	test,
} from "@playwright/test";
import type { SessionDetailWindowRequest } from "@rudel/api-routes";
import {
	buildSessionDetailFastIntegrationSpine,
	buildSessionDetailFastIntegrationWindow,
} from "../../src/features/sessions/components/session-detail-fast-integration-data";
import type { TranscriptAnchorJournalEntry } from "../../src/features/sessions/components/transcript-forensics";

const INTEGRATION_ROUTE = "/dev/session-detail-fast-integration";
const INITIAL_TURN_ID = "integration-turn-000";
const RAPID_TARGET_TURN_INDEX = 29;
const RAPID_TARGET_TURN_ID = "integration-turn-029";
const TARGET_TURN_INDEX = 24;
const TARGET_TURN_ID = "integration-turn-024";
const WINDOW_LATENCY_MS = 200;

async function attachAnchorJournalOnFailure(page: Page, testInfo: TestInfo) {
	if (testInfo.status !== testInfo.expectedStatus) {
		const journal = await page.evaluate(
			() => window.__transcriptAnchorJournal ?? [],
		);
		await testInfo.attach("transcript-anchor-journal", {
			body: JSON.stringify(
				journal satisfies readonly TranscriptAnchorJournalEntry[],
				null,
				2,
			),
			contentType: "application/json",
		});
	}
}

test.afterEach(async ({ page }, testInfo) => {
	await attachAnchorJournalOnFailure(page, testInfo);
});

async function getTargetTopOffset(scroller: Locator, target: Locator) {
	return target.evaluate(
		(element, scrollElement) =>
			element.getBoundingClientRect().top -
			(scrollElement as HTMLElement).getBoundingClientRect().top,
		await scroller.elementHandle(),
	);
}

async function expectTargetAtTop(scroller: Locator, target: Locator) {
	await expect
		.poll(async () => Math.abs(await getTargetTopOffset(scroller, target)), {
			timeout: 15_000,
		})
		.toBeLessThanOrEqual(24);
}

async function hasMatchingClickPairJourney(page: Page, turnId: string) {
	return page.evaluate((targetTurnId) => {
		const journal = window.__transcriptAnchorJournal ?? [];
		const selectIndex = journal.findLastIndex(
			(entry) => entry.type === "select" && entry.turnId === targetTurnId,
		);
		const requestIndex = journal.findIndex(
			(entry, index) =>
				index > selectIndex &&
				entry.type === "anchorRequest" &&
				entry.turnId === targetTurnId,
		);
		const request = journal[requestIndex];
		if (request?.type !== "anchorRequest") {
			return false;
		}
		return journal.some(
			(entry, index) =>
				index > requestIndex &&
				entry.type === "anchorDerive" &&
				entry.source === "click-pair" &&
				entry.requestId === request.requestId &&
				entry.turnId === request.turnId,
		);
	}, turnId);
}

async function mockSessionDetailRoutes(page: Page) {
	await page.route("**/rpc/analytics/sessions/detailSpine", async (route) => {
		await route.fulfill({
			body: JSON.stringify({ json: buildSessionDetailFastIntegrationSpine() }),
			contentType: "application/json",
			status: 200,
		});
	});
	let windowRequestCount = 0;
	await page.route("**/rpc/analytics/sessions/detailWindow", async (route) => {
		const requestBody = route.request().postDataJSON() as {
			json: SessionDetailWindowRequest;
		};
		windowRequestCount += 1;
		if (windowRequestCount > 1) {
			await new Promise((resolve) => setTimeout(resolve, WINDOW_LATENCY_MS));
		}
		await route.fulfill({
			body: JSON.stringify({
				json: buildSessionDetailFastIntegrationWindow(requestBody.json),
			}),
			contentType: "application/json",
			status: 200,
		});
	});
}

test("keeps a clicked transcript turn anchored through late hydration until user takeover", async ({
	page,
}) => {
	await mockSessionDetailRoutes(page);
	await page.goto(
		`${INTEGRATION_ROUTE}?transcriptDebug=1&turn=${INITIAL_TURN_ID}`,
	);

	const scroller = page.getByRole("region", { name: "Conversation thread" });
	const targetRow = page
		.locator(
			`[data-session-turn-table-body] tr[data-turn-index="${TARGET_TURN_INDEX}"]`,
		)
		.first();
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect(targetRow).toBeVisible();
	await targetRow.click();

	const target = scroller
		.locator(`[data-transcript-turn-id="${TARGET_TURN_ID}"]`)
		.first();
	await expect(target).toBeVisible({ timeout: 15_000 });
	await expectTargetAtTop(scroller, target);
	await expect
		.poll(() => scroller.getAttribute("data-transcript-anchor-settle-ms"))
		.not.toBeNull();

	await page.waitForTimeout(1_000);
	await expectTargetAtTop(scroller, target);
	const postClickJourney = await page.evaluate((turnId) => {
		const journal = window.__transcriptAnchorJournal ?? [];
		const selectIndex = journal.findLastIndex(
			(entry) => entry.type === "select" && entry.turnId === turnId,
		);
		const afterClick = journal.slice(selectIndex + 1);
		return {
			anchorStarts: afterClick
				.filter((entry) => entry.type === "scrollToTurn:start")
				.map((entry) => entry.turnId),
			hasStalePairBlock: afterClick.some(
				(entry) =>
					entry.type === "retryEffect" &&
					entry.outcome === "stale-pair-blocked",
			),
			hasStoredFalse: afterClick.some(
				(entry) =>
					entry.type === "retryEffect" &&
					entry.outcome === "used-stored-promise" &&
					entry.storedPromiseResult === false,
			),
		};
	}, TARGET_TURN_ID);
	expect(postClickJourney.anchorStarts.length).toBeGreaterThan(0);
	expect(
		postClickJourney.anchorStarts.every((turnId) => turnId === TARGET_TURN_ID),
	).toBe(true);
	expect(postClickJourney.hasStalePairBlock).toBe(false);
	expect(postClickJourney.hasStoredFalse).toBe(false);
	await expect
		.poll(() => hasMatchingClickPairJourney(page, TARGET_TURN_ID))
		.toBe(true);
	await expect(scroller).toHaveAttribute(
		"data-transcript-anchor-state",
		"soft",
	);
	await expect(scroller).toHaveAttribute(
		"data-transcript-anchor-turn",
		TARGET_TURN_ID,
	);
	await expect(scroller).toHaveAttribute(
		"data-transcript-anchor-outcome",
		"settled",
	);
	await expect(targetRow).toHaveAttribute("data-viewed", "true");
	await expect
		.poll(() =>
			page.evaluate((turnId) => {
				const journal = window.__transcriptAnchorJournal ?? [];
				const hasSelect = journal.some(
					(entry) => entry.type === "select" && entry.turnId === turnId,
				);
				const hasWindowFetch = journal.some(
					(entry) =>
						entry.type === "anchorWindow" &&
						entry.phase === "fetch-start" &&
						entry.turnId === turnId,
				);
				const hasStartAndSettle = journal.some(
					(entry) =>
						entry.type === "pin:settle" &&
						journal.some(
							(candidate) =>
								candidate.type === "scrollToTurn:start" &&
								candidate.turnId === turnId &&
								candidate.epoch === entry.epoch,
						),
				);
				const hasStoredRetryResult = journal.some(
					(entry) =>
						entry.type === "retryEffect" &&
						entry.outcome === "used-stored-promise" &&
						entry.storedPromiseResult === true &&
						entry.turnId === turnId,
				);
				return (
					hasSelect &&
					hasWindowFetch &&
					hasStartAndSettle &&
					hasStoredRetryResult
				);
			}, TARGET_TURN_ID),
		)
		.toBe(true);
	await expect
		.poll(async () => {
			const visibleIndex = Number(
				await targetRow.getAttribute("data-visible-index"),
			);
			return scroller
				.page()
				.locator("[data-viewed-indicator-group]")
				.evaluateAll(
					(pills, rowIndex) =>
						pills.some((pill) => {
							const first = Number(
								(pill as HTMLElement).dataset.firstVisibleIndex,
							);
							const last = Number(
								(pill as HTMLElement).dataset.lastVisibleIndex,
							);
							return first <= rowIndex && rowIndex <= last;
						}),
					visibleIndex,
				);
		})
		.toBe(true);

	const bounds = await scroller.boundingBox();
	if (!bounds) {
		throw new Error("Expected transcript scroller bounds");
	}
	await page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	const beforeWheel = await scroller.evaluate((element) => element.scrollTop);
	await page.mouse.wheel(0, 600);
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollTop))
		.toBeGreaterThan(beforeWheel + 20);
	await page.waitForTimeout(500);
	expect(
		await scroller.evaluate((element) => element.scrollTop),
	).toBeGreaterThan(beforeWheel + 20);
	await expect(scroller).toHaveAttribute(
		"data-transcript-anchor-state",
		"free",
	);
	await expect(scroller).toHaveAttribute(
		"data-transcript-anchor-outcome",
		"cancelled:mode-free-scrolling",
	);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const journal = window.__transcriptAnchorJournal ?? [];
				return journal.some(
					(entry) =>
						entry.type === "cancelAnchor" &&
						entry.eventType === "wheel" &&
						journal.some(
							(candidate) =>
								candidate.type === "pin:deactivate" &&
								candidate.epoch === entry.epoch &&
								candidate.clause === "mode-free-scrolling",
						),
				);
			}),
		)
		.toBe(true);
});

test("the latest ledger click wins while anchor windows are in flight", async ({
	page,
}) => {
	await mockSessionDetailRoutes(page);
	await page.goto(
		`${INTEGRATION_ROUTE}?transcriptDebug=1&turn=${INITIAL_TURN_ID}`,
	);

	const scroller = page.getByRole("region", { name: "Conversation thread" });
	const firstRow = page
		.locator(
			`[data-session-turn-table-body] tr[data-turn-index="${TARGET_TURN_INDEX}"]`,
		)
		.first();
	const latestRow = page
		.locator(
			`[data-session-turn-table-body] tr[data-turn-index="${RAPID_TARGET_TURN_INDEX}"]`,
		)
		.first();
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect(firstRow).toBeVisible();
	await firstRow.click();
	await page.waitForTimeout(WINDOW_LATENCY_MS);
	await expect(page).toHaveURL(new RegExp(`turn=${TARGET_TURN_ID}`));
	await expect(latestRow).toBeVisible();
	await latestRow.click();

	const latestTarget = scroller
		.locator(`[data-transcript-turn-id="${RAPID_TARGET_TURN_ID}"]`)
		.first();
	await expect(latestTarget).toBeVisible({ timeout: 15_000 });
	await expectTargetAtTop(scroller, latestTarget);
	await expect(latestRow).toHaveAttribute("data-viewed", "true");
	await page.waitForTimeout(1_000);
	await expectTargetAtTop(scroller, latestTarget);

	const latestClickJourney = await page.evaluate((turnId) => {
		const journal = window.__transcriptAnchorJournal ?? [];
		const selectIndex = journal.findLastIndex(
			(entry) => entry.type === "select" && entry.turnId === turnId,
		);
		const afterClick = journal.slice(selectIndex + 1);
		return {
			anchorStarts: afterClick
				.filter((entry) => entry.type === "scrollToTurn:start")
				.map((entry) => entry.turnId),
			hasStalePairBlock: afterClick.some(
				(entry) =>
					entry.type === "retryEffect" &&
					entry.outcome === "stale-pair-blocked",
			),
		};
	}, RAPID_TARGET_TURN_ID);
	expect(latestClickJourney.anchorStarts.length).toBeGreaterThan(0);
	expect(
		latestClickJourney.anchorStarts.every(
			(turnId) => turnId === RAPID_TARGET_TURN_ID,
		),
	).toBe(true);
	expect(latestClickJourney.hasStalePairBlock).toBe(false);
	await expect
		.poll(() => hasMatchingClickPairJourney(page, RAPID_TARGET_TURN_ID))
		.toBe(true);
});
