import { type EffectCallback, useEffect, useRef } from "react";

export function useMountEffect(effect: EffectCallback) {
	const effectRef = useRef(effect);
	effectRef.current = effect;

	useEffect(() => effectRef.current(), []);
}
