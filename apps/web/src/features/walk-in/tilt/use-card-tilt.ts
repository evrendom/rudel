import {
	type PointerEvent as ReactPointerEvent,
	useRef,
} from "react";
import { applyTilt, resetTilt } from "./dom";
import { buildPointerTiltValues } from "./math";
import type { WalkInCardTiltController } from "./types";
import { useWalkInCardGyroscope } from "./use-card-gyroscope";

export type { WalkInCardTiltController } from "./types";

export function useWalkInCardTilt(): WalkInCardTiltController {
	const cardTiltRef = useRef<HTMLDivElement | null>(null);
	const pointerActiveRef = useRef(false);
	const gyroscope = useWalkInCardGyroscope({
		cardTiltRef,
		pointerActiveRef,
	});

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (gyroscope.prefersReducedMotion || event.pointerType !== "mouse") {
			return;
		}

		pointerActiveRef.current = true;
		const bounds = event.currentTarget.getBoundingClientRect();
		applyTilt(
			cardTiltRef.current,
			buildPointerTiltValues({
				clientX: event.clientX,
				clientY: event.clientY,
				height: bounds.height,
				left: bounds.left,
				top: bounds.top,
				width: bounds.width,
			}),
		);
	}

	function handlePointerLeave() {
		pointerActiveRef.current = false;

		if (gyroscope.isGyroscopeActive) {
			gyroscope.clearGyroscopeBaseline();
			return;
		}

		resetTilt(cardTiltRef.current);
	}

	return {
		cardTiltRef,
		enableGyroscope: gyroscope.enableGyroscope,
		gyroscopeState: gyroscope.gyroscopeState,
		gyroscopeStatusMessage: gyroscope.gyroscopeStatusMessage,
		handlePointerLeave,
		handlePointerMove,
		isGyroscopePromptVisible: gyroscope.isGyroscopePromptVisible,
		isGyroscopeSupported: gyroscope.isGyroscopeSupported,
	};
}
