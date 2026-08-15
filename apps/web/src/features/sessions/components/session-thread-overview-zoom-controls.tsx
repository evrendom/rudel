import { ZoomIn, ZoomOut } from "lucide-react";

const ZOOM_BUTTON_CLASS_NAME =
	"relative flex size-5 shrink-0 items-center justify-center rounded-sm border border-(--session-overview-border) bg-(--session-overview-surface) text-(--session-overview-muted) outline-none hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent) disabled:cursor-default disabled:opacity-35 disabled:hover:text-(--session-overview-muted)";

export function SessionThreadOverviewZoomControls({
	canZoomIn,
	canZoomOut,
	onZoomIn,
	onZoomOut,
	zoomLevel,
}: {
	canZoomIn: boolean;
	canZoomOut: boolean;
	onZoomIn: () => void;
	onZoomOut: () => void;
	zoomLevel: number;
}) {
	return (
		<fieldset className="m-0 flex shrink-0 items-center gap-1 border-0 p-0">
			<legend className="sr-only">
				Timeline zoom: {zoomLevel.toFixed(1)} times
			</legend>
			<button
				type="button"
				aria-label="Zoom out"
				className={ZOOM_BUTTON_CLASS_NAME}
				disabled={!canZoomOut}
				title="Zoom out"
				onClick={onZoomOut}
			>
				<ZoomOut aria-hidden="true" className="size-3.5" />
			</button>
			<button
				type="button"
				aria-label="Zoom in"
				className={ZOOM_BUTTON_CLASS_NAME}
				disabled={!canZoomIn}
				title="Zoom in"
				onClick={onZoomIn}
			>
				<ZoomIn aria-hidden="true" className="size-3.5" />
			</button>
		</fieldset>
	);
}
