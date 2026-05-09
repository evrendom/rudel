import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { applyTilt, resetTilt } from "./dom";
import { buildPointerTiltValues } from "./math";
import type { WrappedCardTiltController } from "./types";
import { useWrappedCardGyroscope } from "./use-card-gyroscope";

export type { WrappedCardTiltController } from "./types";

const POINTER_TILT_ACTIVATION_DISTANCE_PX = 2;

export function useWrappedCardTilt(): WrappedCardTiltController {
	const cardTiltRef = useRef<HTMLElement | null>(null);
	const pointerActivationOriginRef = useRef<{
		x: number;
		y: number;
	} | null>(null);
	const pointerActiveRef = useRef(false);
	const gyroscope = useWrappedCardGyroscope({
		cardTiltRef,
		pointerActiveRef,
	});

	function handlePointerEnter(event: ReactPointerEvent<HTMLElement>) {
		if (gyroscope.prefersReducedMotion || event.pointerType !== "mouse") {
			return;
		}

		pointerActivationOriginRef.current = {
			x: event.clientX,
			y: event.clientY,
		};
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
		if (gyroscope.prefersReducedMotion || event.pointerType !== "mouse") {
			return;
		}

		const activationOrigin = pointerActivationOriginRef.current;
		if (!activationOrigin && !pointerActiveRef.current) {
			pointerActivationOriginRef.current = {
				x: event.clientX,
				y: event.clientY,
			};
			return;
		}

		if (activationOrigin) {
			const movedDistance = Math.hypot(
				event.clientX - activationOrigin.x,
				event.clientY - activationOrigin.y,
			);

			if (movedDistance < POINTER_TILT_ACTIVATION_DISTANCE_PX) {
				return;
			}

			pointerActivationOriginRef.current = null;
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
		pointerActivationOriginRef.current = null;
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
		handlePointerEnter,
		handlePointerLeave,
		handlePointerMove,
		isGyroscopePromptVisible: gyroscope.isGyroscopePromptVisible,
		isGyroscopeSupported: gyroscope.isGyroscopeSupported,
	};
}
