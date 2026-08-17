import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	type SessionDetailWindowRequest,
	SessionDetailWindowRequestSchema,
} from "@rudel/api-routes";
import {
	buildSessionDetailFastIntegrationWindow,
	SESSION_DETAIL_INTEGRATION_SESSION_ID,
} from "../../src/features/sessions/components/session-detail-fast-integration-data";
import type { TranscriptForensicsController } from "../../src/features/sessions/components/transcript-forensics";

declare global {
	interface Window {
		__transcriptTrace?: TranscriptForensicsController;
	}
}

const INTEGRATION_ROUTE = "/dev/session-detail-fast-integration";
const ARTIFACT_DIRECTORY = fileURLToPath(
	new URL("../../../../.context/scroll-forensics/", import.meta.url),
);

async function waitForFrames(page: Page, count: number) {
	await page.evaluate(async (frames) => {
		for (let index = 0; index < frames; index += 1) {
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
		}
	}, count);
}

async function installWindowTransport(page: Page) {
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
		const request = SessionDetailWindowRequestSchema.parse(requestBody.json);
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
	return windowRequests;
}

async function placeInHeavyRegion(scroller: Locator, page: Page) {
	await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript scroller must be an HTMLElement");
		}
		const maximum = element.scrollHeight - element.clientHeight;
		element.scrollTop = Math.round(maximum * 0.72);
	});
	await waitForFrames(page, 12);
}

test("captures the Step 0 frame ledger over a synthesized inertial fling", async ({
	page,
}) => {
	const windowRequests = await installWindowTransport(page);
	await page.goto(`${INTEGRATION_ROUTE}?transcriptDebug=1`);
	const scroller = page.getByRole("region", { name: "Conversation thread" });
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect
		.poll(() => windowRequests.some((request) => request.mode === "initial"))
		.toBe(true);
	await expect
		.poll(() => page.evaluate(() => window.__transcriptTrace !== undefined))
		.toBe(true);
	await placeInHeavyRegion(scroller, page);
	const bounds = await scroller.boundingBox();
	if (!bounds) {
		throw new Error("Expected transcript scroll bounds");
	}
	const before = await scroller.evaluate((element) => element.scrollTop);
	await page.evaluate(() => {
		const trace = window.__transcriptTrace;
		if (!trace) {
			throw new Error("Transcript forensic ledger was not installed");
		}
		trace.reset();
		trace.beginRun("step-0-baseline-up", -1);
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Input.synthesizeScrollGesture", {
		gestureSourceType: "mouse",
		interactionMarkerName: "rudel-step-0-upward-fling",
		preventFling: false,
		speed: 3_500,
		x: Math.round(bounds.x + bounds.width / 2),
		xDistance: 0,
		y: Math.round(bounds.y + bounds.height / 2),
		yDistance: 5_000,
	});
	await page.waitForTimeout(750);
	const after = await scroller.evaluate((element) => element.scrollTop);
	const capture = await page.evaluate(() => {
		const trace = window.__transcriptTrace;
		if (!trace) {
			throw new Error("Transcript forensic ledger disappeared");
		}
		return { run: trace.endRun(), dump: trace.dump() };
	});
	await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
	await writeFile(
		`${ARTIFACT_DIRECTORY}/step-0-frame-ledger.json`,
		`${JSON.stringify(capture.dump, null, 2)}\n`,
		"utf8",
	);
	await page.screenshot({
		fullPage: false,
		path: `${ARTIFACT_DIRECTORY}/step-0-frame-ledger.png`,
	});

	expect(after).toBeLessThan(before);
	expect(capture.run.inputEventCount).toBeGreaterThan(0);
	expect(capture.run.frameCount).toBeGreaterThan(0);
	expect(capture.dump.adjustments.length).toBeGreaterThan(0);
	expect(capture.dump.measurements.length).toBeGreaterThan(0);
	expect(capture.dump.mounts.length).toBeGreaterThan(0);
	expect(capture.dump.suspectMeasures.length).toBeGreaterThan(0);
	expect(
		windowRequests.every(
			(request) => request.sessionId === SESSION_DETAIL_INTEGRATION_SESSION_ID,
		),
	).toBe(true);
});
