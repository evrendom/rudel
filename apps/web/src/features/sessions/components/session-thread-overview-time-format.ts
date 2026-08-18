function formatTimelineClock(timestamp: number) {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
	});
}

export function formatTimelineMoment(timestamp: number) {
	const date = new Date(timestamp);
	return `${date.toLocaleDateString([], {
		day: "numeric",
		month: "short",
	})} ${formatTimelineClock(timestamp)}`;
}

function isSameCalendarDay(left: number, right: number) {
	const leftDate = new Date(left);
	const rightDate = new Date(right);
	return (
		leftDate.getFullYear() === rightDate.getFullYear() &&
		leftDate.getMonth() === rightDate.getMonth() &&
		leftDate.getDate() === rightDate.getDate()
	);
}

export function formatTimelineTick(
	timestamp: number,
	previousTimestamp: number | undefined,
) {
	const date = new Date(timestamp);
	const showDate =
		previousTimestamp === undefined ||
		!isSameCalendarDay(timestamp, previousTimestamp);
	if (!showDate) {
		return formatTimelineClock(timestamp);
	}

	const dateLabel = date.toLocaleDateString([], {
		day: "numeric",
		month: "short",
	});
	return date.getHours() === 0 && date.getMinutes() === 0
		? dateLabel
		: `${dateLabel} ${formatTimelineClock(timestamp)}`;
}
