import { expect, type Locator, type Page, test } from "@playwright/test";
import type { SessionDetailWindowRequest } from "@rudel/api-routes";
import {
	buildSessionDetailFastIntegrationRemainingOverviewPage,
	buildSessionDetailFastIntegrationSpine,
	buildSessionDetailFastIntegrationWindow,
	getSessionDetailIntegrationTurnId,
	SESSION_DETAIL_INTEGRATION_SESSION_ID,
} from "../../src/features/sessions/components/session-detail-fast-integration-data";

const INTEGRATION_ROUTE = "/dev/session-detail-fast-integration";

async function waitForFrames(page: Page, count = 2) {
	await page.evaluate(async (frames) => {
		for (let index = 0; index < frames; index += 1) {
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
		}
	}, count);
}

async function expectWheelDirection(input: {
	deltaY: number;
	page: Page;
	scroller: Locator;
}) {
	const bounds = await input.scroller.boundingBox();
	if (!bounds) {
		throw new Error("Expected real response pane scroll bounds");
	}
	await input.page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	const before = await input.scroller.evaluate((element) => element.scrollTop);
	await input.page.mouse.wheel(0, input.deltaY);
	await waitForFrames(input.page, 1);
	const after = await input.scroller.evaluate((element) => element.scrollTop);
	if (input.deltaY > 0) {
		expect(after).toBeGreaterThan(before);
	} else {
		expect(after).toBeLessThan(before);
	}
	return after;
}

test("the signal popup uses paginated overview data without detail-turn requests", async ({
	page,
}) => {
	const detailTurnRequests: string[] = [];
	let releaseRemainingOverview: () => void = () => undefined;
	const remainingOverviewGate = new Promise<void>((resolve) => {
		releaseRemainingOverview = resolve;
	});
	await page.route("**/rpc/analytics/sessions/detailSpine", async (route) => {
		await route.fulfill({
			body: JSON.stringify({ json: buildSessionDetailFastIntegrationSpine() }),
			contentType: "application/json",
			status: 200,
		});
	});
	await page.route("**/rpc/analytics/sessions/detailWindow", async (route) => {
		await route.fulfill({
			body: JSON.stringify({
				json: buildSessionDetailFastIntegrationWindow({
					includeBodies: true,
					mode: "initial",
					sessionId: SESSION_DETAIL_INTEGRATION_SESSION_ID,
				}),
			}),
			contentType: "application/json",
			status: 200,
		});
	});
	await page.route(
		"**/rpc/analytics/sessions/detailOverview**",
		async (route) => {
			await remainingOverviewGate;
			await route.fulfill({
				body: JSON.stringify({
					json: buildSessionDetailFastIntegrationRemainingOverviewPage(),
				}),
				contentType: "application/json",
				status: 200,
			});
		},
	);
	await page.route("**/rpc/analytics/sessions/detailTurn", async (route) => {
		detailTurnRequests.push(route.request().url());
		await route.abort();
	});

	await page.goto(INTEGRATION_ROUTE);
	await page.getByRole("button", { name: "Signals 1" }).click();
	await expect(page.getByText("Loading signal occurrences…")).toBeVisible();
	releaseRemainingOverview();
	await expect(
		page.getByRole("button", { name: /Positive · Great.*Turn 81/u }),
	).toBeVisible();
	expect(detailTurnRequests).toEqual([]);
});

test("the activity tag row keeps its width when the Inter face becomes ready", async ({
	page,
}) => {
	await page.route("**/rpc/analytics/sessions/detailSpine", async (route) => {
		await route.fulfill({
			body: JSON.stringify({ json: buildSessionDetailFastIntegrationSpine() }),
			contentType: "application/json",
			status: 200,
		});
	});
	await page.route("**/rpc/analytics/sessions/detailWindow", async (route) => {
		await route.fulfill({
			body: JSON.stringify({
				json: buildSessionDetailFastIntegrationWindow({
					includeBodies: true,
					mode: "initial",
					sessionId: SESSION_DETAIL_INTEGRATION_SESSION_ID,
				}),
			}),
			contentType: "application/json",
			status: 200,
		});
	});
	let fontRequestIntercepted = false;
	let releaseFont: () => void = () => undefined;
	const heldFont = new Promise<void>((resolve) => {
		releaseFont = resolve;
	});
	await page.route(/inter-latin-wght-normal\.woff2/u, async (route) => {
		fontRequestIntercepted = true;
		await heldFont;
		await route.continue();
	});

	await page.goto(INTEGRATION_ROUTE, { waitUntil: "domcontentloaded" });
	const activityItems = page.locator("[data-session-detail-activity-items]");
	await expect(activityItems).toBeVisible();
	const beforeFontsReady = await activityItems.evaluate(
		(element) => element.getBoundingClientRect().width,
	);

	releaseFont();
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
	});
	const afterFontsReady = await activityItems.evaluate(
		(element) => element.getBoundingClientRect().width,
	);

	expect(fontRequestIntercepted).toBe(true);
	expect(Math.abs(afterFontsReady - beforeFontsReady)).toBeLessThan(0.5);
});

