import { afterEach, describe, expect, it } from "vitest";
import { buildScaleRainBalls } from "./models/scale";
import {
	resolveWrappedMotionParticleCount,
	resolveWrappedMotionPerformanceProfile,
} from "./performance";

type NavigatorTestProperty =
	| "connection"
	| "deviceMemory"
	| "hardwareConcurrency";

interface NavigatorConnectionTestValue {
	effectiveType?: string;
	saveData?: boolean;
}

const navigatorDescriptors = new Map<
	NavigatorTestProperty,
	PropertyDescriptor | undefined
>();
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(
	window,
	"matchMedia",
);

afterEach(() => {
	for (const [property, descriptor] of navigatorDescriptors) {
		if (descriptor) {
			Object.defineProperty(window.navigator, property, descriptor);
		} else {
			Reflect.deleteProperty(window.navigator, property);
		}
	}

	navigatorDescriptors.clear();

	if (originalMatchMediaDescriptor) {
		Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
	} else {
		Reflect.deleteProperty(window, "matchMedia");
	}
});

describe("wrapped motion performance", () => {
	it("uses the full profile when device hints are unconstrained", () => {
		stubMatchMedia([]);
		stubNavigatorProperty("hardwareConcurrency", 8);
		stubNavigatorProperty("deviceMemory", 8);
		stubNavigatorConnection({ effectiveType: "4g", saveData: false });

		expect(resolveWrappedMotionPerformanceProfile()).toBe("full");
	});

	it("uses the constrained profile when reduced data is requested", () => {
		stubMatchMedia(["(prefers-reduced-data: reduce)"]);
		stubNavigatorProperty("hardwareConcurrency", 8);
		stubNavigatorProperty("deviceMemory", 8);
		stubNavigatorConnection({ effectiveType: "4g", saveData: false });

		expect(resolveWrappedMotionPerformanceProfile()).toBe("constrained");
	});

	it("uses the constrained profile when the device has a slow update cadence", () => {
		stubMatchMedia(["(update: slow)"]);
		stubNavigatorProperty("hardwareConcurrency", 8);
		stubNavigatorProperty("deviceMemory", 8);
		stubNavigatorConnection({ effectiveType: "4g", saveData: false });

		expect(resolveWrappedMotionPerformanceProfile()).toBe("constrained");
	});

	it("uses the constrained profile when data saver is enabled", () => {
		stubMatchMedia([]);
		stubNavigatorProperty("hardwareConcurrency", 8);
		stubNavigatorProperty("deviceMemory", 8);
		stubNavigatorConnection({ effectiveType: "4g", saveData: true });

		expect(resolveWrappedMotionPerformanceProfile()).toBe("constrained");
	});

	it("uses the constrained profile on slow effective connections", () => {
		stubMatchMedia([]);
		stubNavigatorProperty("hardwareConcurrency", 8);
		stubNavigatorProperty("deviceMemory", 8);
		stubNavigatorConnection({ effectiveType: "3g", saveData: false });

		expect(resolveWrappedMotionPerformanceProfile()).toBe("constrained");
	});

	it("uses the constrained profile on low-memory devices", () => {
		stubMatchMedia([]);
		stubNavigatorProperty("hardwareConcurrency", 8);
		stubNavigatorProperty("deviceMemory", 4);
		stubNavigatorConnection({ effectiveType: "4g", saveData: false });

		expect(resolveWrappedMotionPerformanceProfile()).toBe("constrained");
	});

	it("uses the constrained profile on low-core devices", () => {
		stubMatchMedia([]);
		stubNavigatorProperty("hardwareConcurrency", 4);
		stubNavigatorProperty("deviceMemory", 8);
		stubNavigatorConnection({ effectiveType: "4g", saveData: false });

		expect(resolveWrappedMotionPerformanceProfile()).toBe("constrained");
	});

	it("caps visual particles for constrained profiles", () => {
		expect(
			resolveWrappedMotionParticleCount({
				count: 900,
				maximumCount: 240,
				performanceProfile: "full",
			}),
		).toBe(240);
		expect(
			resolveWrappedMotionParticleCount({
				count: 900,
				maximumCount: 240,
				performanceProfile: "constrained",
			}),
		).toBe(100);
		expect(
			resolveWrappedMotionParticleCount({
				count: 900,
				maximumCount: 180,
				performanceProfile: "constrained",
			}),
		).toBe(100);
		expect(
			resolveWrappedMotionParticleCount({
				count: 1,
				maximumCount: 240,
				performanceProfile: "constrained",
			}),
		).toBe(1);
		expect(
			resolveWrappedMotionParticleCount({
				count: 0,
				maximumCount: 240,
				performanceProfile: "constrained",
			}),
		).toBe(0);
	});

	it("applies the constrained particle budget to scale rain balls", () => {
		expect(buildScaleRainBalls(1_000_000, "full")).toHaveLength(240);
		expect(buildScaleRainBalls(1_000_000, "constrained")).toHaveLength(100);
	});
});

function stubNavigatorConnection(connection: NavigatorConnectionTestValue) {
	stubNavigatorProperty("connection", connection);
}

function stubNavigatorProperty(
	property: NavigatorTestProperty,
	value: unknown,
) {
	if (!navigatorDescriptors.has(property)) {
		navigatorDescriptors.set(
			property,
			Object.getOwnPropertyDescriptor(window.navigator, property),
		);
	}

	Object.defineProperty(window.navigator, property, {
		configurable: true,
		value,
	});
}

function stubMatchMedia(matchingQueries: readonly string[]) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: (query: string) => ({
			addEventListener: () => {},
			addListener: () => {},
			dispatchEvent: () => false,
			matches: matchingQueries.includes(query),
			media: query,
			onchange: null,
			removeEventListener: () => {},
			removeListener: () => {},
		}),
	});
}
