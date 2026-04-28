import { useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";

export interface WrappedAuthViewportSize {
	height: number;
	width: number;
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
			setViewportSize(getWrappedAuthViewportSize());
		}

		window.addEventListener("resize", updateViewportSize);
		window.visualViewport?.addEventListener("resize", updateViewportSize);

		return () => {
			window.removeEventListener("resize", updateViewportSize);
			window.visualViewport?.removeEventListener("resize", updateViewportSize);
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
	if (typeof window === "undefined") {
		return WRAPPED_AUTH_DEFAULT_VIEWPORT_SIZE;
	}

	const viewport = window.visualViewport;

	return {
		height: viewport?.height ?? window.innerHeight,
		width: viewport?.width ?? window.innerWidth,
	};
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
