const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const WHEEL_LINE_HEIGHT_PX = 16;

type ContainedWheelScrollInput = {
	clientHeight: number;
	clientWidth: number;
	deltaMode: number;
	deltaX: number;
	deltaY: number;
	scrollHeight: number;
	scrollLeft: number;
	scrollTop: number;
	scrollWidth: number;
};

type ContainedWheelScroll = {
	left: number;
	shouldContain: boolean;
	top: number;
};

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), maximum);
}

function normalizeWheelDelta(
	delta: number,
	deltaMode: number,
	pageSize: number,
) {
	if (deltaMode === WHEEL_DELTA_LINE) {
		return delta * WHEEL_LINE_HEIGHT_PX;
	}

	if (deltaMode === WHEEL_DELTA_PAGE) {
		return delta * pageSize;
	}

	return delta;
}

export function getContainedWheelScroll({
	clientHeight,
	clientWidth,
	deltaMode,
	deltaX,
	deltaY,
	scrollHeight,
	scrollLeft,
	scrollTop,
	scrollWidth,
}: ContainedWheelScrollInput): ContainedWheelScroll {
	const maximumLeft = Math.max(scrollWidth - clientWidth, 0);
	const maximumTop = Math.max(scrollHeight - clientHeight, 0);
	const boundedLeft = clamp(scrollLeft, 0, maximumLeft);
	const boundedTop = clamp(scrollTop, 0, maximumTop);
	const requestedLeft =
		boundedLeft + normalizeWheelDelta(deltaX, deltaMode, clientWidth);
	const requestedTop =
		boundedTop + normalizeWheelDelta(deltaY, deltaMode, clientHeight);
	const left = clamp(requestedLeft, 0, maximumLeft);
	const top = clamp(requestedTop, 0, maximumTop);

	return {
		left,
		shouldContain:
			scrollLeft !== boundedLeft ||
			scrollTop !== boundedTop ||
			left !== requestedLeft ||
			top !== requestedTop,
		top,
	};
}
