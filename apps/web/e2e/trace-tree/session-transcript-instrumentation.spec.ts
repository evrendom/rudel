import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { TranscriptForensicsController } from "../../src/features/sessions/components/transcript-forensics";

declare global {
	interface Window {
		__transcriptTrace?: TranscriptForensicsController;
	}
}

const FIXTURE_ROUTE = "/dev/trace-tree-fixture";
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

test("the causal ledger reconstructs a synthetic mid-fling blind window", async ({
	page,
}) => {
	await page.goto(
		`${FIXTURE_ROUTE}?mode=continuous&transcript=virtual&turns=80&profile=scroll`,
	);
	const scroller = page.locator("[data-trace-fixture-continuous-scroller]");
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect
		.poll(() => page.evaluate(() => window.__transcriptTrace !== undefined))
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__transcriptTrace
						?.dump()
						.rowPaints.some((paint) => paint.paintedAt !== null) ?? false,
			),
		)
		.toBe(true);
	await scroller.evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Transcript scroller must be an HTMLElement");
		}
		element.scrollTop = Math.round(
			(element.scrollHeight - element.clientHeight) * 0.25,
		);
	});
	await waitForFrames(page, 12);
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
		trace.beginRun("instrument-self-test", 1);
		void fetch(`/favicon-light.svg?transcriptInstrumentation=${Date.now()}`);
		window.setTimeout(() => {
			const resetPaints = document.querySelector<HTMLButtonElement>(
				"[data-trace-fixture-reset-row-paints]",
			);
			if (!resetPaints) {
				throw new Error("Expected the fixture paint reset hook");
			}
			resetPaints.click();
			trace.blockMainThread(300);
		}, 80);
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Input.synthesizeScrollGesture", {
		gestureSourceType: "mouse",
		interactionMarkerName: "rudel-instrument-self-test",
		preventFling: false,
		speed: 3_500,
		x: Math.round(bounds.x + bounds.width / 2),
		xDistance: 0,
		y: Math.round(bounds.y + bounds.height / 2),
		yDistance: -5_000,
	});
	await page.waitForTimeout(1_200);
	await cdp.detach();
	const capture = await page.evaluate(() => {
		const trace = window.__transcriptTrace;
		if (!trace) {
			throw new Error("Transcript forensic ledger disappeared");
		}
		const run = trace.endRun();
		return { dump: trace.dump(), run };
	});
	await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
	await writeFile(
		`${ARTIFACT_DIRECTORY}/step-0-causal-ledger-self-test.json`,
		`${JSON.stringify(capture, null, 2)}\n`,
		"utf8",
	);

	const blindWindow = capture.dump.blindWindows.find(
		(window) => window.durationMs >= 250 && window.durationMs <= 500,
	);
	expect(blindWindow).toBeDefined();
	const episode = capture.dump.blankEpisodes.find(
		(candidate) =>
			blindWindow !== undefined &&
			candidate.startedAt === blindWindow.startedAt,
	);
	expect(episode?.rowIds.length).toBeGreaterThan(0);
	expect(episode?.durationMs).toBeGreaterThanOrEqual(250);
	expect(episode?.durationMs).toBeLessThanOrEqual(500);
	expect(episode?.loafAttribution.length).toBeGreaterThan(0);
	expect(capture.run.feelScore.blankMs).toBeGreaterThanOrEqual(250);
	for (const rowId of episode?.rowIds ?? []) {
		expect(
			capture.dump.rowPaints.some(
				(paint) =>
					paint.rowId === rowId &&
					blindWindow !== undefined &&
					paint.paintedAt !== null &&
					paint.paintedAt > blindWindow.endedAt,
			),
		).toBe(true);
	}
	expect(capture.dump.longAnimationFrames.length).toBeGreaterThan(0);
	expect(capture.dump.reactCommits.length).toBeGreaterThan(0);
	expect(
		capture.dump.resources.some((resource) => resource.kind === "image"),
	).toBe(true);
	expect(capture.dump.wheelEventTimings.length).toBeGreaterThan(0);
	const stallFrames = capture.dump.flaggedFrames.filter(
		(frame) => frame.frameMs > 32,
	);
	expect(stallFrames.length).toBeGreaterThan(0);
	expect(
		stallFrames.every(
			(frame) => frame.anatomy.attributed && frame.anatomy.topCause !== null,
		),
	).toBe(true);
});
