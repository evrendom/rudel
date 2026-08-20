import {
	type ChangeEvent,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import "./slider-range-input.css";

type RangeThumb = "maximum" | "minimum";
type RangeValue = readonly [minimum: number, maximum: number];

interface SliderRangeStyle extends CSSProperties {
	"--slider-range-handle"?: string;
	"--slider-range-maximum": string;
	"--slider-range-minimum": string;
	"--slider-range-progress-overlay"?: string;
	"--slider-range-track-background"?: string;
}

type SliderRangeInputProps = {
	className?: string;
	disabled?: boolean;
	formatValue?: (value: number) => string;
	max?: number;
	maximumAriaLabel: string;
	maximumLabel?: string;
	min?: number;
	minimumAriaLabel: string;
	minimumLabel?: string;
	onChange: (value: RangeValue) => void;
	onCommit: (value: RangeValue) => void;
	onInteractionEnd?: () => void;
	onInteractionStart?: () => void;
	progressOverlay?: string;
	step?: number;
	thumbColor?: string;
	trackBackground?: string;
	value: RangeValue;
};

const CLICK_THRESHOLD = 3;
const DEAD_ZONE = 8;
const MAX_CURSOR_RANGE = 160;
const MAX_STRETCH = 18;

export function SliderRangeInput({
	className,
	disabled,
	formatValue,
	max = 100,
	maximumAriaLabel,
	maximumLabel = "Max",
	min = 0,
	minimumAriaLabel,
	minimumLabel = "Min",
	onChange,
	onCommit,
	onInteractionEnd,
	onInteractionStart,
	progressOverlay,
	step = 1,
	thumbColor,
	trackBackground,
	value,
}: SliderRangeInputProps) {
	const normalizedValue = normalizeRange(value, min, max);
	const [draftValue, setDraftValue] = useState<RangeValue | null>(null);
	const [activeThumb, setActiveThumb] = useState<RangeThumb | null>(null);
	const [dragging, setDragging] = useState(false);
	const [focusedThumb, setFocusedThumb] = useState<RangeThumb | null>(null);
	const [hovered, setHovered] = useState(false);
	const [interacting, setInteracting] = useState(false);
	const [rubberStretch, setRubberStretch] = useState(0);
	const localValue = draftValue ?? normalizedValue;
	const localValueRef = useRef(localValue);
	localValueRef.current = localValue;
	const wrapperRef = useRef<HTMLFieldSetElement>(null);
	const minimumInputRef = useRef<HTMLInputElement>(null);
	const maximumInputRef = useRef<HTMLInputElement>(null);
	const pointerStateRef = useRef<{
		pointerId: number;
		thumb: RangeThumb;
	} | null>(null);
	const pointerDownPositionRef = useRef<{ x: number; y: number } | null>(null);
	const wrapperRectRef = useRef<DOMRect | null>(null);
	const scaleRef = useRef(1);
	const isClickRef = useRef(true);
	const keyboardDirtyRef = useRef(false);
	const rubberStretchRef = useRef(0);
	const rubberAnimationRef = useRef<(() => void) | null>(null);
	const minimumPercent = valueToPercent(localValue[0], min, max);
	const maximumPercent = valueToPercent(localValue[1], min, max);
	const active = hovered || focusedThumb !== null || interacting || dragging;
	const discreteSteps = (max - min) / step;
	const hashMarks =
		discreteSteps <= 10
			? Array.from(
					{ length: Math.max(Math.floor(discreteSteps) - 1, 0) },
					(_, index) => ((index + 1) / discreteSteps) * 100,
				)
			: Array.from({ length: 9 }, (_, index) => (index + 1) * 10);
	const rangeStyle: SliderRangeStyle = {
		"--slider-range-maximum": `${maximumPercent}%`,
		"--slider-range-minimum": `${minimumPercent}%`,
		...(trackBackground
			? { "--slider-range-track-background": trackBackground }
			: {}),
		...(progressOverlay
			? { "--slider-range-progress-overlay": progressOverlay }
			: {}),
		...(thumbColor ? { "--slider-range-handle": thumbColor } : {}),
		transform: `translateX(${rubberStretch < 0 ? rubberStretch : 0}px)`,
		width: `calc(100% + ${Math.abs(rubberStretch)}px)`,
	};

	useEffect(
		() => () => {
			rubberAnimationRef.current?.();
		},
		[],
	);

	function setRubberStretchNow(nextStretch: number) {
		const clampedStretch = clamp(nextStretch, -MAX_STRETCH, MAX_STRETCH);
		rubberStretchRef.current = clampedStretch;
		setRubberStretch(clampedStretch);
	}

	function positionToValue(clientX: number) {
		const rect = wrapperRectRef.current;
		const wrapper = wrapperRef.current;
		if (!(rect && wrapper && rect.width > 0)) {
			return localValueRef.current[0];
		}
		const screenX = clientX - rect.left;
		const sceneX = screenX / scaleRef.current;
		const nativeWidth = wrapper.offsetWidth || rect.width;
		const percent = clamp(sceneX / nativeWidth, 0, 1);
		return roundToStep(min + percent * (max - min), step, min, max);
	}

	function closestThumb(nextValue: number): RangeThumb {
		const currentValue = localValueRef.current;
		const minimumDistance = Math.abs(nextValue - currentValue[0]);
		const maximumDistance = Math.abs(nextValue - currentValue[1]);
		if (minimumDistance === maximumDistance) {
			return nextValue <= (currentValue[0] + currentValue[1]) / 2
				? "minimum"
				: "maximum";
		}
		return minimumDistance < maximumDistance ? "minimum" : "maximum";
	}

	function updateThumb(thumb: RangeThumb, nextValue: number) {
		const currentValue = localValueRef.current;
		const roundedValue = roundToStep(nextValue, step, min, max);
		const nextRange: RangeValue =
			thumb === "minimum"
				? [Math.min(roundedValue, currentValue[1]), currentValue[1]]
				: [currentValue[0], Math.max(roundedValue, currentValue[0])];
		if (rangesEqual(nextRange, currentValue)) {
			return currentValue;
		}
		localValueRef.current = nextRange;
		setDraftValue(nextRange);
		onChange(nextRange);
		return nextRange;
	}

	function computeRubberStretch(clientX: number, sign: number) {
		const rect = wrapperRectRef.current;
		if (!rect) {
			return 0;
		}
		const distancePast = sign < 0 ? rect.left - clientX : clientX - rect.right;
		const overflow = Math.max(0, distancePast - DEAD_ZONE);
		return (
			sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1))
		);
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLFieldSetElement>) {
		if (disabled) {
			return;
		}
		event.preventDefault();
		rubberAnimationRef.current?.();
		rubberAnimationRef.current = null;
		wrapperRectRef.current =
			wrapperRef.current?.getBoundingClientRect() ?? null;
		if (wrapperRef.current && wrapperRectRef.current) {
			scaleRef.current =
				wrapperRectRef.current.width / wrapperRef.current.offsetWidth;
		}
		const thumb = closestThumb(positionToValue(event.clientX));
		(thumb === "minimum" ? minimumInputRef : maximumInputRef).current?.focus({
			preventScroll: true,
		});
		event.currentTarget.setPointerCapture(event.pointerId);
		pointerStateRef.current = { pointerId: event.pointerId, thumb };
		pointerDownPositionRef.current = { x: event.clientX, y: event.clientY };
		isClickRef.current = true;
		setActiveThumb(thumb);
		setInteracting(true);
		onInteractionStart?.();
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLFieldSetElement>) {
		const pointerState = pointerStateRef.current;
		const pointerDownPosition = pointerDownPositionRef.current;
		if (
			!(
				pointerState &&
				pointerDownPosition &&
				pointerState.pointerId === event.pointerId
			)
		) {
			return;
		}
		event.preventDefault();
		const deltaX = event.clientX - pointerDownPosition.x;
		const deltaY = event.clientY - pointerDownPosition.y;
		if (
			isClickRef.current &&
			Math.sqrt(deltaX * deltaX + deltaY * deltaY) > CLICK_THRESHOLD
		) {
			isClickRef.current = false;
			setDragging(true);
		}
		if (isClickRef.current) {
			return;
		}
		const rect = wrapperRectRef.current;
		if (rect) {
			if (event.clientX < rect.left) {
				setRubberStretchNow(computeRubberStretch(event.clientX, -1));
			} else if (event.clientX > rect.right) {
				setRubberStretchNow(computeRubberStretch(event.clientX, 1));
			} else {
				setRubberStretchNow(0);
			}
		}
		updateThumb(pointerState.thumb, positionToValue(event.clientX));
	}

	function finishPointerInteraction(
		event: ReactPointerEvent<HTMLFieldSetElement>,
		cancelled: boolean,
	) {
		const pointerState = pointerStateRef.current;
		if (!(pointerState && pointerState.pointerId === event.pointerId)) {
			return;
		}
		if (!cancelled) {
			event.preventDefault();
		}
		releasePointerCapture(event);
		const nextRange = cancelled
			? localValueRef.current
			: updateThumb(pointerState.thumb, positionToValue(event.clientX));
		pointerStateRef.current = null;
		pointerDownPositionRef.current = null;
		wrapperRectRef.current = null;
		setActiveThumb(null);
		setDragging(false);
		setDraftValue(null);
		setInteracting(false);
		onInteractionEnd?.();
		if (rubberStretchRef.current !== 0) {
			rubberAnimationRef.current = animateSpringValue({
				damping: 8,
				from: rubberStretchRef.current,
				mass: 0.72,
				onComplete: () => {
					rubberAnimationRef.current = null;
				},
				onUpdate: setRubberStretchNow,
				stiffness: 230,
				to: 0,
			});
		}
		onCommit(nextRange);
	}

	function handleNativeChange(
		thumb: RangeThumb,
		event: ChangeEvent<HTMLInputElement>,
	) {
		if (!keyboardDirtyRef.current) {
			onInteractionStart?.();
		}
		keyboardDirtyRef.current = true;
		setActiveThumb(thumb);
		setInteracting(true);
		updateThumb(thumb, Number(event.target.value));
	}

	function commitKeyboardInteraction() {
		if (!keyboardDirtyRef.current) {
			return;
		}
		keyboardDirtyRef.current = false;
		setDraftValue(null);
		setInteracting(false);
		onInteractionEnd?.();
		onCommit(localValueRef.current);
	}

	function getHandleStyle(thumb: RangeThumb) {
		const isActiveThumb = activeThumb === thumb;
		return {
			opacity: isActiveThumb && dragging ? 0.9 : active ? 0.65 : 0.5,
			transform: `translate(-50%, -50%) scaleX(${active ? 1 : 0.25})`,
		};
	}

	return (
		<div className={cn("w-full", className)}>
			<fieldset
				aria-label={`${minimumAriaLabel} to ${maximumAriaLabel}`}
				className="slider-range-input-wrapper"
				data-active={active ? "true" : "false"}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				onPointerCancel={(event) => finishPointerInteraction(event, true)}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={(event) => finishPointerInteraction(event, false)}
				ref={wrapperRef}
			>
				<div
					aria-hidden="true"
					className="slider-range-input-strip"
					data-active={active ? "true" : "false"}
					data-disabled={disabled ? "true" : "false"}
					data-dragging={dragging ? "true" : "false"}
					style={rangeStyle}
				>
					<span className="slider-range-input-fill" />
					<span className="slider-range-input-hashmarks">
						{hashMarks.map((left) => (
							<span
								className="slider-range-input-hashmark"
								key={left}
								style={{ left: `${left}%` }}
							/>
						))}
					</span>
					<span
						className="slider-range-input-handle slider-range-input-handle-minimum"
						style={getHandleStyle("minimum")}
					/>
					<span
						className="slider-range-input-handle slider-range-input-handle-maximum"
						style={getHandleStyle("maximum")}
					/>
				</div>
				<div aria-hidden="true" className="slider-range-input-values">
					<span className="slider-range-input-label slider-range-input-label-minimum">
						<span>{minimumLabel}</span>
						<strong>{formatValue?.(localValue[0]) ?? localValue[0]}</strong>
					</span>
					<span className="slider-range-input-label slider-range-input-label-maximum">
						<span>{maximumLabel}</span>
						<strong>{formatValue?.(localValue[1]) ?? localValue[1]}</strong>
					</span>
				</div>
				<input
					aria-label={minimumAriaLabel}
					className="slider-range-input-native"
					disabled={disabled}
					max={localValue[1]}
					min={min}
					onBlur={() => {
						setFocusedThumb(null);
						commitKeyboardInteraction();
					}}
					onChange={(event) => handleNativeChange("minimum", event)}
					onFocus={() => setFocusedThumb("minimum")}
					onKeyUp={commitKeyboardInteraction}
					ref={minimumInputRef}
					step={step}
					type="range"
					value={localValue[0]}
				/>
				<input
					aria-label={maximumAriaLabel}
					className="slider-range-input-native"
					disabled={disabled}
					max={max}
					min={localValue[0]}
					onBlur={() => {
						setFocusedThumb(null);
						commitKeyboardInteraction();
					}}
					onChange={(event) => handleNativeChange("maximum", event)}
					onFocus={() => setFocusedThumb("maximum")}
					onKeyUp={commitKeyboardInteraction}
					ref={maximumInputRef}
					step={step}
					type="range"
					value={localValue[1]}
				/>
			</fieldset>
		</div>
	);
}

