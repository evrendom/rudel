function formatTimelineClock(timestamp: number) {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
	});
}

function formatTimelineFooterClock(timestamp: number, includeSeconds: boolean) {
	const date = new Date(timestamp);
	return includeSeconds
		? date.toLocaleTimeString("en-US", {
				hour: "numeric",
				hour12: true,
				minute: "2-digit",
				second: "2-digit",
			})
		: date.toLocaleTimeString("en-US", {
				hour: "numeric",
				hour12: true,
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

export function formatTimelineFooterTick(
	timestamp: number,
	firstTimestamp: number | undefined,
	rangeDurationMs: number,
) {
	const timeLabel = formatTimelineFooterClock(
		timestamp,
		rangeDurationMs < 10 * 60 * 1_000,
	);
	if (firstTimestamp === undefined) {
		return timeLabel;
	}
	const firstDate = new Date(firstTimestamp);
	const date = new Date(timestamp);
	const firstDay = Date.UTC(
		firstDate.getFullYear(),
		firstDate.getMonth(),
		firstDate.getDate(),
	);
	const currentDay = Date.UTC(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	);
	const dayOffset = Math.round(
		(currentDay - firstDay) / (24 * 60 * 60 * 1_000),
	);
	return dayOffset > 0 ? `${timeLabel} (+${dayOffset}d)` : timeLabel;
}
