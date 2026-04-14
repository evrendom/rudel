import type { Dispatch, SetStateAction } from "react";
import { startTransition, useEffect } from "react";

export function useSidebarDisplayModeSync({
	displayMode,
	isMobile,
	isSidebarExpanded,
	collapseDurationMs,
	setDisplayMode,
}: {
	displayMode: "expanded" | "collapsed";
	isMobile: boolean;
	isSidebarExpanded: boolean;
	collapseDurationMs: number;
	setDisplayMode: Dispatch<SetStateAction<"expanded" | "collapsed">>;
}) {
	useEffect(() => {
		if (isMobile || isSidebarExpanded) {
			setDisplayMode("expanded");
			return;
		}

		if (displayMode === "collapsed") {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			startTransition(() => {
				setDisplayMode("collapsed");
			});
		}, collapseDurationMs);

		return () => window.clearTimeout(timeoutId);
	}, [
		collapseDurationMs,
		displayMode,
		isMobile,
		isSidebarExpanded,
		setDisplayMode,
	]);
}
