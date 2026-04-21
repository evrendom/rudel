import { useEffect, useRef } from "react";

interface UseEffectOnceWhenOptions {
	effect: () => void;
	isReady: boolean;
	key: string | null;
}

export function useEffectOnceWhen(options: UseEffectOnceWhenOptions) {
	const { effect, isReady, key } = options;
	const effectRef = useRef(effect);
	const trackedKeyRef = useRef<string | null>(null);

	effectRef.current = effect;

	useEffect(() => {
		if (!isReady || !key) {
			return;
		}

		if (trackedKeyRef.current === key) {
			return;
		}

		trackedKeyRef.current = key;
		effectRef.current();
	}, [isReady, key]);
}
