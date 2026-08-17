import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { SessionDetailWindowRequestSchema } from "@rudel/api-routes";
import { buildSessionDetailFastIntegrationWindow } from "../../src/features/sessions/components/session-detail-fast-integration-data";
import type { TranscriptForensicsController } from "../../src/features/sessions/components/transcript-forensics";

declare global {
	interface Window {
		__transcriptTrace?: TranscriptForensicsController;
	}
}

const ARTIFACT_DIRECTORY = fileURLToPath(
	new URL("../../../../.context/scroll-forensics/", import.meta.url),
);
const INTEGRATION_ROUTE = "/dev/session-detail-fast-integration";
const MASK_ROUTE = "/dev/transcript-mask";

async function installWindowTransport(page: Page) {
	await page.route("**/rpc/analytics/sessions/detailWindow", async (route) => {
		const requestBody: unknown = route.request().postDataJSON();
		if (
			typeof requestBody !== "object" ||
			requestBody === null ||
			!("json" in requestBody)
		) {
			throw new Error("Expected an oRPC JSON window request");
		}
		const request = SessionDetailWindowRequestSchema.parse(requestBody.json);
		await route.fulfill({
			body: JSON.stringify({
				json: buildSessionDetailFastIntegrationWindow(request),
			}),
			contentType: "application/json",
			status: 200,
		});
	});
}

async function placeInHeavyRegion(scroller: Locator, page: Page) {
	await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript scroller must be an HTMLElement");
		}
		element.scrollTop = Math.round(
			(element.scrollHeight - element.clientHeight) * 0.72,
		);
	});
	await page.evaluate(async () => {
		for (let index = 0; index < 12; index += 1) {
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
		}
	});
}

test("the tuning route exposes the production mask in light and dark", async ({
	page,
}) => {
	await page.goto(MASK_ROUTE);
	const panes = page.locator("[data-transcript-mask-exposed]");
	await expect(panes).toHaveCount(2);
	await expect(panes.first()).toBeVisible();
	await expect(panes.nth(1)).toBeVisible();
	for (const pane of await panes.all()) {
		const maskStyle = await pane.evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				attachment: style.backgroundAttachment,
				image: style.backgroundImage,
			};
		});
		expect(maskStyle.attachment).toBe("local");
		expect(maskStyle.image).toContain("repeating-linear-gradient");
		await pane.evaluate((element) => {
			element.scrollTop = 240;
		});
		await expect
			.poll(() => pane.evaluate((element) => element.scrollTop))
			.toBe(240);
	}
	await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
	await page.screenshot({
		fullPage: false,
		path: `${ARTIFACT_DIRECTORY}/step-12-transcript-mask-route.png`,
	});

	await page.getByLabel("Overlay real rows").check();
	const overlays = page.locator("[data-transcript-mask-overlay]");
	await expect(overlays).toHaveCount(2);
	await expect(overlays.first()).toBeVisible();
	await expect(overlays.nth(1)).toBeVisible();
	await expect(overlays.locator("[data-session-turn-skeleton]")).toHaveCount(2);
	await expect(overlays.locator("[data-trace-collapsed-preview]")).toHaveCount(
		2,
	);
	await expect(overlays.locator("[data-trace-expanded-content]")).toHaveCount(
		0,
	);
	await page.screenshot({
		fullPage: false,
		path: `${ARTIFACT_DIRECTORY}/step-12-transcript-mask-route-overlay.png`,
	});
});

