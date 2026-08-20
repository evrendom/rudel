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

async function mockRoutesWithLatency(page: Page) {
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
		// First (initial) window is fast; every later window (anchor loads) is slow.
		if (windowRequestCount > 1) {
			await new Promise((resolve) => setTimeout(resolve, WINDOW_LATENCY_MS));
		}
		const responseWindow = buildSessionDetailFastIntegrationWindow(
			requestBody.json,
		);
		await route.fulfill({
			body: JSON.stringify({
				json: {
					...responseWindow,
					turns: responseWindow.turns.map((turn) =>
						turn.turnId === TARGET_TURN_ID && turn.body
							? {
									...turn,
									body: {
										...turn.body,
										responseItems: [
											...turn.body.responseItems,
											{
												id: `${TARGET_TURN_ID}:system`,
												kind: "system",
												systemType: "system",
												text: "Target turn follow-up context",
												timestamp: "2026-08-17T10:48:15.000Z",
											},
										],
									},
								}
							: turn,
					),
				},
			}),
			contentType: "application/json",
			status: 200,
		});
	});
}

test("first click anchors the clicked turn even when anchor windows load slowly", async ({
	browserName,
	page,
}) => {
	test.setTimeout(60_000);
	await page.addInitScript(() => {
		const animate = Element.prototype.animate;
		Element.prototype.animate = function anchorFlashObserver(
			keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
			options?: KeyframeAnimationOptions | number,
		) {
			if (this instanceof HTMLElement) {
				this.dataset.anchorFlashObserved = "true";
				this.dataset.anchorFlashCount = String(
					Number(this.dataset.anchorFlashCount ?? "0") + 1,
				);
			}
			return animate.call(this, keyframes, options);
		};
	});
	page.on("console", (message) => {
		const text = message.text();
		if (text.startsWith("[anchor ")) {
			console.log(text);
		}
	});
	await mockRoutesWithLatency(page);
	await page.goto(
		`${INTEGRATION_ROUTE}?transcriptDebug=1&turn=${INITIAL_TURN_ID}`,
	);

	const scroller = page.getByRole("region", { name: "Conversation thread" });
	const targetRow = page
		.locator(
			`[data-session-turn-table-body] tr[data-turn-index="${TARGET_TURN_INDEX}"][data-speaker="model"]`,
		)
		.first();
	await expect(scroller).toBeVisible();
	await expect(targetRow).toBeVisible();
	await page.waitForTimeout(400);
	await targetRow.click();

	const targetModelRows = page.locator(
		`[data-transcript-turn-id="${TARGET_TURN_ID}"]:not([data-transcript-row-kind="member"]):not([data-transcript-row-kind="turn-pending"])`,
	);
	const targetModelHeader = scroller.locator(
		`[data-transcript-sticky-header-owner="${TARGET_TURN_ID}"][data-transcript-sticky-header-kind="model"]`,
	);
	const target = targetModelRows.first();
	await expect(target).toBeVisible({ timeout: 15_000 });
	await expect
		.poll(async () => Math.abs(await getTargetTopOffset(scroller, target)), {
			timeout: 15_000,
		})
		.toBeLessThanOrEqual(24);
	if (browserName === "chromium") {
		const highlightedModelRows = await targetModelRows.evaluateAll((rows) =>
			rows.map((row) => ({
				flashCount: row.getAttribute("data-anchor-flash-count"),
				highlighted: row.getAttribute("data-anchor-flash-observed") === "true",
				kind: row.getAttribute("data-transcript-row-kind"),
			})),
		);
		expect(highlightedModelRows.length).toBeGreaterThan(1);
		expect(highlightedModelRows.every((row) => row.highlighted)).toBe(true);
		expect(highlightedModelRows.every((row) => row.flashCount === "1")).toBe(
			true,
		);
		await expect(target.locator("[data-model-section-header]")).toHaveCount(1);
		await expect(targetModelHeader).toHaveAttribute(
			"data-anchor-flash-count",
			"1",
		);
		const targetMember = page.locator(
			`[data-transcript-turn-id="${TARGET_TURN_ID}"][data-transcript-row-kind="member"]`,
		);
		const targetMemberHeader = scroller.locator(
			`[data-transcript-sticky-header-owner="${TARGET_TURN_ID}"][data-transcript-sticky-header-kind="member"]`,
		);
		await expect(targetMember).not.toHaveAttribute(
			"data-anchor-flash-observed",
			"true",
		);
		await page
			.locator(
				`[data-session-turn-table-body] tr[data-turn-index="${TARGET_TURN_INDEX}"][data-speaker="member"]`,
			)
			.first()
			.click();
		await expect(targetMember).toHaveAttribute(
			"data-anchor-flash-observed",
			"true",
		);
		await expect(targetMember).toHaveAttribute("data-anchor-flash-count", "1");
		await expect(targetMemberHeader).toHaveAttribute(
			"data-anchor-flash-count",
			"1",
		);
		expect(
			await targetModelRows.evaluateAll((rows) =>
				rows.every(
					(row) => row.getAttribute("data-anchor-flash-count") === "1",
				),
			),
		).toBe(true);
	}
	await expect(targetRow).toHaveAttribute("data-viewed", "true");
	const journey = await page.evaluate((turnId) => {
		const journal = window.__transcriptAnchorJournal ?? [];
		const selectIndex = journal.findLastIndex(
			(entry) => entry.type === "select" && entry.turnId === turnId,
		);
		const afterClick = journal.slice(selectIndex + 1);
		const requestIndex = afterClick.findIndex(
			(entry) => entry.type === "anchorRequest" && entry.turnId === turnId,
		);
		const request = afterClick[requestIndex];
		return {
			allStartsTarget: afterClick
				.filter((entry) => entry.type === "scrollToTurn:start")
				.every((entry) => entry.turnId === turnId),
			hasMatchingDerive:
				request?.type === "anchorRequest" &&
				afterClick.some(
					(entry, index) =>
						index > requestIndex &&
						entry.type === "anchorDerive" &&
						entry.source === "click-pair" &&
						entry.requestId === request.requestId &&
						entry.turnId === request.turnId,
				),
			hasStalePairBlock: afterClick.some(
				(entry) =>
					entry.type === "retryEffect" &&
					entry.outcome === "stale-pair-blocked",
			),
		};
	}, TARGET_TURN_ID);
	expect(journey).toEqual({
		allStartsTarget: true,
		hasMatchingDerive: true,
		hasStalePairBlock: false,
	});
});
