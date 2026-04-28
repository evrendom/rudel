import { type MutableRefObject, type RefObject, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { applyTilt, resetTilt } from "./dom";
import { buildGyroscopeTiltValues } from "./math";
import type {
	WrappedCardGyroscopeState,
	WrappedGyroscopeBaseline,
} from "./types";

interface UseWrappedCardGyroscopeParams {
	cardTiltRef: RefObject<HTMLElement | null>;
	pointerActiveRef: MutableRefObject<boolean>;
}

interface WrappedCardGyroscopeResult {
	clearGyroscopeBaseline: () => void;
	enableGyroscope: () => Promise<void>;
	gyroscopeState: WrappedCardGyroscopeState;
	gyroscopeStatusMessage: string | null;
	isGyroscopeActive: boolean;
	isGyroscopePromptVisible: boolean;
	isGyroscopeSupported: boolean;
	prefersReducedMotion: boolean;
}

export function useWrappedCardGyroscope(
	params: UseWrappedCardGyroscopeParams,
): WrappedCardGyroscopeResult {
	const { cardTiltRef, pointerActiveRef } = params;
	const gyroscopeBaselineRef = useRef<WrappedGyroscopeBaseline | null>(null);
	const [gyroscopeState, setGyroscopeState] =
		useState<WrappedCardGyroscopeState>("unavailable");
	const [needsGyroscopePermission, setNeedsGyroscopePermission] =
		useState(false);
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
	const gyroscopeStateRef = useRef<WrappedCardGyroscopeState>(gyroscopeState);
	const prefersReducedMotionRef = useRef(prefersReducedMotion);

	gyroscopeStateRef.current = gyroscopeState;
	prefersReducedMotionRef.current = prefersReducedMotion;

	useMountEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const syncMotionCapability = () => {
			const reduceMotion = motionQuery.matches;
			setPrefersReducedMotion(reduceMotion);

			if (reduceMotion) {
				setNeedsGyroscopePermission(false);
				setGyroscopeState("unavailable");
				resetTilt(cardTiltRef.current);
				return;
			}

			if (!("DeviceOrientationEvent" in window)) {
				setNeedsGyroscopePermission(false);
				setGyroscopeState("unavailable");
				return;
			}

			const requestPermission = getGyroscopePermissionRequester();
			setNeedsGyroscopePermission(Boolean(requestPermission));
			setGyroscopeState(requestPermission ? "idle" : "active");
		};

		const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
			if (
				prefersReducedMotionRef.current ||
				gyroscopeStateRef.current !== "active" ||
				pointerActiveRef.current
			) {
				gyroscopeBaselineRef.current = null;
				return;
			}

			if (event.beta === null || event.gamma === null) {
				return;
			}

			if (gyroscopeBaselineRef.current === null) {
				gyroscopeBaselineRef.current = {
					beta: event.beta,
					gamma: event.gamma,
				};
			}

			const baseline = gyroscopeBaselineRef.current;

			if (!baseline) {
				return;
			}

			applyTilt(
				cardTiltRef.current,
				buildGyroscopeTiltValues({
					baseline,
					beta: event.beta,
					gamma: event.gamma,
				}),
			);
		};

		syncMotionCapability();
		motionQuery.addEventListener("change", syncMotionCapability);
		window.addEventListener("deviceorientation", handleDeviceOrientation);

		return () => {
			motionQuery.removeEventListener("change", syncMotionCapability);
			window.removeEventListener("deviceorientation", handleDeviceOrientation);
			gyroscopeBaselineRef.current = null;

			if (!pointerActiveRef.current) {
				resetTilt(cardTiltRef.current);
			}
		};
	});

	async function enableGyroscope() {
		if (prefersReducedMotion || gyroscopeState === "pending") {
			return;
		}

		const requestPermission = getGyroscopePermissionRequester();

		if (!requestPermission) {
			gyroscopeBaselineRef.current = null;
			setGyroscopeState("active");
			return;
		}

		try {
			setGyroscopeState("pending");
			const permissionState = await requestPermission();

			if (permissionState === "granted") {
				gyroscopeBaselineRef.current = null;
				setGyroscopeState("active");
				return;
			}

			setGyroscopeState("blocked");
			resetTilt(cardTiltRef.current);
		} catch {
			setGyroscopeState("error");
			resetTilt(cardTiltRef.current);
		}
	}

	function clearGyroscopeBaseline() {
		gyroscopeBaselineRef.current = null;
	}

	return {
		clearGyroscopeBaseline,
		enableGyroscope,
		gyroscopeState,
		gyroscopeStatusMessage: getGyroscopeStatusMessage(gyroscopeState),
		isGyroscopeActive: gyroscopeState === "active",
		isGyroscopePromptVisible:
			!prefersReducedMotion &&
			needsGyroscopePermission &&
			gyroscopeState !== "active",
		isGyroscopeSupported:
			!prefersReducedMotion &&
			(needsGyroscopePermission || gyroscopeState === "active"),
		prefersReducedMotion,
	};
}

function getGyroscopePermissionRequester() {
	if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
		return undefined;
	}

	const orientationConstructor = Reflect.get(window, "DeviceOrientationEvent");
	const motionConstructor = Reflect.get(window, "DeviceMotionEvent");
	const orientationRequestPermission = Reflect.get(
		orientationConstructor,
		"requestPermission",
	);
	const motionRequestPermission = motionConstructor
		? Reflect.get(motionConstructor, "requestPermission")
		: undefined;

	if (
		typeof orientationRequestPermission !== "function" &&
		typeof motionRequestPermission !== "function"
	) {
		return undefined;
	}

	return requestGyroscopePermissions;
}

async function requestGyroscopePermissions() {
	const permissionResults = await Promise.all([
		requestSensorPermission("orientation"),
		requestSensorPermission("motion"),
	]);

	return permissionResults.every(
		(result: PermissionState) => result === "granted",
	)
		? "granted"
		: "denied";
}

function requestSensorPermission(sensorType: "motion" | "orientation") {
	if (sensorType === "orientation") {
		const orientationConstructor = Reflect.get(
			window,
			"DeviceOrientationEvent",
		);
		const requestPermission = Reflect.get(
			orientationConstructor,
			"requestPermission",
		);

		if (typeof requestPermission !== "function") {
			return Promise.resolve<PermissionState>("granted");
		}

		return requestPermission();
	}

	if (
		typeof window === "undefined" ||
		!("DeviceMotionEvent" in window) ||
		!Reflect.get(window, "DeviceMotionEvent")
	) {
		return Promise.resolve<PermissionState>("granted");
	}

	const motionConstructor = Reflect.get(window, "DeviceMotionEvent");
	const requestPermission = Reflect.get(motionConstructor, "requestPermission");

	if (typeof requestPermission !== "function") {
		return Promise.resolve<PermissionState>("granted");
	}

	return requestPermission();
}

function getGyroscopeStatusMessage(state: WrappedCardGyroscopeState) {
	if (state === "blocked") {
		return "Motion access was denied. Retry after allowing Motion & Orientation access in your browser settings.";
	}

	if (state === "error") {
		return "The browser rejected the motion request. Retry from the button on the phone.";
	}

	if (state === "active") {
		return "Gyroscope tilt is active.";
	}

	return null;
}
