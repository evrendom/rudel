import {
	ACTIVE_GLARE_OPACITY,
	ACTIVE_SCALE,
	MAX_GYRO_TILT_DEGREES,
	MAX_POINTER_TILT_DEGREES,
} from "@/features/walk-in/walk-in-card-tilt-constants";
import type {
	WalkInCardTiltValues,
	WalkInGyroscopeBaseline,
} from "@/features/walk-in/walk-in-card-tilt-types";

export function buildGyroscopeTiltValues(input: {
	baseline: WalkInGyroscopeBaseline;
	beta: number;
	gamma: number;
}): WalkInCardTiltValues {
	const { baseline, beta, gamma } = input;
	const rotateXDegrees = clamp(
		(baseline.beta - beta) * 0.35,
		-MAX_GYRO_TILT_DEGREES,
		MAX_GYRO_TILT_DEGREES,
	);
	const rotateYDegrees = clamp(
		(gamma - baseline.gamma) * 0.45,
		-MAX_GYRO_TILT_DEGREES,
		MAX_GYRO_TILT_DEGREES,
	);

	return {
		glareOpacity: ACTIVE_GLARE_OPACITY,
		glareXPercent: mapTiltToPercent(rotateYDegrees, MAX_GYRO_TILT_DEGREES),
		glareYPercent: mapTiltToPercent(-rotateXDegrees, MAX_GYRO_TILT_DEGREES),
		rotateXDegrees,
		rotateYDegrees,
		scale: ACTIVE_SCALE,
	};
}

export function buildPointerTiltValues(input: {
	clientX: number;
	clientY: number;
	height: number;
	left: number;
	top: number;
	width: number;
}): WalkInCardTiltValues {
	const { clientX, clientY, height, left, top, width } = input;
	const offsetX = (clientX - left) / width - 0.5;
	const offsetY = (clientY - top) / height - 0.5;
	const rotateXDegrees = clamp(
		-offsetY * MAX_POINTER_TILT_DEGREES * 2,
		-MAX_POINTER_TILT_DEGREES,
		MAX_POINTER_TILT_DEGREES,
	);
	const rotateYDegrees = clamp(
		offsetX * MAX_POINTER_TILT_DEGREES * 2,
		-MAX_POINTER_TILT_DEGREES,
		MAX_POINTER_TILT_DEGREES,
	);

	return {
		glareOpacity: ACTIVE_GLARE_OPACITY,
		glareXPercent: clamp((offsetX + 0.5) * 100, 8, 92),
		glareYPercent: clamp((offsetY + 0.5) * 100, 8, 92),
		rotateXDegrees,
		rotateYDegrees,
		scale: ACTIVE_SCALE,
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function mapTiltToPercent(value: number, maxTiltDegrees: number) {
	return clamp(((value + maxTiltDegrees) / (maxTiltDegrees * 2)) * 100, 10, 90);
}
