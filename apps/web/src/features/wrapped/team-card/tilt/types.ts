import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

export type WrappedCardGyroscopeState =
	| "unavailable"
	| "idle"
	| "pending"
	| "active"
	| "blocked"
	| "error";

export interface WrappedGyroscopeBaseline {
	beta: number;
	gamma: number;
}

export interface WrappedCardTiltValues {
	glareOpacity: number;
	glareXPercent: number;
	glareYPercent: number;
	rotateXDegrees: number;
	rotateYDegrees: number;
	scale: number;
}

export interface WrappedCardTiltController {
	cardTiltRef: RefObject<HTMLElement | null>;
	enableGyroscope: () => Promise<void>;
	gyroscopeState: WrappedCardGyroscopeState;
	gyroscopeStatusMessage: string | null;
	handlePointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
	handlePointerLeave: () => void;
	handlePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
	isGyroscopePromptVisible: boolean;
	isGyroscopeSupported: boolean;
}
