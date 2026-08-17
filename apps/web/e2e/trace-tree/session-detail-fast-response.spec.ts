import { expect, type Locator, type Page, test } from "@playwright/test";
import type { SessionDetailWindowRequest } from "@rudel/api-routes";
import {
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

test("the real fast response pane keeps user scroll authoritative across windows, jumps, and levels", async ({
	page,
}) => {
	const windowRequests: SessionDetailWindowRequest[] = [];
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
		await new Promise((resolve) => setTimeout(resolve, 30));
		await route.fulfill({
			body: JSON.stringify({
				json: buildSessionDetailFastIntegrationWindow(request),
			}),
			contentType: "application/json",
			status: 200,
		});
	});

	await page.goto(`${INTEGRATION_ROUTE}?transcript=virtual&transcriptDebug=1`);
	const root = page.locator("[data-session-detail-fast-integration]");
	const scroller = page.getByRole("region", { name: "Conversation thread" });
	await expect(root).toBeVisible();
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
	await expect
		.poll(() => windowRequests.some((request) => request.mode === "initial"))
		.toBe(true);
	await expect
		.poll(async () => {
			const badges = await scroller
				.locator('[data-transcript-row-kind="section"] output')
				.allTextContents();
			return badges.some((badge) => /Δ -\d+px/u.test(badge));
		})
		.toBe(true);

	for (const deltaY of [700, 900, 1_100]) {
		await expectWheelDirection({ deltaY, page, scroller });
	}
	for (const deltaY of [-500, -700]) {
		await expectWheelDirection({ deltaY, page, scroller });
	}

	const targetIndex = 80;
	const targetTurnId = getSessionDetailIntegrationTurnId(targetIndex);
	await page
		.getByRole("button", {
			name: `Select Turn ${targetIndex + 1}`,
			exact: true,
		})
		.dispatchEvent("click");
	await expect
		.poll(() =>
			windowRequests.some(
				(request) =>
					request.mode === "anchor" && request.anchorTurnId === targetTurnId,
			),
		)
		.toBe(true);
	const target = scroller
		.locator(`[data-transcript-turn-id="${targetTurnId}"]`)
		.first();
	await expect(target).toBeVisible({ timeout: 15_000 });
	await expect(target).toHaveAttribute("aria-current", "true");
	await expect(target).toBeFocused();
	await expect(page).toHaveURL(
		new RegExp(
			`turn=${targetTurnId}.*transcriptDebug=1|transcriptDebug=1.*turn=${targetTurnId}`,
		),
	);

	const requestLevel = page.getByRole("radio", { name: "Request level" });
	await requestLevel.click();
	await expect(page).toHaveURL(/level=request/u);
	await expect(requestLevel).toBeChecked();
	await waitForFrames(page, 5);
	await expect(target).toBeVisible();
	await expectWheelDirection({ deltaY: -400, page, scroller });
	await expectWheelDirection({ deltaY: 600, page, scroller });

	await expect(scroller).toHaveAttribute("data-transcript-blank-frames", "0");
	await expect(
		root.locator("[data-session-detail-integration-stale]"),
	).toHaveCount(0);
	expect(
		windowRequests.every(
			(request) => request.sessionId === SESSION_DETAIL_INTEGRATION_SESSION_ID,
		),
	).toBe(true);
});
