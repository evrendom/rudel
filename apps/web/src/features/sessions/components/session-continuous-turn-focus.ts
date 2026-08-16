export type ActiveTurnPosition = {
	isAtScrollEnd: boolean;
	isAtScrollStart: boolean;
	focusLine: number;
	sectionTops: readonly number[];
};

export function getActiveContinuousTurnIndex({
	isAtScrollEnd,
	isAtScrollStart,
	focusLine,
	sectionTops,
}: ActiveTurnPosition) {
	if (sectionTops.length === 0 || isAtScrollStart) {
		return 0;
	}

	if (isAtScrollEnd) {
		return sectionTops.length - 1;
	}

	let activeIndex = 0;
	for (const [index, sectionTop] of sectionTops.entries()) {
		if (sectionTop > focusLine) {
			break;
		}
		activeIndex = index;
	}

	return activeIndex;
}

export type ContinuousTurnViewportInput = ActiveTurnPosition & {
	sectionIndices?: readonly number[];
	viewportBottom: number;
	viewportTop: number;
};

export function getContinuousTurnViewport({
	sectionIndices,
	viewportBottom,
	viewportTop,
	...activeInput
}: ContinuousTurnViewportInput) {
	const activePosition = getActiveContinuousTurnIndex(activeInput);
	const visiblePositions: number[] = [];

	for (let index = 0; index < activeInput.sectionTops.length; index += 1) {
		const sectionTop =
			activeInput.sectionTops[index] ?? Number.POSITIVE_INFINITY;
		const nextSectionTop =
			activeInput.sectionTops[index + 1] ?? Number.POSITIVE_INFINITY;
		if (sectionTop < viewportBottom && nextSectionTop > viewportTop) {
			visiblePositions.push(index);
		}
	}

	const activeIndex = sectionIndices?.[activePosition] ?? activePosition;
	const firstVisiblePosition = visiblePositions[0] ?? activePosition;
	const lastVisiblePosition = visiblePositions.at(-1) ?? activePosition;

	return {
		activeIndex,
		activePosition,
		visibleRange: [
			sectionIndices?.[firstVisiblePosition] ?? firstVisiblePosition,
			sectionIndices?.[lastVisiblePosition] ?? lastVisiblePosition,
		] as const,
	};
}

export function getPrefetchedContinuousTurnIndices(
	visibleRange: readonly [number, number],
	count: number,
	radius: number,
) {
	const first = Math.max(0, visibleRange[0] - radius);
	const last = Math.min(count - 1, visibleRange[1] + radius);
	return Array.from(
		{ length: Math.max(0, last - first + 1) },
		(_, offset) => first + offset,
	);
}
