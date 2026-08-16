import { useEffect, useState } from "react";

type UseLoadMoreIntersectionObserverOptions = {
	enabled: boolean;
	onIntersect: () => void;
};

export function useLoadMoreIntersectionObserver({
	enabled,
	onIntersect,
}: UseLoadMoreIntersectionObserverOptions) {
	const [element, setElement] = useState<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!element || !enabled) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					onIntersect();
				}
			},
			{ rootMargin: "320px 0px" },
		);
		observer.observe(element);

		return () => observer.disconnect();
	}, [element, enabled, onIntersect]);

	return setElement;
}
