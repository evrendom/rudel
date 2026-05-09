import { useTheme } from "next-themes";

const LIGHT_DEFAULTS = {
	tooltipBg: "#ffffff",
	tooltipBorder: "#DEDEDD",
	gridStroke: "#f0f0f0",
	axisStroke: "#73726C",
};

export function useChartTheme() {
	useTheme();

	if (typeof document === "undefined") {
		return LIGHT_DEFAULTS;
	}

	const styles = getComputedStyle(document.documentElement);

	return {
		tooltipBg:
			styles.getPropertyValue("--chart-tooltip-bg").trim() ||
			LIGHT_DEFAULTS.tooltipBg,
		tooltipBorder:
			styles.getPropertyValue("--chart-tooltip-border").trim() ||
			LIGHT_DEFAULTS.tooltipBorder,
		gridStroke:
			styles.getPropertyValue("--chart-grid").trim() ||
			LIGHT_DEFAULTS.gridStroke,
		axisStroke:
			styles.getPropertyValue("--chart-axis").trim() ||
			LIGHT_DEFAULTS.axisStroke,
	};
}
