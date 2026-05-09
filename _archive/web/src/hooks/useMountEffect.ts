import { useEffect, useRef } from "react";

export function useMountEffect(effect: () => undefined | (() => void)) {
	const effectRef = useRef(effect);
	effectRef.current = effect;

	useEffect(() => effectRef.current(), []);
}
