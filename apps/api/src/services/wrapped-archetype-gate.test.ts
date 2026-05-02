import { describe, expect, test } from "bun:test";
import { buildWrappedArchetypeGate } from "./wrapped-archetype-gate.js";

describe("wrapped archetype gate", () => {
	test("blocks a 38-session user before assigning an archetype", () => {
		const gate = buildWrappedArchetypeGate({
			totalSessions: 38,
			activeDays: 20,
			distanceRatioToMax: 0.1,
			topTwoMargin: 0.2,
		});

		expect(gate.is_eligible).toBe(false);
		expect(gate.reason).toBe("needs_more_sessions");
		expect(gate.thresholds.min_total_sessions).toBe(100);
		expect(gate.values.total_sessions).toBe(38);
	});

	test("blocks a 99-session user before assigning an archetype", () => {
		const gate = buildWrappedArchetypeGate({
			totalSessions: 99,
			activeDays: 20,
			distanceRatioToMax: 0.1,
			topTwoMargin: 0.2,
		});

		expect(gate.is_eligible).toBe(false);
		expect(gate.reason).toBe("needs_more_sessions");
	});

	test("passes a 100-session user with active days and confident classifier output", () => {
		const gate = buildWrappedArchetypeGate({
			totalSessions: 100,
			activeDays: 14,
			distanceRatioToMax: 0.25,
			topTwoMargin: 0.1,
		});

		expect(gate.is_eligible).toBe(true);
		expect(gate.reason).toBe("eligible");
		expect(gate.values.active_days).toBe(14);
	});

	test("passes when active days are below the old threshold", () => {
		const gate = buildWrappedArchetypeGate({
			totalSessions: 100,
			activeDays: 13,
			distanceRatioToMax: 0.1,
			topTwoMargin: 0.2,
		});

		expect(gate.is_eligible).toBe(true);
		expect(gate.reason).toBe("eligible");
	});

	test("waits for classifier output when threshold counts pass but archetype data is missing", () => {
		const gate = buildWrappedArchetypeGate({
			totalSessions: 100,
			activeDays: 14,
			distanceRatioToMax: null,
			topTwoMargin: null,
		});

		expect(gate.is_eligible).toBe(false);
		expect(gate.reason).toBe("processing_archetype");
	});

	test("passes low-confidence classifier output once an archetype exists", () => {
		const gate = buildWrappedArchetypeGate({
			totalSessions: 100,
			activeDays: 14,
			distanceRatioToMax: 0.26,
			topTwoMargin: 0.09,
		});

		expect(gate.is_eligible).toBe(true);
		expect(gate.reason).toBe("eligible");
	});
});
