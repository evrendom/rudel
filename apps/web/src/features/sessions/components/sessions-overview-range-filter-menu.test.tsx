import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SessionOverviewRangeFilterPanel } from "./sessions-overview-range-filter-menu";
import type { SessionOverviewRangeFilter } from "./sessions-overview-table-utils";

describe("SessionOverviewRangeFilterPanel", () => {
	it("uses one fixed-scale range with two strictly constrained handles", () => {
		render(<RangeFilterHarness />);
		const minimum = screen.getByRole("slider", { name: "Minimum Errors" });
		const maximum = screen.getByRole("slider", { name: "Maximum Errors" });

		expect(document.querySelectorAll(".slider-range-input-strip")).toHaveLength(
			1,
		);
		expect(
			document.querySelectorAll(".slider-range-input-handle"),
		).toHaveLength(2);
		expect(getRangePercent(minimum, "minimum")).toBe("20%");
		expect(getRangePercent(maximum, "maximum")).toBe("80%");
		expect(minimum).toHaveAttribute("max", "8");
		expect(maximum).toHaveAttribute("min", "2");

		fireEvent.change(minimum, { target: { value: "4" } });

		expect(getRangePercent(minimum, "minimum")).toBe("40%");
		expect(getRangePercent(maximum, "maximum")).toBe("80%");
		expect(maximum).toHaveAttribute("min", "4");

		fireEvent.change(maximum, { target: { value: "6" } });

		expect(getRangePercent(minimum, "minimum")).toBe("40%");
		expect(getRangePercent(maximum, "maximum")).toBe("60%");
		expect(minimum).toHaveAttribute("max", "6");
	});
});

function RangeFilterHarness() {
	const [value, setValue] = useState<SessionOverviewRangeFilter>({
		maximum: 8,
		minimum: 2,
	});

	return (
		<SessionOverviewRangeFilterPanel
			bounds={{ maximum: 10, minimum: 0, step: 1 }}
			formatValue={(nextValue) => nextValue.toLocaleString()}
			label="Errors"
			onChange={setValue}
			value={value}
		/>
	);
}

function getRangePercent(input: HTMLElement, bound: "maximum" | "minimum") {
	return input.parentElement
		?.querySelector<HTMLElement>(".slider-range-input-strip")
		?.style.getPropertyValue(`--slider-range-${bound}`);
}
