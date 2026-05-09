export function formatRelativeTime(dateString: string): string {
	const normalizedDate = dateString.endsWith("Z")
		? dateString
		: `${dateString}Z`;
	const date = new Date(normalizedDate);
	const now = new Date();

	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) {
		return "just now";
	}
	if (diffMin < 60) {
		return `${diffMin}m ago`;
	}
	if (diffHour < 24) {
		return `${diffHour}h ago`;
	}
	if (diffDay < 7) {
		return `${diffDay}d ago`;
	}

	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}
