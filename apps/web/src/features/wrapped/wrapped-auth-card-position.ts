import { useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";

export interface WrappedAuthViewportSize {
	height: number;
	width: number;
}

interface WrappedAuthViewportMetrics extends WrappedAuthViewportSize {
	bottomOcclusion: number;
	isBottomOccluded: boolean;
	isInputFocused: boolean;
	isShortVisualViewport: boolean;
}

export interface WrappedAuthFormCardYValues {
	compact: number;
	medium: number;
	short: number;
	tall: number;
	wideTall: number;
}

const WRAPPED_AUTH_NARROW_DESKTOP_MIN_WIDTH = 1024;
const WRAPPED_AUTH_NARROW_DESKTOP_TARGET_WIDTH = 1077;
const WRAPPED_AUTH_NARROW_DESKTOP_FULL_WIDTH = 1120;
const WRAPPED_AUTH_NARROW_DESKTOP_MAX_WIDTH = 1200;
const WRAPPED_AUTH_SHORT_MAX_HEIGHT = 760;
const WRAPPED_AUTH_MEDIUM_MAX_HEIGHT = 820;
const WRAPPED_AUTH_TALL_TARGET_HEIGHT = 1025;
const WRAPPED_AUTH_PHONE_MAX_WIDTH = 768;
const WRAPPED_AUTH_KEYBOARD_SAFE_MAX_WIDTH =
	WRAPPED_AUTH_NARROW_DESKTOP_MIN_WIDTH;
const WRAPPED_AUTH_BOTTOM_OCCLUSION_THRESHOLD = 80;
const WRAPPED_AUTH_KEYBOARD_SCROLL_DELAYS_MS = [0, 120, 320] as const;
const WRAPPED_AUTH_FOCUSED_INPUT_SELECTOR =
	".mymind-wrapped-auth-form__input, .mymind-wrapped-auth-form input, .mymind-wrapped-auth-form textarea, .mymind-wrapped-auth-form select";

const WRAPPED_AUTH_DEFAULT_VIEWPORT_SIZE: WrappedAuthViewportSize = {
	height: WRAPPED_AUTH_MEDIUM_MAX_HEIGHT,
	width: WRAPPED_AUTH_NARROW_DESKTOP_MIN_WIDTH,
};

export const WRAPPED_AUTH_FORM_CARD_Y_DEFAULTS: WrappedAuthFormCardYValues = {
	compact: 0,
	medium: 0,
	short: -5,
	tall: 48,
	wideTall: 0,
};

export function useWrappedAuthViewportSize() {
	const [viewportSize, setViewportSize] = useState<WrappedAuthViewportSize>(
		() => getWrappedAuthViewportSize(),
	);

	useMountEffect(() => {
		function updateViewportSize() {
			const metrics = getWrappedAuthViewportMetrics();

			setViewportSize((currentViewportSize) => {
				if (
					currentViewportSize.height === metrics.height &&
					currentViewportSize.width === metrics.width
				) {
					return currentViewportSize;
				}

				return {
					height: metrics.height,
					width: metrics.width,
				};
			});
			applyWrappedAuthViewportMetrics(metrics);

			if (metrics.isInputFocused) {
				revealWrappedAuthFocusedInput();
			}
		}

		function updateViewportSizeAndRevealFocusedInput() {
			updateViewportSize();
			queueWrappedAuthFocusedInputReveal();
		}

		updateViewportSize();

		const visualViewport = window.visualViewport;

		window.addEventListener("resize", updateViewportSize);
		window.addEventListener("orientationchange", updateViewportSize);
		visualViewport?.addEventListener("resize", updateViewportSize);
		visualViewport?.addEventListener("scroll", updateViewportSize);
		document.addEventListener(
			"focusin",
			updateViewportSizeAndRevealFocusedInput,
		);
		document.addEventListener("focusout", updateViewportSize);

		return () => {
			window.removeEventListener("resize", updateViewportSize);
			window.removeEventListener("orientationchange", updateViewportSize);
			visualViewport?.removeEventListener("resize", updateViewportSize);
			visualViewport?.removeEventListener("scroll", updateViewportSize);
			document.removeEventListener(
				"focusin",
				updateViewportSizeAndRevealFocusedInput,
			);
			document.removeEventListener("focusout", updateViewportSize);
			clearWrappedAuthViewportMetrics();
		};
	});

	return viewportSize;
}

export function getWrappedAuthFormCardOffsetY(input: {
	values: WrappedAuthFormCardYValues;
	viewportSize: WrappedAuthViewportSize;
}) {
	const { height, width } = input.viewportSize;

	if (height <= 720) {
		return input.values.compact;
	}

	if (height <= WRAPPED_AUTH_SHORT_MAX_HEIGHT) {
		return input.values.short * getWrappedAuthNarrowDesktopWeight(width);
	}

	if (height <= WRAPPED_AUTH_MEDIUM_MAX_HEIGHT) {
		return input.values.medium;
	}

	if (width < WRAPPED_AUTH_NARROW_DESKTOP_MIN_WIDTH) {
		return 0;
	}

	const narrowDesktopWeight = getWrappedAuthNarrowDesktopWeight(width);
	const tallHeightWeight = getClampedProgress({
		max: WRAPPED_AUTH_TALL_TARGET_HEIGHT,
		min: WRAPPED_AUTH_MEDIUM_MAX_HEIGHT,
		value: height,
	});
	const tallOffset =
		input.values.tall * narrowDesktopWeight +
		input.values.wideTall * (1 - narrowDesktopWeight);

	return tallOffset * tallHeightWeight;
}

function getWrappedAuthViewportSize(): WrappedAuthViewportSize {
	const metrics = getWrappedAuthViewportMetrics();

	return {
		height: metrics.height,
		width: metrics.width,
	};
}

function getWrappedAuthViewportMetrics(): WrappedAuthViewportMetrics {
	if (typeof window === "undefined") {
		return {
			...WRAPPED_AUTH_DEFAULT_VIEWPORT_SIZE,
			bottomOcclusion: 0,
			isBottomOccluded: false,
			isInputFocused: false,
			isShortVisualViewport: false,
		};
	}

	const viewport = window.visualViewport;
	const height = viewport?.height ?? window.innerHeight;
	const width = viewport?.width ?? window.innerWidth;
	const bottomOcclusion = viewport
		? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
		: 0;
	const isKeyboardSafeViewport = isWrappedAuthKeyboardSafeViewport(width);
	const isPhoneViewport = isWrappedAuthPhoneViewport(width);

	return {
		bottomOcclusion,
		height,
		isBottomOccluded:
			isKeyboardSafeViewport &&
			bottomOcclusion >= WRAPPED_AUTH_BOTTOM_OCCLUSION_THRESHOLD,
		isInputFocused:
			isKeyboardSafeViewport &&
			isWrappedAuthInputFocused(document.activeElement),
		isShortVisualViewport: isPhoneViewport && height <= 720,
		width,
	};
}

function applyWrappedAuthViewportMetrics(metrics: WrappedAuthViewportMetrics) {
	document.body.style.setProperty(
		"--wrapped-live-viewport-height",
		`${Math.round(metrics.height)}px`,
	);
	document.body.style.setProperty(
		"--wrapped-visual-viewport-bottom-occlusion",
		`${Math.round(metrics.bottomOcclusion)}px`,
	);
	document.body.dataset.wrappedBottomOccluded = metrics.isBottomOccluded
		? "true"
		: "false";
	document.body.dataset.wrappedInputFocused = metrics.isInputFocused
		? "true"
		: "false";
	document.body.dataset.wrappedShortVisualViewport =
		metrics.isShortVisualViewport ? "true" : "false";
}

function clearWrappedAuthViewportMetrics() {
	document.body.style.removeProperty("--wrapped-live-viewport-height");
	document.body.style.removeProperty(
		"--wrapped-visual-viewport-bottom-occlusion",
	);
	delete document.body.dataset.wrappedBottomOccluded;
	delete document.body.dataset.wrappedInputFocused;
	delete document.body.dataset.wrappedShortVisualViewport;
}

function queueWrappedAuthFocusedInputReveal() {
	for (const delayMs of WRAPPED_AUTH_KEYBOARD_SCROLL_DELAYS_MS) {
		window.setTimeout(() => {
			revealWrappedAuthFocusedInput();
		}, delayMs);
	}
}

function revealWrappedAuthFocusedInput() {
	if (!isWrappedAuthKeyboardSafeViewport(getWrappedAuthVisualViewportWidth())) {
		return;
	}

	const activeElement = document.activeElement;

	if (!isWrappedAuthInputFocused(activeElement)) {
		return;
	}

	activeElement.scrollIntoView({
		behavior: "smooth",
		block: "center",
		inline: "nearest",
	});
}

function isWrappedAuthInputFocused(
	element: Element | null,
): element is HTMLElement {
	if (!(element instanceof HTMLElement)) {
		return false;
	}

	return (
		element.closest(".mymind-wrapped-route") !== null &&
		element.matches(WRAPPED_AUTH_FOCUSED_INPUT_SELECTOR)
	);
}

function getWrappedAuthVisualViewportWidth() {
	return window.visualViewport?.width ?? window.innerWidth;
}

function isWrappedAuthKeyboardSafeViewport(width: number) {
	return width < WRAPPED_AUTH_KEYBOARD_SAFE_MAX_WIDTH;
}

function isWrappedAuthPhoneViewport(width: number) {
	return width <= WRAPPED_AUTH_PHONE_MAX_WIDTH;
}

function getWrappedAuthNarrowDesktopWeight(width: number) {
	if (
		width < WRAPPED_AUTH_NARROW_DESKTOP_MIN_WIDTH ||
		width >= WRAPPED_AUTH_NARROW_DESKTOP_MAX_WIDTH
	) {
		return 0;
	}

	if (width < WRAPPED_AUTH_NARROW_DESKTOP_TARGET_WIDTH) {
		return getClampedProgress({
			max: WRAPPED_AUTH_NARROW_DESKTOP_TARGET_WIDTH,
			min: WRAPPED_AUTH_NARROW_DESKTOP_MIN_WIDTH,
			value: width,
		});
	}

	if (width <= WRAPPED_AUTH_NARROW_DESKTOP_FULL_WIDTH) {
		return 1;
	}

	return (
		1 -
		getClampedProgress({
			max: WRAPPED_AUTH_NARROW_DESKTOP_MAX_WIDTH,
			min: WRAPPED_AUTH_NARROW_DESKTOP_FULL_WIDTH,
			value: width,
		})
	);
}

function getClampedProgress(input: {
	max: number;
	min: number;
	value: number;
}) {
	const range = input.max - input.min;

	if (range <= 0) {
		return 0;
	}

	return Math.max(0, Math.min(1, (input.value - input.min) / range));
}
