export function shortenWrappedRepoLabelFromLeft(
	label: string,
	maxLength: number,
) {
	if (label.length <= maxLength) {
		return label;
	}

	if (maxLength <= 3) {
		return label.slice(-maxLength);
	}

	const slashSegments = label.split("/").filter(Boolean);
	const trailingPair = slashSegments.slice(-2).join("/");

	if (trailingPair.length > 0 && trailingPair.length + 4 <= maxLength) {
		return `.../${trailingPair}`;
	}

	const trailingSegment = slashSegments.at(-1);

	if (trailingSegment && trailingSegment.length + 4 <= maxLength) {
		return `.../${trailingSegment}`;
	}

	return `...${label.slice(-(maxLength - 3))}`;
}
