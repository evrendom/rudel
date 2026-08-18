import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { getChartX } from "./session-thread-overview-strip-utils";
import type { SessionOverviewZoomWindow } from "./session-thread-overview-zoom";

export function SessionOverviewZoomSelectionBand({
	config,
	selection,
}: {
	config: SessionThreadOverviewStripConfig;
	selection: SessionOverviewZoomWindow;
}) {
	const startX = getChartX(selection.xStartRatio, config);
	const endX = getChartX(selection.xEndRatio, config);
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-30 h-full w-full"
			preserveAspectRatio="none"
			viewBox={`0 0 ${config.chartWidth} ${config.chartHeight}`}
		>
			<rect
				className="fill-(--session-overview-muted)"
				data-session-overview-zoom-selection
				fillOpacity={0.5}
				height={config.chartHeight}
				stroke="none"
				width={Math.max(endX - startX, 0)}
				x={startX}
				y={0}
			/>
		</svg>
	);
}
