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
	expect(capture.run.feelScore.maskedGapMs).toBeGreaterThanOrEqual(250);
	expect(capture.run.feelScore.trueBlankMs).toBe(0);
	expect(capture.dump.frames.every((frame) => frame.trueBlankPts === 0)).toBe(
		true,
	);
	expect(episode?.presentation).toBe("masked-gap");
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

test("the anchor journal attributes a synthetic main-thread stall", async ({
	page,
}) => {
	const anchorLogs: string[] = [];
	page.on("console", (message) => {
		const text = message.text();
		if (text.startsWith("[anchor ")) {
			anchorLogs.push(text);
		}
	});
	await page.goto(
		`${FIXTURE_ROUTE}?mode=continuous&transcript=virtual&turns=80`,
	);
	const scroller = page.locator("[data-trace-fixture-continuous-scroller]");
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect
		.poll(() => page.evaluate(() => window.__transcriptTrace !== undefined))
		.toBe(true);

	await page.evaluate(async () => {
		const trace = window.__transcriptTrace;
		if (!trace) {
			throw new Error("Transcript forensic ledger was not installed");
		}
		const jump = document.querySelector<HTMLButtonElement>(
			"[data-trace-fixture-jump-last]",
		);
		if (!jump) {
			throw new Error("Expected the jump-to-last fixture control");
		}
		trace.reset();
		jump.click();
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => {
				performance.mark("transcript:model-build:start");
				trace.blockMainThread(400);
				performance.mark("transcript:model-build:end");
				performance.measure(
					"transcript:model-build",
					"transcript:model-build:start",
					"transcript:model-build:end",
				);
				performance.clearMarks("transcript:model-build:start");
				performance.clearMarks("transcript:model-build:end");
				resolve();
			});
		});
	});

	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__transcriptAnchorJournal?.some(
						(entry) =>
							entry.type === "mainThreadStall" &&
							entry.attribution.includes("model-build") &&
							entry.durationMs > 250,
					) ?? false,
			),
		)
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__transcriptTrace
						?.dump()
						.suspectMeasures.some(
							(measure) =>
								measure.name === "model-build" && measure.duration > 250,
						) ?? false,
			),
		)
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					window.__transcriptAnchorJournal?.some(
						(entry) => entry.type === "pin:settle" && entry.starvedMs > 250,
					) ?? false,
			),
		)
		.toBe(true);
	expect(
		anchorLogs.some(
			(line) =>
				line.includes("MAIN THREAD STALL") && line.includes("model-build"),
		),
	).toBe(true);
});

