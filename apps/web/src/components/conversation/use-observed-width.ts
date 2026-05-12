import { useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";

export function useObservedWidth<TElement extends HTMLElement>() {
	const elementRef = useRef<TElement>(null);
	const [width, setWidth] = useState(400);

	useMountEffect(() => {
		const element = elementRef.current;
		if (!element) {
			return;
		}

		setWidth(element.getBoundingClientRect().width);

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				setWidth(entry.contentRect.width);
			}
		});

		observer.observe(element);
		return () => observer.disconnect();
	});

	return { elementRef, width };
}
