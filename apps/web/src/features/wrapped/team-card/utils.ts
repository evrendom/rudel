export function getWrappedArchetypeIndex(index: number, count: number) {
	return ((index % count) + count) % count;
}

export function formatShareCardCreatedAt(date: Date) {
	return new Intl.DateTimeFormat("en-US", {
		month: "2-digit",
		day: "2-digit",
		year: "numeric",
	}).format(date);
}
