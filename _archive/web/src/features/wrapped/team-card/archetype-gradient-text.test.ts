import { describe, expect, it } from "vitest";
import { getWrappedArchetypeGradientTextValue } from "./archetype-gradient-text";

describe("getWrappedArchetypeGradientTextValue", () => {
	it("uses a carbon charcoal gradient for the Obsessed archetype text", () => {
		const gradient = getWrappedArchetypeGradientTextValue({
			classifierKey: "obsessed",
			displayLabel: "Obsessed",
			id: "obsessed",
			kind: "taxonomy",
			shellClassName: "bg-black",
			theme: "dark",
		});

		expect(gradient.direction).toBe("161.01deg");
		expect(gradient.accent).toContain("#323238");
		expect(gradient.accent).toContain("#3F3F45");
		expect(gradient.stops).toContain("#323238");
		expect(gradient.stops).toContain("#3F3F45");
	});
});
