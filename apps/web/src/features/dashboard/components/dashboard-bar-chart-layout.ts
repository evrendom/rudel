export function getDashboardBarSize(totalBars: number) {
	if (totalBars <= 7) {
		return 120;
	}

	if (totalBars <= 10) {
		return 108;
	}

	if (totalBars <= 14) {
		return 90;
	}

	if (totalBars <= 18) {
		return 78;
	}

	return 66;
}

export function getDashboardBarLabelWidth(
	totalBars: number,
	variant: "member" | "repository" = "member",
) {
	if (variant === "repository") {
		if (totalBars <= 7) {
			return 128;
		}

		if (totalBars <= 10) {
			return 104;
		}

		if (totalBars <= 14) {
			return 88;
		}

		return 76;
	}

	if (totalBars <= 7) {
		return 130;
	}

	if (totalBars <= 10) {
		return 108;
	}

	if (totalBars <= 14) {
		return 92;
	}

	return 80;
}
