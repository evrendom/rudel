import { type EffectCallback, useEffect, useEffectEvent } from "react";

export function useMountEffect(effect: EffectCallback) {
	const onMount = useEffectEvent(effect);

	useEffect(() => onMount(), []);
}
