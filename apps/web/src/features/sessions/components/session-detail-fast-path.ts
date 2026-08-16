export function resolveSessionDetailFastPath(value: string | undefined) {
	const normalized = value?.trim().toLowerCase();
	return normalized !== "0" && normalized !== "false";
}

export function isSessionDetailFastPathEnabled() {
	return resolveSessionDetailFastPath(
		import.meta.env.VITE_SESSION_DETAIL_FAST_PATH,
	);
}
