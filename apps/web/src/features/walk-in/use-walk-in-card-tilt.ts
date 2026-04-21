import {
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";

const ACTIVE_GLARE_OPACITY = 0.9;
const ACTIVE_SCALE = 1.018;
const MAX_GYRO_TILT_DEGREES = 9;
const MAX_POINTER_TILT_DEGREES = 8;
const RESTING_PORTRAIT_HIGHLIGHT_BLUR = "4px";
const RESTING_PORTRAIT_HIGHLIGHT_OPACITY = "0.52";
const RESTING_PORTRAIT_HIGHLIGHT_X = "0px";
const RESTING_PORTRAIT_HIGHLIGHT_Y = "4px";
const RESTING_PORTRAIT_SHADOW_BLUR = "4px";
const RESTING_PORTRAIT_SHADOW_OPACITY = "0.63";
const RESTING_PORTRAIT_SHADOW_X = "0px";
const RESTING_PORTRAIT_SHADOW_Y = "-4px";
const RESTING_STAT_GLOSS_ANGLE = "132deg";
const RESTING_STAT_MASK_X = "38%";
const RESTING_STAT_MASK_Y = "24%";

type WalkInCardGyroscopeState =
	| "unavailable"
	| "idle"
	| "pending"
	| "active"
	| "blocked"
	| "error";

interface WalkInGyroscopeBaseline {
	beta: number;
	gamma: number;
}

interface WalkInCardTiltValues {
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

export function useWalkInCardTilt(): WalkInCardTiltController {
	const cardTiltRef = useRef<HTMLDivElement | null>(null);
	const pointerActiveRef = useRef(false);
	const gyroscopeBaselineRef = useRef<WalkInGyroscopeBaseline | null>(null);
	const [gyroscopeState, setGyroscopeState] =
		useState<WalkInCardGyroscopeState>("unavailable");
	const [needsGyroscopePermission, setNeedsGyroscopePermission] =
		useState(false);
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
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

		syncMotionCapability();
		motionQuery.addEventListener("change", syncMotionCapability);

		return () => {
			motionQuery.removeEventListener("change", syncMotionCapability);
		};
	}, []);

	useEffect(() => {
		if (
			prefersReducedMotion ||
			gyroscopeState !== "active" ||
			typeof window === "undefined" ||
			!("DeviceOrientationEvent" in window)
		) {
			gyroscopeBaselineRef.current = null;
			return;
		}

		const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
			if (pointerActiveRef.current) {
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

			const rotateXDegrees = clamp(
				(baseline.beta - event.beta) * 0.35,
				-MAX_GYRO_TILT_DEGREES,
				MAX_GYRO_TILT_DEGREES,
			);
			const rotateYDegrees = clamp(
				(event.gamma - baseline.gamma) * 0.45,
				-MAX_GYRO_TILT_DEGREES,
				MAX_GYRO_TILT_DEGREES,
			);

			applyTilt(cardTiltRef.current, {
				glareOpacity: ACTIVE_GLARE_OPACITY,
				glareXPercent: mapTiltToPercent(rotateYDegrees, MAX_GYRO_TILT_DEGREES),
				glareYPercent: mapTiltToPercent(-rotateXDegrees, MAX_GYRO_TILT_DEGREES),
				rotateXDegrees,
				rotateYDegrees,
				scale: ACTIVE_SCALE,
			});
		};

		window.addEventListener("deviceorientation", handleDeviceOrientation);

		return () => {
			window.removeEventListener("deviceorientation", handleDeviceOrientation);
			gyroscopeBaselineRef.current = null;

			if (!pointerActiveRef.current) {
				resetTilt(cardTiltRef.current);
			}
		};
	}, [gyroscopeState, prefersReducedMotion]);

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

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (prefersReducedMotion || event.pointerType !== "mouse") {
			return;
		}

		pointerActiveRef.current = true;
		const bounds = event.currentTarget.getBoundingClientRect();
		const offsetX = (event.clientX - bounds.left) / bounds.width - 0.5;
		const offsetY = (event.clientY - bounds.top) / bounds.height - 0.5;
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

		applyTilt(cardTiltRef.current, {
			glareOpacity: ACTIVE_GLARE_OPACITY,
			glareXPercent: clamp((offsetX + 0.5) * 100, 8, 92),
			glareYPercent: clamp((offsetY + 0.5) * 100, 8, 92),
			rotateXDegrees,
			rotateYDegrees,
			scale: ACTIVE_SCALE,
		});
	}

	function handlePointerLeave() {
		pointerActiveRef.current = false;

		if (gyroscopeState === "active") {
			gyroscopeBaselineRef.current = null;
			return;
		}

		resetTilt(cardTiltRef.current);
	}

	return {
		cardTiltRef,
		enableGyroscope,
		gyroscopeState,
		gyroscopeStatusMessage: getGyroscopeStatusMessage(gyroscopeState),
		handlePointerLeave,
		handlePointerMove,
		isGyroscopePromptVisible:
			!prefersReducedMotion &&
			needsGyroscopePermission &&
			gyroscopeState !== "active",
		isGyroscopeSupported:
			!prefersReducedMotion &&
			(needsGyroscopePermission || gyroscopeState === "active"),
	};
}

