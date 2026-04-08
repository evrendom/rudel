import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const LIGHT_DEFAULTS = {
	tooltipBg: "#ffffff",
	tooltipBorder: "#DEDEDD",
	gridStroke: "#f0f0f0",
	axisStroke: "#73726C",
};

export function useChartTheme() {
	const { resolvedTheme: _resolvedTheme } = useTheme();
	const [chartTheme, setChartTheme] = useState(LIGHT_DEFAULTS);

	useEffect(() => {
		const styles = getComputedStyle(document.documentElement);
		setChartTheme({
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
		});
	}, []);

	return chartTheme;
}
