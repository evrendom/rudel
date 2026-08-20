import { useRef } from "react";

export function useSessionOverviewFilterWheelContainment() {
	const menuRef = useRef<HTMLDivElement>(null);
	const wheelHandlerRef = useRef((event: WheelEvent) => {
		const target = event.target;
		const scrollRegion =
			target instanceof Element
				? target.closest<HTMLElement>("[data-session-filter-scroll-region]")
				: null;

		event.stopPropagation();
		if (!scrollRegion) {
			event.preventDefault();
			return;
		}

		const hasVerticalOverflow =
			scrollRegion.scrollHeight > scrollRegion.clientHeight + 1;
		const isScrollingUp = event.deltaY < 0;
		const isScrollingDown = event.deltaY > 0;
		const isAtTop = scrollRegion.scrollTop <= 0;
		const isAtBottom =
			scrollRegion.scrollTop + scrollRegion.clientHeight >=
			scrollRegion.scrollHeight - 1;
		const isHorizontalGesture = Math.abs(event.deltaX) > Math.abs(event.deltaY);

		if (
			!hasVerticalOverflow ||
			isHorizontalGesture ||
			(isScrollingUp && isAtTop) ||
			(isScrollingDown && isAtBottom) ||
			(!isScrollingUp && !isScrollingDown)
		) {
			event.preventDefault();
		}
	});

	function setMenuElement(node: HTMLDivElement | null) {
		const previousNode = menuRef.current;
		if (previousNode === node) {
			return;
		}

		previousNode?.removeEventListener("wheel", wheelHandlerRef.current);
		menuRef.current = node;
		node?.addEventListener("wheel", wheelHandlerRef.current, {
			passive: false,
		});
	}

	return { menuRef, setMenuElement };
}