function applyTilt(node: HTMLDivElement | null, values: WalkInCardTiltValues) {
	if (!node) {
		return;
	}

	const statGlossAngleDegrees =
		118 + values.rotateYDegrees * 4.2 - values.rotateXDegrees * 2.4;
	const statMaskXPercent = clamp(
		values.glareXPercent + values.rotateYDegrees,
		8,
		92,
	);
	const statMaskYPercent = clamp(
		values.glareYPercent - values.rotateXDegrees * 0.8,
		8,
		92,
	);
	const portraitShadowX = values.rotateYDegrees * 0.36;
	const portraitHighlightX = values.rotateYDegrees * 0.24;
	const portraitHighlightY = clamp(4 + values.rotateXDegrees * 0.28, 2, 7);
	const portraitShadowY = clamp(-4 + values.rotateXDegrees * 0.28, -7, -2);
	const portraitHighlightBlur = clamp(
		4 + Math.abs(values.rotateYDegrees) * 0.18,
		3,
		5.75,
	);
	const portraitShadowBlur = clamp(
		4 + Math.abs(values.rotateYDegrees) * 0.22,
		3,
		6.2,
	);
	const portraitHighlightOpacity = clamp(
		0.52 +
			values.rotateXDegrees * 0.03 -
			Math.abs(values.rotateYDegrees) * 0.006,
		0.32,
		0.82,
	);
	const portraitShadowOpacity = clamp(
		0.63 -
			values.rotateXDegrees * 0.034 +
			Math.abs(values.rotateYDegrees) * 0.01,
		0.4,
		0.94,
	);

	node.dataset.tiltActive = "true";
	node.style.setProperty(
		"--walk-in-card-tilt-glare-opacity",
		values.glareOpacity.toFixed(3),
	);
	node.style.setProperty(
		"--walk-in-card-tilt-glare-x",
		`${values.glareXPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--walk-in-card-tilt-glare-y",
		`${values.glareYPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--walk-in-card-tilt-rotate-x",
		`${values.rotateXDegrees.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--walk-in-card-tilt-rotate-y",
		`${values.rotateYDegrees.toFixed(2)}deg`,
	);
	node.style.setProperty("--walk-in-card-tilt-scale", values.scale.toFixed(3));
	node.style.setProperty(
		"--walk-in-card-stat-gloss-angle",
		`${statGlossAngleDegrees.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--walk-in-card-stat-mask-x",
		`${statMaskXPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--walk-in-card-stat-mask-y",
		`${statMaskYPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-x",
		`${portraitHighlightX.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-y",
		`${portraitHighlightY.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-blur",
		`${portraitHighlightBlur.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-opacity",
		portraitHighlightOpacity.toFixed(3),
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-x",
		`${portraitShadowX.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-y",
		`${portraitShadowY.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-blur",
		`${portraitShadowBlur.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-opacity",
		portraitShadowOpacity.toFixed(3),
	);
}

function resetTilt(node: HTMLDivElement | null) {
	if (!node) {
		return;
	}

	node.dataset.tiltActive = "false";
	node.style.setProperty("--walk-in-card-tilt-glare-opacity", "0");
	node.style.setProperty("--walk-in-card-tilt-glare-x", "50%");
	node.style.setProperty("--walk-in-card-tilt-glare-y", "18%");
	node.style.setProperty("--walk-in-card-tilt-rotate-x", "0deg");
	node.style.setProperty("--walk-in-card-tilt-rotate-y", "0deg");
	node.style.setProperty("--walk-in-card-tilt-scale", "1");
	node.style.setProperty(
		"--walk-in-card-stat-gloss-angle",
		RESTING_STAT_GLOSS_ANGLE,
	);
	node.style.setProperty("--walk-in-card-stat-mask-x", RESTING_STAT_MASK_X);
	node.style.setProperty("--walk-in-card-stat-mask-y", RESTING_STAT_MASK_Y);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-x",
		RESTING_PORTRAIT_HIGHLIGHT_X,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-y",
		RESTING_PORTRAIT_HIGHLIGHT_Y,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-blur",
		RESTING_PORTRAIT_HIGHLIGHT_BLUR,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-highlight-opacity",
		RESTING_PORTRAIT_HIGHLIGHT_OPACITY,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-x",
		RESTING_PORTRAIT_SHADOW_X,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-y",
		RESTING_PORTRAIT_SHADOW_Y,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-blur",
		RESTING_PORTRAIT_SHADOW_BLUR,
	);
	node.style.setProperty(
		"--walk-in-card-portrait-shadow-opacity",
		RESTING_PORTRAIT_SHADOW_OPACITY,
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function mapTiltToPercent(value: number, maxTiltDegrees: number) {
	return clamp(((value + maxTiltDegrees) / (maxTiltDegrees * 2)) * 100, 10, 90);
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

function getGyroscopeStatusMessage(state: WalkInCardGyroscopeState) {
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