function animateSpringValue({
	damping,
	from,
	mass,
	onComplete,
	onUpdate,
	stiffness,
	to,
}: {
	damping: number;
	from: number;
	mass: number;
	onComplete?: () => void;
	onUpdate: (value: number) => void;
	stiffness: number;
	to: number;
}) {
	let frame = 0;
	let lastTime = performance.now();
	let position = from;
	let velocity = 0;
	let active = true;

	const tick = (time: number) => {
		if (!active) {
			return;
		}
		const delta = Math.min((time - lastTime) / 1000, 0.032);
		lastTime = time;
		const force = -stiffness * (position - to);
		const dampingForce = -damping * velocity;
		const acceleration = (force + dampingForce) / mass;
		velocity += acceleration * delta;
		position += velocity * delta;

		if (Math.abs(position - to) < 0.01 && Math.abs(velocity) < 0.01) {
			onUpdate(to);
			active = false;
			onComplete?.();
			return;
		}
		onUpdate(position);
		frame = requestAnimationFrame(tick);
	};

	frame = requestAnimationFrame(tick);
	return () => {
		active = false;
		cancelAnimationFrame(frame);
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function decimalsForStep(step: number) {
	const stepText = step.toString();
	if (stepText.includes("e-")) {
		return Number.parseInt(stepText.split("e-")[1] ?? "0", 10);
	}
	const decimalIndex = stepText.indexOf(".");
	return decimalIndex === -1 ? 0 : stepText.length - decimalIndex - 1;
}

function normalizeRange(
	value: RangeValue,
	min: number,
	max: number,
): RangeValue {
	const minimum = clamp(Number.isFinite(value[0]) ? value[0] : min, min, max);
	const maximum = clamp(Number.isFinite(value[1]) ? value[1] : max, min, max);
	return minimum <= maximum ? [minimum, maximum] : [maximum, minimum];
}

function rangesEqual(left: RangeValue, right: RangeValue) {
	return left[0] === right[0] && left[1] === right[1];
}

function releasePointerCapture(event: ReactPointerEvent<HTMLFieldSetElement>) {
	if (event.currentTarget.hasPointerCapture(event.pointerId)) {
		event.currentTarget.releasePointerCapture(event.pointerId);
	}
}

function roundToStep(value: number, step: number, min: number, max: number) {
	if (!(Number.isFinite(step) && step > 0)) {
		return clamp(value, min, max);
	}
	const rounded = min + Math.round((value - min) / step) * step;
	return Number.parseFloat(
		clamp(rounded, min, max).toFixed(decimalsForStep(step)),
	);
}

function valueToPercent(value: number, min: number, max: number) {
	return max <= min ? 0 : clamp(((value - min) / (max - min)) * 100, 0, 100);
}
