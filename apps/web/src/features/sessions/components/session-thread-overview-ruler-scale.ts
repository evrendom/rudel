const SESSION_OVERVIEW_PROXIMITY_DISTANCE_LIMIT = 96;

export function transformSessionOverviewRulerScale(
	distance: number,
	intensity: number,
) {
	if (Math.abs(distance) > SESSION_OVERVIEW_PROXIMITY_DISTANCE_LIMIT) {
		return 1;
	}
	const normalizedDistance =
		1 - Math.abs(distance) / SESSION_OVERVIEW_PROXIMITY_DISTANCE_LIMIT;
	return 1 + intensity * normalizedDistance * normalizedDistance;
}