test("collapsed code stays unmounted and expansion survives virtual row recycling", async ({
	page,
}) => {
	await page.goto(
		`${FIXTURE_ROUTE}?mode=continuous&transcript=virtual&folds=1`,
	);
	const scroller = page.locator("[data-trace-fixture-continuous-scroller]");
	await expect(scroller.locator("[data-transcript-virtual-list]")).toBeVisible({
		timeout: 15_000,
	});
	await expect
		.poll(() => page.evaluate(() => window.__transcriptTrace !== undefined))
		.toBe(true);
	await page.locator("[data-trace-fixture-jump-last]").evaluate((button) => {
		if (!(button instanceof HTMLButtonElement)) {
			throw new Error("Expected the jump-to-last fixture control");
		}
		button.click();
	});
	await expect
		.poll(() => scroller.evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);

	const toolToggle = scroller.getByRole("button", { name: /Read/ }).first();
	await expect(toolToggle).toHaveAttribute("aria-expanded", "false");
	await expect(scroller.locator("[data-trace-expanded-content]")).toHaveCount(
		0,
	);
	await expect(scroller.locator("[data-trace-code-block]")).toHaveCount(0);
	await waitForFrames(page, 12);
	const collapsedSyntaxHighlights = await page.evaluate(
		() =>
			window.__transcriptTrace
				?.dump()
				.suspectMeasures.filter(
					(measure) => measure.name === "syntax-highlight",
				).length ?? -1,
	);
	expect(collapsedSyntaxHighlights).toBe(0);

	const expansionId = await toolToggle.evaluate((button) => {
		const owner = button.closest<HTMLElement>("[data-trace-expansion-id]");
		if (!owner?.dataset.traceExpansionId) {
			throw new Error("Expected a stable expansion id on the tool row");
		}
		return owner.dataset.traceExpansionId;
	});
	const expansionOwner = scroller.locator(
		`[data-trace-expansion-id=${JSON.stringify(expansionId)}]`,
	);
	const stableToolToggle = expansionOwner.getByRole("button", { name: /Read/ });
	const scrollTopBeforeExpansion = await scroller.evaluate(
		(element) => element.scrollTop,
	);
	await scroller.evaluate((element) => {
		const observer = new MutationObserver(() => {
			if (element.querySelector('[data-trace-code-highlight-state="plain"]')) {
				element.setAttribute("data-test-observed-plain-code", "true");
				observer.disconnect();
			}
		});
		observer.observe(element, {
			attributeFilter: ["data-trace-code-highlight-state"],
			attributes: true,
			childList: true,
			subtree: true,
		});
	});
	await stableToolToggle.click();
	await expect(scroller).toHaveAttribute(
		"data-test-observed-plain-code",
		"true",
	);
	await expect(stableToolToggle).toHaveAttribute("aria-expanded", "true");
	await expect(scroller.locator("[data-trace-expanded-content]")).toHaveCount(
		1,
	);
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						window.__transcriptTrace
							?.dump()
							.suspectMeasures.filter(
								(measure) => measure.name === "syntax-highlight",
							).length ?? 0,
				),
			{ timeout: 15_000 },
		)
		.toBeGreaterThan(0);

	await scroller.evaluate((element) => {
		element.scrollTop = 0;
	});
	await expect(expansionOwner).toHaveCount(0);

	await scroller.evaluate((element, scrollTop) => {
		element.scrollTop = scrollTop;
	}, scrollTopBeforeExpansion);
	await expect(expansionOwner).toHaveCount(1);
	const restoredToolToggle = expansionOwner.getByRole("button", {
		name: /Read/,
	});
	await expect(restoredToolToggle).toHaveAttribute("aria-expanded", "true");
	await expect(scroller.locator("[data-trace-expanded-content]")).toHaveCount(
		1,
	);

	await restoredToolToggle.click();
	await expect(restoredToolToggle).toHaveAttribute("aria-expanded", "false");
	await expect(scroller.locator("[data-trace-expanded-content]")).toHaveCount(
		0,
	);
	const reasoningToggle = scroller
		.getByRole("button", { name: /Reasoning/ })
		.first();
	await expect(reasoningToggle).toHaveAttribute("aria-expanded", "false");
	const reasoningExpansionId = await reasoningToggle.evaluate((button) => {
		const owner = button.closest<HTMLElement>("[data-trace-expansion-id]");
		if (!owner?.dataset.traceExpansionId) {
			throw new Error("Expected a stable expansion id on the reasoning row");
		}
		return owner.dataset.traceExpansionId;
	});
	const stableReasoningToggle = scroller
		.locator(
			`[data-trace-expansion-id=${JSON.stringify(reasoningExpansionId)}]`,
		)
		.getByRole("button", { name: /Reasoning/ });
	await stableReasoningToggle.click();
	await expect(stableReasoningToggle).toHaveAttribute("aria-expanded", "true");
	await expect(scroller.locator("[data-trace-expanded-content]")).toHaveCount(
		1,
	);
	await stableReasoningToggle.click();
	await expect(stableReasoningToggle).toHaveAttribute("aria-expanded", "false");
	await expect(scroller.locator("[data-trace-expanded-content]")).toHaveCount(
		0,
	);
});
