import {
	type CSSProperties,
	useCallback,
	useRef,
	useSyncExternalStore,
} from "react";
import {
	clampPaneSize,
	useElementWidth,
	useStoredPaneSize,
} from "@/components/ui/horizontal-resize-handle";

const TRIPTYCH_DESKTOP_QUERY = "(min-width: 64rem)";
const DEFAULT_SESSION_FACTS_PANE_WIDTH_PX = 304;
const MINIMUM_SESSION_FACTS_PANE_WIDTH_PX = 220;
const MAXIMUM_SESSION_FACTS_PANE_WIDTH_PX = 480;
const DEFAULT_TURN_RAIL_PANE_WIDTH_PX = 352;
const MINIMUM_TURN_RAIL_PANE_WIDTH_PX = 240;
const MAXIMUM_TURN_RAIL_PANE_WIDTH_PX = 640;
const MINIMUM_TURN_TABLE_PANE_WIDTH_PX = 320;
const MINIMUM_RESPONSE_PANE_WIDTH_PX = 320;
const RESIZE_HANDLE_WIDTH_PX = 2;
const SESSION_FACTS_PANE_STORAGE_KEY = "rudel:session-facts-pane-width:v1";
const TURN_RAIL_PANE_STORAGE_KEY = "rudel:session-turn-rail-pane-width:v1";

type TriptychGridStyle = CSSProperties & {
	"--session-facts-pane-width": string;
	"--session-turn-rail-pane-width": string;
};

export const TRIPTYCH_SESSION_IDS: ReadonlySet<string> = new Set([
	"ddaf8fcb-d80e-4413-90ae-77ef076a3520",
	"019f8eed-a304-7372-94ca-f181bd7dfe8f",
]);

function subscribeToTriptychViewport(callback: () => void) {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return () => undefined;
	}

	const mediaQuery = window.matchMedia(TRIPTYCH_DESKTOP_QUERY);
	mediaQuery.addEventListener("change", callback);
	return () => mediaQuery.removeEventListener("change", callback);
}

function getTriptychViewportSnapshot() {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia(TRIPTYCH_DESKTOP_QUERY).matches
	);
}

export function useTriptychDesktopLayout() {
	return useSyncExternalStore(
		subscribeToTriptychViewport,
		getTriptychViewportSnapshot,
		() => false,
	);
}

export function useSessionTriptychPaneSizing(isTurnTableExperiment: boolean) {
	const containerRef = useRef<HTMLDivElement>(null);
	const containerWidth = useElementWidth(containerRef);
	const [storedSessionFactsPaneWidth, setStoredSessionFactsPaneWidth] =
		useStoredPaneSize(
			SESSION_FACTS_PANE_STORAGE_KEY,
			DEFAULT_SESSION_FACTS_PANE_WIDTH_PX,
		);
	const [storedTurnRailPaneWidth, setStoredTurnRailPaneWidth] =
		useStoredPaneSize(
			TURN_RAIL_PANE_STORAGE_KEY,
			DEFAULT_TURN_RAIL_PANE_WIDTH_PX,
		);
	const secondaryPaneMinimum = isTurnTableExperiment
		? MINIMUM_TURN_TABLE_PANE_WIDTH_PX
		: MINIMUM_TURN_RAIL_PANE_WIDTH_PX;
	const sessionFactsPaneMaximum =
		containerWidth > 0
			? Math.min(
					MAXIMUM_SESSION_FACTS_PANE_WIDTH_PX,
					containerWidth -
						secondaryPaneMinimum -
						MINIMUM_RESPONSE_PANE_WIDTH_PX -
						RESIZE_HANDLE_WIDTH_PX * 2,
				)
			: MAXIMUM_SESSION_FACTS_PANE_WIDTH_PX;
	const sessionFactsPaneWidth = clampPaneSize(
		storedSessionFactsPaneWidth,
		MINIMUM_SESSION_FACTS_PANE_WIDTH_PX,
		sessionFactsPaneMaximum,
	);
	const turnRailPaneMaximum =
		containerWidth > 0
			? Math.min(
					MAXIMUM_TURN_RAIL_PANE_WIDTH_PX,
					containerWidth -
						sessionFactsPaneWidth -
						MINIMUM_RESPONSE_PANE_WIDTH_PX -
						RESIZE_HANDLE_WIDTH_PX * 2,
				)
			: MAXIMUM_TURN_RAIL_PANE_WIDTH_PX;
	const turnRailPaneWidth = clampPaneSize(
		storedTurnRailPaneWidth,
		MINIMUM_TURN_RAIL_PANE_WIDTH_PX,
		turnRailPaneMaximum,
	);
	const gridStyle: TriptychGridStyle = {
		"--session-facts-pane-width": `${sessionFactsPaneWidth}px`,
		"--session-turn-rail-pane-width": `${turnRailPaneWidth}px`,
	};
	const previewSessionFactsPaneWidth = useCallback((nextValue: number) => {
		containerRef.current?.style.setProperty(
			"--session-facts-pane-width",
			`${nextValue}px`,
		);
	}, []);
	const previewTurnRailPaneWidth = useCallback((nextValue: number) => {
		containerRef.current?.style.setProperty(
			"--session-turn-rail-pane-width",
			`${nextValue}px`,
		);
	}, []);

	return {
		containerRef,
		gridStyle,
		sessionFactsPane: {
			defaultValue: DEFAULT_SESSION_FACTS_PANE_WIDTH_PX,
			maximum: sessionFactsPaneMaximum,
			minimum: MINIMUM_SESSION_FACTS_PANE_WIDTH_PX,
			onValueChange: setStoredSessionFactsPaneWidth,
			onValuePreview: previewSessionFactsPaneWidth,
			value: sessionFactsPaneWidth,
		},
		turnRailPane: {
			defaultValue: DEFAULT_TURN_RAIL_PANE_WIDTH_PX,
			maximum: turnRailPaneMaximum,
			minimum: MINIMUM_TURN_RAIL_PANE_WIDTH_PX,
			onValueChange: setStoredTurnRailPaneWidth,
			onValuePreview: previewTurnRailPaneWidth,
			value: turnRailPaneWidth,
		},
	};
}
