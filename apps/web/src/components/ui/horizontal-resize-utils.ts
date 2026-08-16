export function clampPaneSize(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
