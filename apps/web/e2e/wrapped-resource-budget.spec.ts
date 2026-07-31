import { type CDPSession, expect, type Page, test } from "@playwright/test";
import { WRAPPED_SHARE_RESOURCE_LIMITS } from "@rudel/api-routes";

interface PerformanceMetric {
	name: string;
	value: number;
}

interface ResourceMeasurements {
	callbacks: number[];
	layouts: number[];
	taskDurations: number[];
}

const VIEWPORT_CASES = [
	{
		name: "desktop",
		initial: { height: 720, width: 1280 },
		resized: { height: 840, width: 1200 },
	},
	{
		name: "phone",
		initial: { height: 844, width: 390 },
		resized: { height: 915, width: 412 },
	},
] as const;

const ITERATIONS_PER_VIEWPORT = 20;

test("caps public card DOM and observer work across repeated Google Chrome renders", async ({
	page,
}) => {
	test.setTimeout(120_000);

	await page.addInitScript(() => {
		const NativeResizeObserver = window.ResizeObserver;
		const activeObservers = new Map<object, Set<Element>>();
		let callbacks = 0;

		class WrappedResizeObserver implements ResizeObserver {
			private readonly nativeObserver: ResizeObserver;
			private readonly observedTargets = new Set<Element>();

			constructor(callback: ResizeObserverCallback) {
				this.nativeObserver = new NativeResizeObserver((entries) => {
					if (
						entries.some((entry) =>
							entry.target.matches(
								"[data-wrapped-stat-section], [data-wrapped-stat-tile]",
							),
						)
					) {
						callbacks += 1;
					}
					callback(entries, this);
				});
			}

			disconnect() {
				activeObservers.delete(this);
				this.observedTargets.clear();
				this.nativeObserver.disconnect();
			}

			observe(target: Element, options?: ResizeObserverOptions) {
				if (
					target.matches(
						"[data-wrapped-stat-section], [data-wrapped-stat-tile]",
					)
				) {
					this.observedTargets.add(target);
					activeObservers.set(this, this.observedTargets);
				}
				this.nativeObserver.observe(target, options);
			}

			unobserve(target: Element) {
				this.observedTargets.delete(target);
				this.nativeObserver.unobserve(target);
			}
		}

		window.ResizeObserver = WrappedResizeObserver;
		Object.defineProperty(window, "__wrappedObserverStats", {
			value: {
				get activeObserverCount() {
					return activeObservers.size;
				},
				get callbackCount() {
					return callbacks;
				},
				get observedTargetCount() {
					return [...activeObservers.values()].reduce(
						(count, targets) => count + targets.size,
						0,
					);
				},
			},
		});
	});

	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Performance.enable");

	for (const viewportCase of VIEWPORT_CASES) {
		const measurements: ResourceMeasurements = {
			callbacks: [],
			layouts: [],
			taskDurations: [],
		};

		for (let iteration = 1; iteration <= ITERATIONS_PER_VIEWPORT; iteration++) {
			await test.step(`${viewportCase.name} render ${iteration}`, async () => {
				await page.setViewportSize(viewportCase.initial);
				await page.goto("/dev/wrapped?stage=public&overStats=1", {
					waitUntil: "networkidle",
				});
				await page.evaluate(() => document.fonts.ready);

				const statTiles = page.locator("[data-wrapped-stat-tile]");
				await expect(statTiles).toHaveCount(
					WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount,
				);
				await expect(statTiles.first()).toBeVisible();
				await expect(statTiles.last()).toBeVisible();
				expect(await getStatTileRowCounts(page)).toEqual([2, 2, 2, 2]);

				const observerStats = await getObserverStats(page);

				expect(observerStats.activeObserverCount).toBe(1);
				expect(observerStats.callbackCount).toBeGreaterThan(0);
				expect(observerStats.observedTargetCount).toBe(
					WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount + 1,
				);

				const beforeResize = await getPerformanceMetrics(cdp);
				await page.setViewportSize(viewportCase.resized);
				await waitForTwoAnimationFrames(page);
				const afterResize = await getPerformanceMetrics(cdp);
				const afterResizeObserverStats = await getObserverStats(page);

				measurements.callbacks.push(
					afterResizeObserverStats.callbackCount - observerStats.callbackCount,
				);
				measurements.layouts.push(
					afterResize.LayoutCount - beforeResize.LayoutCount,
				);
				measurements.taskDurations.push(
					afterResize.TaskDuration - beforeResize.TaskDuration,
				);
			});
		}

		expect(percentile(measurements.callbacks, 95)).toBeLessThanOrEqual(4);
		expect(percentile(measurements.layouts, 95)).toBeLessThanOrEqual(8);
		expect(percentile(measurements.taskDurations, 95)).toBeLessThan(1);
	}
});

async function getStatTileRowCounts(page: Page) {
	return page.locator("[data-wrapped-stat-tile]").evaluateAll((tiles) => {
		const rows = new Map<number, number>();

		for (const tile of tiles) {
			const bounds = tile.getBoundingClientRect();
			if (bounds.width <= 0 || bounds.height <= 0) {
				throw new Error("Wrapped stat tile has no visible area");
			}

			const rowTop = Math.round(bounds.top);
			rows.set(rowTop, (rows.get(rowTop) ?? 0) + 1);
		}

		return [...rows.values()];
	});
}

async function getObserverStats(page: Page) {
	return page.evaluate(() => {
		const stats = (
			window as Window & {
				__wrappedObserverStats: {
					activeObserverCount: number;
					callbackCount: number;
					observedTargetCount: number;
				};
			}
		).__wrappedObserverStats;

		return {
			activeObserverCount: stats.activeObserverCount,
			callbackCount: stats.callbackCount,
			observedTargetCount: stats.observedTargetCount,
		};
	});
}

async function getPerformanceMetrics(cdp: CDPSession) {
	const result = await cdp.send("Performance.getMetrics");

	return {
		LayoutCount: getMetric(result.metrics, "LayoutCount"),
		TaskDuration: getMetric(result.metrics, "TaskDuration"),
	};
}

function getMetric(metrics: PerformanceMetric[], name: string) {
	const metric = metrics.find((candidate) => candidate.name === name);

	if (!metric) {
		throw new Error(`Chrome performance metric is missing: ${name}`);
	}

	return metric.value;
}

function percentile(values: number[], percentileValue: number) {
	const sortedValues = [...values].sort((first, second) => first - second);
	const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;

	return sortedValues[index];
}

async function waitForTwoAnimationFrames(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => resolve());
				});
			}),
	);
}