test("the real fast response pane keeps user scroll authoritative across windows and jumps", async ({
	page,
}) => {
	const windowRequests: SessionDetailWindowRequest[] = [];
	let targetAnchorFulfilled = false;
	await page.route("**/rpc/analytics/sessions/detailSpine", async (route) => {
		await route.fulfill({
			body: JSON.stringify({ json: buildSessionDetailFastIntegrationSpine() }),
			contentType: "application/json",
			status: 200,
		});
	});
	await page.route("**/rpc/analytics/sessions/detailWindow", async (route) => {
		const requestBody: unknown = route.request().postDataJSON();
		if (
			typeof requestBody !== "object" ||
			requestBody === null ||
			!("json" in requestBody)
		) {
			throw new Error("Expected an oRPC JSON window request");
		}
		const request = requestBody.json as SessionDetailWindowRequest;
		windowRequests.push(request);
		const isTargetAnchor =
			request.mode === "anchor" &&
			request.anchorTurnId === getSessionDetailIntegrationTurnId(80);
		if (isTargetAnchor) {
			await new Promise((resolve) => setTimeout(resolve, 1_000));
		} else {
			await new Promise((resolve) => setTimeout(resolve, 30));
		}
		await route.fulfill({
			body: JSON.stringify({
				json: buildSessionDetailFastIntegrationWindow(request),
			}),
			contentType: "application/json",
			status: 200,
		});
		if (isTargetAnchor) {
			targetAnchorFulfilled = true;
		}
	});

	await page.goto(INTEGRATION_ROUTE);
	const root = page.locator("[data-session-detail-fast-integration]");
	const scroller = page.getByRole("region", { name: "Conversation thread" });
	await expect(root).toBeVisible();
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect
		.poll(() => windowRequests.some((request) => request.mode === "initial"))
		.toBe(true);

	for (const deltaY of [700, 900, 1_100]) {
		await expectWheelDirection({ deltaY, page, scroller });
	}
	for (const deltaY of [-500, -700]) {
		await expectWheelDirection({ deltaY, page, scroller });
	}

	const targetIndex = 80;
	const targetTurnId = getSessionDetailIntegrationTurnId(targetIndex);
	const anchorResult = await page
		.getByRole("button", {
			name: `Select Turn ${targetIndex + 1}`,
			exact: true,
		})
		.evaluate(async (button, clickedTurnId) => {
			if (!(button instanceof HTMLButtonElement)) {
				throw new Error("Expected the session activity turn button");
			}
			const scroller = document.querySelector<HTMLElement>(
				'[aria-label="Conversation thread"]',
			);
			if (!scroller) {
				throw new Error("Expected the transcript scroller");
			}
			let sawMetricClear = false;
			let sawPendingBeforeRelease = false;
			let previousFrameAt = performance.now();
			const frameGaps: number[] = [];
			button.click();
			for (let frame = 0; frame < 120; frame += 1) {
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
				const frameAt = performance.now();
				frameGaps.push(frameAt - previousFrameAt);
				previousFrameAt = frameAt;
				if (scroller.dataset.transcriptAnchorSettleMs === undefined) {
					sawMetricClear = true;
				}
				const target = scroller.querySelector<HTMLElement>(
					`[data-transcript-turn-id="${CSS.escape(clickedTurnId)}"]`,
				);
				if (
					!sawPendingBeforeRelease &&
					target?.dataset.transcriptRowKind === "turn-pending"
				) {
					sawPendingBeforeRelease = true;
				}
				const settleMs = scroller.dataset.transcriptAnchorSettleMs;
				if (sawMetricClear && settleMs !== undefined) {
					return {
						frameGaps,
						sawPendingBeforeRelease,
						settleMs: Number(settleMs),
					};
				}
			}
			throw new Error("The target anchor did not settle within 120 frames");
		}, targetTurnId);
	console.log(anchorResult.frameGaps);
	expect(anchorResult.sawPendingBeforeRelease).toBe(true);
	expect(anchorResult.settleMs).toBeLessThan(200);
	expect(targetAnchorFulfilled).toBe(false);
	await expect.poll(() => targetAnchorFulfilled).toBe(true);
	const target = scroller
		.locator(`[data-transcript-turn-id="${targetTurnId}"]`)
		.first();
	await expect
		.poll(() =>
			windowRequests.some(
				(request) =>
					request.mode === "anchor" && request.anchorTurnId === targetTurnId,
			),
		)
		.toBe(true);
	await expect(target).toBeVisible({ timeout: 15_000 });
	await expect(target).toHaveAttribute("aria-current", "true");
	expect(
		await target.evaluate(
			(element, scrollElement) =>
				element.getBoundingClientRect().top -
				(scrollElement as HTMLElement).getBoundingClientRect().top,
			await scroller.elementHandle(),
		),
	).toBeLessThanOrEqual(2);
	await expect(page).toHaveURL(new RegExp(`turn=${targetTurnId}`));

	await expect(
		page.getByRole("group", { name: "Session detail level" }),
	).toHaveCount(0);
	await expect(page.getByRole("radio", { name: "Request level" })).toHaveCount(
		0,
	);
	await expect(target).toBeVisible();
	await expectWheelDirection({ deltaY: -400, page, scroller });
	await expectWheelDirection({ deltaY: 600, page, scroller });

	await expect(
		root.locator("[data-session-detail-integration-stale]"),
	).toHaveCount(0);
	expect(
		windowRequests.every(
			(request) => request.sessionId === SESSION_DETAIL_INTEGRATION_SESSION_ID,
		),
	).toBe(true);
});
