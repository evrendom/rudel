import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

export type WalkInCardGyroscopeState =
	| "unavailable"
	| "idle"
	| "pending"
	| "active"
	| "blocked"
	| "error";

export interface WalkInGyroscopeBaseline {
	beta: number;
	gamma: number;
}

export interface WalkInCardTiltValues {
	glareOpacity: number;
	glareXPercent: number;
	glareYPercent: number;
	rotateXDegrees: number;
	rotateYDegrees: number;
	scale: number;
}

export interface WalkInCardTiltController {
	cardTiltRef: RefObject<HTMLDivElement | null>;
	enableGyroscope: () => Promise<void>;
	gyroscopeState: WalkInCardGyroscopeState;
	gyroscopeStatusMessage: string | null;
	handlePointerLeave: () => void;
	handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
	isGyroscopePromptVisible: boolean;
	isGyroscopeSupported: boolean;
}
