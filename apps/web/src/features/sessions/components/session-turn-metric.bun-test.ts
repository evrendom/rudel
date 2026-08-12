import { describe, expect, test } from "bun:test";
import {
	formatSessionTurnMetricValue,
	getSessionTurnMetricValue,
} from "./session-turn-metric";
import { createSessionTurnV2TestOption } from "./session-turn-v2-test-fixtures";

describe("session turn metrics", () => {
	test("reads each metric without turning missing pricing into zero", () => {
		const option = createSessionTurnV2TestOption();
		expect(getSessionTurnMetricValue(option, "cost")).toBe(0.1);
		expect(getSessionTurnMetricValue(option, "input")).toBe(1_000);
		expect(
			getSessionTurnMetricValue(
				createSessionTurnV2TestOption({
					metrics: { ...option.metrics, estimatedCost: undefined },
				}),
				"cost",
			),
		).toBeUndefined();
	});

	test("formats cost to cents and compact values", () => {
		expect(formatSessionTurnMetricValue(0.1, "cost")).toBe("$0.10");
		expect(formatSessionTurnMetricValue(12_300, "input")).toBe("12k");
		expect(formatSessionTurnMetricValue(undefined, "cost")).toBe("$—");
	});
});
