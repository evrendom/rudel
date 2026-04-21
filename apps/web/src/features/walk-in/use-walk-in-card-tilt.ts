import {
	type PointerEvent as ReactPointerEvent,
	useRef,
} from "react";
import { applyTilt, resetTilt } from "@/features/walk-in/walk-in-card-tilt-dom";
import { buildPointerTiltValues } from "@/features/walk-in/walk-in-card-tilt-math";
import type { WalkInCardTiltController } from "@/features/walk-in/walk-in-card-tilt-types";
import { useWalkInCardGyroscope } from "@/features/walk-in/use-walk-in-card-gyroscope";

export type { WalkInCardTiltController } from "@/features/walk-in/walk-in-card-tilt-types";

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
