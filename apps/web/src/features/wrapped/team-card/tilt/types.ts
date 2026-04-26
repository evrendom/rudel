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
	cardTiltRef: RefObject<HTMLDivElement | null>;
	enableGyroscope: () => Promise<void>;
	gyroscopeState: WrappedCardGyroscopeState;
	gyroscopeStatusMessage: string | null;
	handlePointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => void;
	handlePointerLeave: () => void;
	handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
	isGyroscopePromptVisible: boolean;
	isGyroscopeSupported: boolean;
}
