import { useLayoutEffect, useRef } from "react";

const ACTIVITY_STRIP_INLINE_PADDING_FALLBACK_PX = 16;

export function useSessionDetailActivityStripWidth(
	onMinimumWidthChange: ((width: number) => void) | undefined,
) {
	const stripElementRef = useRef<HTMLElement>(null);
	const triggerListElementRef = useRef<HTMLUListElement>(null);

	useLayoutEffect(() => {
		const stripElement = stripElementRef.current;
		const triggerListElement = triggerListElementRef.current;
		if (!stripElement || !triggerListElement || !onMinimumWidthChange) {
			return;
		}

		const measure = () => {
			const stripStyle = window.getComputedStyle(stripElement);
			const measuredPadding =
				Number.parseFloat(stripStyle.paddingLeft) +
				Number.parseFloat(stripStyle.paddingRight);
			onMinimumWidthChange(
				triggerListElement.getBoundingClientRect().width +
					(Number.isFinite(measuredPadding)
						? measuredPadding
						: ACTIVITY_STRIP_INLINE_PADDING_FALLBACK_PX),
			);
		};

		measure();
		const resizeObserver = new ResizeObserver(measure);
		resizeObserver.observe(triggerListElement);
		return () => resizeObserver.disconnect();
	}, [onMinimumWidthChange]);

	return { stripElementRef, triggerListElementRef };
}
