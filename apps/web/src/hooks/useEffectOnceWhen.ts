import { useEffect, useRef } from "react";

interface UseEffectOnceWhenOptions {
	effect: () => void;
	isReady: boolean;
	key: string | null;
}

// Many product events should fire once per resolved entity, not once per render.
// This tiny helper keeps that pattern obvious and reusable without scattering
// ad hoc refs through route components.
export function useEffectOnceWhen(options: UseEffectOnceWhenOptions) {
	const { effect, isReady, key } = options;
	const effectRef = useRef(effect);
	const trackedKeyRef = useRef<string | null>(null);

	// Keep the latest closure without re-running the effect for every render.
	effectRef.current = effect;

	useEffect(() => {
		// We only run after the caller says the preconditions are satisfied.
		if (!isReady || !key) {
			return;
		}

		// The key is the "already did this" identity. For wrapped flows that is a
		// share id, which makes the helper read naturally at the call site.
		if (trackedKeyRef.current === key) {
			return;
		}

		trackedKeyRef.current = key;
		effectRef.current();
	}, [isReady, key]);
}
