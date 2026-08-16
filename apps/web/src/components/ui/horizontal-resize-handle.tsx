import {
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { clampPaneSize } from "./horizontal-resize-utils";

const KEYBOARD_RESIZE_STEP_PX = 1;
const KEYBOARD_RESIZE_LARGE_STEP_PX = 10;

export function useElementWidth<T extends HTMLElement>(
	ref: RefObject<T | null>,
) {
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}

		const measure = () => setWidth(element.getBoundingClientRect().width);
		measure();

		if (typeof ResizeObserver !== "function") {
			window.addEventListener("resize", measure);
			return () => window.removeEventListener("resize", measure);
		}

		const resizeObserver = new ResizeObserver(measure);
		resizeObserver.observe(element);
		return () => resizeObserver.disconnect();
	}, [ref]);

	return width;
}

export function useStoredPaneSize(storageKey: string, defaultValue: number) {
	const [value, setValue] = useState(() => {
		if (typeof window === "undefined") {
			return defaultValue;
		}

		try {
			const storedValue = Number(window.localStorage.getItem(storageKey));
			return Number.isFinite(storedValue) && storedValue > 0
				? storedValue
				: defaultValue;
		} catch {
			return defaultValue;
		}
	});

	const updateValue = useCallback(
		(nextValue: number) => {
			setValue(nextValue);
			try {
				window.localStorage.setItem(storageKey, String(nextValue));
			} catch {}
		},
		[storageKey],
	);

	return [value, updateValue] as const;
}

type HorizontalResizeHandleProps = {
	ariaLabel: string;
	className?: string;
	defaultValue: number;
	direction?: 1 | -1;
	maximum: number;
	minimum: number;
	onValueChange: (value: number) => void;
	onValuePreview?: (value: number) => void;
	value: number;
};

type ActiveDrag = {
	pointerId: number;
	startClientX: number;
	startValue: number;
	value: number;
};

export function HorizontalResizeHandle({
	ariaLabel,
	className,
	defaultValue,
	direction = 1,
	maximum,
	minimum,
	onValueChange,
	onValuePreview,
	value,
}: HorizontalResizeHandleProps) {
	const activeDragRef = useRef<ActiveDrag | null>(null);
	const previousDocumentStylesRef = useRef<{
		cursor: string;
		userSelect: string;
	} | null>(null);
	const [isResizing, setIsResizing] = useState(false);
	const boundedMaximum = Math.max(minimum, maximum);
	const boundedValue = clampPaneSize(value, minimum, boundedMaximum);

	const restoreDocumentStyles = useCallback(() => {
		const previousStyles = previousDocumentStylesRef.current;
		if (!previousStyles) {
			return;
		}

		document.documentElement.style.cursor = previousStyles.cursor;
		document.documentElement.style.userSelect = previousStyles.userSelect;
		previousDocumentStylesRef.current = null;
	}, []);

	useEffect(() => restoreDocumentStyles, [restoreDocumentStyles]);

	function finishResize(
		event: ReactPointerEvent<HTMLHRElement>,
		pointerId: number,
		commit: boolean,
	) {
		const activeDrag = activeDragRef.current;
		if (activeDrag?.pointerId !== pointerId) {
			return;
		}

		activeDragRef.current = null;
		setIsResizing(false);
		if (commit) {
			onValueChange(activeDrag.value);
		} else {
			onValuePreview?.(activeDrag.startValue);
			event.currentTarget.setAttribute(
				"aria-valuenow",
				String(Math.round(activeDrag.startValue)),
			);
			event.currentTarget.setAttribute(
				"aria-valuetext",
				`${Math.round(activeDrag.startValue)} pixels`,
			);
		}
		restoreDocumentStyles();
		if (event.currentTarget.hasPointerCapture?.(pointerId)) {
			event.currentTarget.releasePointerCapture(pointerId);
		}
	}

	return (
		<hr
			aria-label={ariaLabel}
			aria-orientation="vertical"
			aria-valuemax={Math.round(boundedMaximum)}
			aria-valuemin={Math.round(minimum)}
			aria-valuenow={Math.round(boundedValue)}
			aria-valuetext={`${Math.round(boundedValue)} pixels`}
			className={cn(
				"relative z-40 h-full w-0.5 shrink-0 self-stretch cursor-col-resize touch-none select-none border-0 bg-transparent outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-3 before:-translate-x-1/2 hover:bg-(--session-overview-accent) focus-visible:bg-(--session-overview-accent) data-[resizing=true]:bg-(--session-overview-accent)",
				className,
			)}
			data-resizing={isResizing}
			data-slot="horizontal-resize-handle"
			onDoubleClick={() => {
				const nextValue = clampPaneSize(defaultValue, minimum, boundedMaximum);
				onValuePreview?.(nextValue);
				onValueChange(nextValue);
			}}
			onKeyDown={(event) => {
				let nextValue: number | undefined;
				if (event.key === "Home") {
					nextValue = minimum;
				} else if (event.key === "End") {
					nextValue = boundedMaximum;
				} else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
					const step = event.shiftKey
						? KEYBOARD_RESIZE_LARGE_STEP_PX
						: KEYBOARD_RESIZE_STEP_PX;
					const horizontalDirection = event.key === "ArrowRight" ? 1 : -1;
					nextValue = boundedValue + horizontalDirection * direction * step;
				}

				if (nextValue === undefined) {
					return;
				}

				event.preventDefault();
				const boundedNextValue = clampPaneSize(
					nextValue,
					minimum,
					boundedMaximum,
				);
				onValuePreview?.(boundedNextValue);
				onValueChange(boundedNextValue);
			}}
			onLostPointerCapture={(event) =>
				finishResize(event, event.pointerId, true)
			}
			onPointerCancel={(event) => finishResize(event, event.pointerId, false)}
			onPointerDown={(event) => {
				if (event.button !== 0 || activeDragRef.current) {
					return;
				}

				event.preventDefault();
				activeDragRef.current = {
					pointerId: event.pointerId,
					startClientX: event.clientX,
					startValue: boundedValue,
					value: boundedValue,
				};
				previousDocumentStylesRef.current = {
					cursor: document.documentElement.style.cursor,
					userSelect: document.documentElement.style.userSelect,
				};
				document.documentElement.style.cursor = "col-resize";
				document.documentElement.style.userSelect = "none";
				event.currentTarget.setPointerCapture?.(event.pointerId);
				setIsResizing(true);
			}}
			onPointerMove={(event) => {
				const activeDrag = activeDragRef.current;
				if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
					return;
				}

				const delta = (event.clientX - activeDrag.startClientX) * direction;
				const nextValue = clampPaneSize(
					activeDrag.startValue + delta,
					minimum,
					boundedMaximum,
				);
				activeDrag.value = nextValue;
				onValuePreview?.(nextValue);
				event.currentTarget.setAttribute(
					"aria-valuenow",
					String(Math.round(nextValue)),
				);
				event.currentTarget.setAttribute(
					"aria-valuetext",
					`${Math.round(nextValue)} pixels`,
				);
			}}
			onPointerUp={(event) => finishResize(event, event.pointerId, true)}
			tabIndex={0}
			title="Drag to resize. Use arrow keys for 1 px steps, Shift for 10 px, or double-click to reset."
		/>
	);
}
