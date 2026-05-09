import type { DashboardMetricId } from "@/features/dashboard/data/dashboard-static-data";

export interface DashboardMetricColorFamily {
	chartMain: string;
	seriesStrong: string;
	seriesSoft: string;
	seriesMid: string;
	cardSurface: string;
	cardBorder: string;
	cardShadow: string;
}

function createMetricColorFamily(hue: number): DashboardMetricColorFamily {
	return {
		chartMain: `oklch(0.628 0.201 ${hue})`,
		seriesStrong: `oklch(0.612 0.210 ${hue})`,
		seriesSoft: `oklch(0.833 0.083 ${hue})`,
		seriesMid: `oklch(0.720 0.145 ${hue})`,
		cardSurface: `oklch(0.968 0.018 ${hue} / 0.42)`,
		cardBorder: `oklch(0.812 0.062 ${hue} / 0.46)`,
		cardShadow: `oklch(0.628 0.201 ${hue} / 0.18)`,
	};
}

export const dashboardMetricColorFamilies = {
	output: createMetricColorFamily(273.8),
	quality: createMetricColorFamily(250),
	efficiency: createMetricColorFamily(145),
	speed: createMetricColorFamily(28),
	craft: createMetricColorFamily(72),
	consistency: createMetricColorFamily(205),
} satisfies Record<DashboardMetricId, DashboardMetricColorFamily>;
