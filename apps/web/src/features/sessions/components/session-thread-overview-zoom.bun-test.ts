import { describe, expect, test } from "bun:test";
import { resolveSessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import {
	getChartRatioAtX,
	getChartX,
	getSessionOverviewViewportLayout,
} from "./session-thread-overview-strip-utils";
import {
	centerSessionOverviewZoomWindowAt,
	DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
	getSessionOverviewZoomLevel,
	getSessionOverviewZoomSelection,
	getSessionOverviewZoomWindowFollowingSelection,
	getSessionOverviewZoomWindowFromSelection,
	panSessionOverviewZoomWindow,
	SESSION_OVERVIEW_MAX_ZOOM_LEVEL,
	zoomSessionOverviewWindowAt,
} from "./session-thread-overview-zoom";

describe("session overview zoom window", () => {
	test("zooms toward the requested timeline point", () => {
		const zoomed = zoomSessionOverviewWindowAt(
			DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
			0.75,
			2,
		);

		expect(zoomed).toEqual({ xEndRatio: 0.875, xStartRatio: 0.375 });
		expect(getSessionOverviewZoomLevel(zoomed)).toBe(2);
	});

	test("normalizes a dragged selection in either direction", () => {
		expect(getSessionOverviewZoomSelection(0.8, 0.2)).toEqual({
			xEndRatio: 0.8,
			xStartRatio: 0.2,
		});
		expect(getSessionOverviewZoomSelection(-1, 2)).toEqual({
			xEndRatio: 1,
			xStartRatio: 0,
		});
	});

	test("turns a dragged selection into a bounded zoom window", () => {
		expect(
			getSessionOverviewZoomWindowFromSelection({
				xEndRatio: 0.75,
				xStartRatio: 0.25,
			}),
		).toEqual({ xEndRatio: 0.75, xStartRatio: 0.25 });

		const minimumWindow = getSessionOverviewZoomWindowFromSelection({
			xEndRatio: 0.5001,
			xStartRatio: 0.5,
		});
		expect(minimumWindow.xEndRatio - minimumWindow.xStartRatio).toBeCloseTo(
			1 / SESSION_OVERVIEW_MAX_ZOOM_LEVEL,
		);
	});

	test("caps zoom at the configured maximum", () => {
		const zoomed = zoomSessionOverviewWindowAt(
			DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
			0.5,
			1_000,
		);

		expect(zoomed.xEndRatio - zoomed.xStartRatio).toBe(
			1 / SESSION_OVERVIEW_MAX_ZOOM_LEVEL,
		);
		expect(getSessionOverviewZoomLevel(zoomed)).toBe(
			SESSION_OVERVIEW_MAX_ZOOM_LEVEL,
		);
	});

	test("brings an offscreen selected timestamp back before zooming", () => {
		const zoomed = zoomSessionOverviewWindowAt(
			{ xEndRatio: 0.75, xStartRatio: 0.5 },
			0.25,
			2,
		);

		expect(zoomed.xStartRatio).toBeCloseTo(0.1875);
		expect(zoomed.xEndRatio).toBeCloseTo(0.3125);
	});

	test("returns to the full timeline when zooming all the way out", () => {
		const zoomed = zoomSessionOverviewWindowAt(
			DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
			0.25,
			2,
		);
		expect(zoomSessionOverviewWindowAt(zoomed, 0.25, 0.01)).toEqual(
			DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
		);
	});

	test("pans a zoomed window horizontally and stops at timeline edges", () => {
		expect(
			panSessionOverviewZoomWindow(
				{ xEndRatio: 0.625, xStartRatio: 0.125 },
				0.2,
			),
		).toEqual({ xEndRatio: 0.825, xStartRatio: 0.325 });
		expect(
			panSessionOverviewZoomWindow(
				{ xEndRatio: 0.625, xStartRatio: 0.125 },
				-1,
			),
		).toEqual({ xEndRatio: 0.5, xStartRatio: 0 });
		expect(
			panSessionOverviewZoomWindow({ xEndRatio: 0.625, xStartRatio: 0.125 }, 1),
		).toEqual({ xEndRatio: 1, xStartRatio: 0.5 });
	});

	test("centers a zoomed window on the active transcript selection", () => {
		const centered = centerSessionOverviewZoomWindowAt(
			{ xEndRatio: 0.5, xStartRatio: 0 },
			0.7,
		);
		expect(centered.xStartRatio).toBeCloseTo(0.45);
		expect(centered.xEndRatio).toBeCloseTo(0.95);
		expect(
			centerSessionOverviewZoomWindowAt(
				{ xEndRatio: 0.5, xStartRatio: 0 },
				0.95,
			),
		).toEqual({ xEndRatio: 1, xStartRatio: 0.5 });
		expect(
			centerSessionOverviewZoomWindowAt(
				{ xEndRatio: 0.5, xStartRatio: 0.25 },
				0.6,
			),
		).toEqual(
			centerSessionOverviewZoomWindowAt(
				{ xEndRatio: 0.75, xStartRatio: 0.5 },
				0.6,
			),
		);
	});

	test("derives a followed window only when the selection changes", () => {
		const window = { xEndRatio: 0.75, xStartRatio: 0.25 };
		expect(
			getSessionOverviewZoomWindowFollowingSelection(window, 0.5, 0.5),
		).toBe(window);
		expect(
			getSessionOverviewZoomWindowFollowingSelection(window, 0.5, 0.8),
		).toEqual({ xEndRatio: 1, xStartRatio: 0.5 });
	});

	test("maps the visible domain through the shared chart coordinates", () => {
		const config = resolveSessionThreadOverviewStripConfig({
			chartWidth: 1_000,
			plotPadding: 10,
			xDomainEndRatio: 0.75,
			xDomainStartRatio: 0.25,
		});

		expect(getChartX(0.25, config)).toBe(10);
		expect(getChartX(0.5, config)).toBe(500);
		expect(getChartX(0.75, config)).toBe(990);
		expect(getChartX(0, config)).toBe(-480);
		expect(getChartRatioAtX(500, config)).toBe(0.5);
	});

	test("lets the transcript viewport box leave the strip when panned away", () => {
		const pannedConfig = resolveSessionThreadOverviewStripConfig({
			chartWidth: 1_000,
			plotPadding: 10,
			xDomainEndRatio: 1,
			xDomainStartRatio: 0.5,
		});
		const layout = getSessionOverviewViewportLayout(
			{ xEndRatio: 0.2, xStartRatio: 0.1 },
			pannedConfig,
		);

		expect(layout.viewportStartX).toBeLessThan(0);
		expect(layout.viewportStartX + layout.viewportWidth).toBeLessThan(0);
	});
});
