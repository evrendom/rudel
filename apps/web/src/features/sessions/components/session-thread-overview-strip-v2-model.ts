import type { SessionThreadOverviewChartRow } from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { getChartX } from "./session-thread-overview-strip-parts";

// Pure geometry for the output-focused strip variant: duration-width output
// bars, a stepped (stairs, not interpolated) translucent input area, and
// full-height per-turn category strips.

export type SessionOverviewTurnMarkKind = "edit" | "error" | "skill";

const MINIMUM_DURATION_BAR_WIDTH = 2;

export function getOutputMaximum(
	rows: readonly SessionThreadOverviewChartRow[],
) {
	return Math.max(0, ...rows.map((row) => row.outputTokens ?? 0));
}

export function getInputMaximum(
	rows: readonly SessionThreadOverviewChartRow[],
) {
	return Math.max(0, ...rows.map((row) => row.inputTokens ?? 0));
}

export function getDurationBarGeometry(
	row: SessionThreadOverviewChartRow,
	config: SessionThreadOverviewStripConfig,
) {
	const startX = getChartX(row.xStartRatio, config);
	const endX = getChartX(Math.max(row.xEndRatio, row.xStartRatio), config);
	const width = Math.max(endX - startX, MINIMUM_DURATION_BAR_WIDTH);
	return { width, x: startX };
}

// One strip per turn per category, independent of how often the category
// occurred within the turn.
export function getTurnMarkKinds(
	row: SessionThreadOverviewChartRow,
): readonly SessionOverviewTurnMarkKind[] {
	const kinds: SessionOverviewTurnMarkKind[] = [];
	if (row.skillCount > 0) {
		kinds.push("skill");
	}
	if (row.errorCount > 0) {
		kinds.push("error");
	}
	if (row.editCount > 0) {
		kinds.push("edit");
	}
	return kinds;
}

// "Aug 2 14:32:07" — the exact scrub position on the timescale.
export function formatTimelineMomentWithSeconds(timestampMs: number) {
	const date = new Date(timestampMs);
	const dateLabel = date.toLocaleDateString([], {
		day: "numeric",
		month: "short",
	});
	const clockLabel = date.toLocaleTimeString([], {
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		second: "2-digit",
	});
	return `${dateLabel} ${clockLabel}`;
}

// "+2h 13m" / "+45s" — elapsed since the session's first activity.
export function formatElapsedSinceStart(elapsedMs: number) {
	const totalSeconds = Math.max(Math.round(elapsedMs / 1_000), 0);
	if (totalSeconds < 60) {
		return `+${totalSeconds}s`;
	}
	const totalMinutes = Math.floor(totalSeconds / 60);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;
	const parts = [
		days > 0 ? `${days}d` : "",
		hours > 0 ? `${hours}h` : "",
		minutes > 0 ? `${minutes}m` : "",
	].filter(Boolean);
	return `+${parts.join(" ")}`;
}

function formatPathNumber(value: number) {
	const rounded = Number(value.toFixed(3));
	return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function getInputStairY(
	inputTokens: number | undefined,
	maximum: number,
	config: SessionThreadOverviewStripConfig,
) {
	if (inputTokens === undefined || maximum <= 0) {
		return config.axisY;
	}
	const ratio = Math.min(Math.max(inputTokens / maximum, 0), 1);
	return config.axisY - ratio * config.maxBarHeight;
}

// Builds the stepped input paths: the level holds from a turn's start until
// the next turn's start (last level extends to the turn's own end), producing
// stairs rather than a continuous line.
export function buildInputStairsPaths(
	rows: readonly SessionThreadOverviewChartRow[],
	maximum: number,
	config: SessionThreadOverviewStripConfig,
): { areaPath: string; linePath: string } {
	const measurableRows = rows.filter((row) => row.inputTokens !== undefined);
	const firstRow = measurableRows[0];
	if (!firstRow || maximum <= 0) {
		return { areaPath: "", linePath: "" };
	}

	const startX = getChartX(firstRow.xStartRatio, config);
	let linePath = `M ${formatPathNumber(startX)} ${formatPathNumber(
		getInputStairY(firstRow.inputTokens, maximum, config),
	)}`;

	for (let index = 1; index < measurableRows.length; index += 1) {
		const row = measurableRows[index];
		if (!row) {
			continue;
		}
		const stepX = getChartX(row.xStartRatio, config);
		const y = getInputStairY(row.inputTokens, maximum, config);
		linePath += ` H ${formatPathNumber(stepX)} V ${formatPathNumber(y)}`;
	}

	const lastRow = measurableRows.at(-1);
	const endX = lastRow
		? getChartX(Math.max(lastRow.xEndRatio, lastRow.xStartRatio), config)
		: startX;
	linePath += ` H ${formatPathNumber(endX)}`;

	const areaPath = `${linePath} V ${formatPathNumber(config.axisY)} H ${formatPathNumber(startX)} Z`;
	return { areaPath, linePath };
}