test("the real response pane masks fling gaps without changing row surfaces", async ({
	page,
}) => {
	await installWindowTransport(page);
	await page.goto(`${INTEGRATION_ROUTE}?transcript=virtual&transcriptDebug=1`);
	const scroller = page.getByRole("region", { name: "Conversation thread" });
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect
		.poll(() => page.evaluate(() => window.__transcriptTrace !== undefined))
		.toBe(true);
	const maskStyle = await scroller.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			attachment: style.backgroundAttachment,
			image: style.backgroundImage,
		};
	});
	expect(maskStyle.attachment).toBe("local");
	expect(maskStyle.image).toContain("repeating-linear-gradient");

	const mountedRow = scroller.locator("[data-transcript-row-id]").first();
	await expect(mountedRow).toBeVisible();
	const surfaces = await mountedRow.evaluate((row) => {
		const rowScroller = row.closest(
			"[data-conversation-trace-scroll-container]",
		);
		if (!(rowScroller instanceof HTMLElement)) {
			throw new Error("Expected a transcript scroll container");
		}
		return {
			row: getComputedStyle(row).backgroundColor,
			scroller: getComputedStyle(rowScroller).backgroundColor,
		};
	});
	expect(surfaces.row).toBe(surfaces.scroller);
	expect(surfaces.row).not.toBe("rgba(0, 0, 0, 0)");

	await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
	await page.screenshot({
		fullPage: false,
		path: `${ARTIFACT_DIRECTORY}/step-12-texture-mask-rest-light.png`,
	});
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.screenshot({
		fullPage: false,
		path: `${ARTIFACT_DIRECTORY}/step-12-texture-mask-rest-dark.png`,
	});
	await page.evaluate(() => document.documentElement.classList.remove("dark"));

	await placeInHeavyRegion(scroller, page);
	const virtualList = scroller.locator("[data-transcript-virtual-list]");
	await virtualList.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Expected the virtual transcript list");
		}
		// A screenshot command resumes after a main-thread stall, once rows have
		// painted. Expose the real backing layer for the artifact while the same
		// synthesized gesture is in flight; this changes no application code.
		element.style.visibility = "hidden";
	});
	const bounds = await scroller.boundingBox();
	if (!bounds) {
		throw new Error("Expected transcript scroll bounds");
	}
	await page.evaluate(() => {
		const trace = window.__transcriptTrace;
		if (!trace) {
			throw new Error("Transcript forensic ledger was not installed");
		}
		trace.reset();
		trace.beginRun("step-12-mask-visual-up", -1);
		window.setTimeout(() => trace.blockMainThread(300), 80);
	});
	const cdp = await page.context().newCDPSession(page);
	const midFlingScreenshot = (async () => {
		await new Promise((resolve) => setTimeout(resolve, 140));
		return cdp.send("Page.captureScreenshot", { format: "png" });
	})();
	const fling = cdp.send("Input.synthesizeScrollGesture", {
		gestureSourceType: "mouse",
		interactionMarkerName: "rudel-step-12-mask-upward-fling",
		preventFling: false,
		speed: 3_500,
		x: Math.round(bounds.x + bounds.width / 2),
		xDistance: 0,
		y: Math.round(bounds.y + bounds.height / 2),
		yDistance: 5_000,
	});
	const screenshot = await midFlingScreenshot;
	await writeFile(
		`${ARTIFACT_DIRECTORY}/step-12-texture-mask-mid-fling.png`,
		Buffer.from(screenshot.data, "base64"),
	);
	await virtualList.evaluate((element) => {
		if (element instanceof HTMLElement) {
			element.style.removeProperty("visibility");
		}
	});
	await fling;
	await page.waitForTimeout(750);
	await cdp.detach();
	const capture = await page.evaluate(() => {
		const trace = window.__transcriptTrace;
		if (!trace) {
			throw new Error("Transcript forensic ledger disappeared");
		}
		return { dump: trace.dump(), run: trace.endRun() };
	});
	await writeFile(
		`${ARTIFACT_DIRECTORY}/step-12-texture-mask-visual-run.json`,
		`${JSON.stringify(capture, null, 2)}\n`,
		"utf8",
	);
	expect(capture.run.feelScore.trueBlankMs).toBe(0);
	expect(capture.dump.frames.every((frame) => frame.trueBlankPts === 0)).toBe(
		true,
	);
	expect(
		capture.dump.frames.some((frame) => frame.maskedGapPts > 0) ||
			capture.run.feelScore.maskedGapMs > 0,
	).toBe(true);
});
