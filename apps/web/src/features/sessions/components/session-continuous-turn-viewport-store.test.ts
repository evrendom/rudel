import { describe, expect, test } from "vitest";
import { createSessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";

describe("session continuous turn viewport store", () => {
	test("publishes distinct viewport values only to leaf subscribers", () => {
		const store = createSessionContinuousTurnViewportStore();
		let notificationCount = 0;
		const unsubscribe = store.subscribe(() => {
			notificationCount += 1;
		});

		expect(store.getSnapshot().visibleRange).toBeUndefined();
		const firstViewedSelections = [
			{ index: 2, speaker: "model" as const },
			{ index: 3, speaker: "member" as const },
		];
		store.publishViewport(
			{ index: 2, speaker: "model" },
			[2, 7],
			firstViewedSelections,
		);
		expect(store.getSnapshot()).toEqual({
			activeSelection: { index: 2, speaker: "model" },
			viewedSelections: firstViewedSelections,
			visibleRange: [2, 7],
		});
		expect(notificationCount).toBe(1);

		store.publishViewport(
			{ index: 2, speaker: "model" },
			[2, 7],
			firstViewedSelections,
		);
		expect(notificationCount).toBe(1);

		store.publishSelection({ index: 2, speaker: "member" });
		expect(store.getSnapshot().activeSelection).toEqual({
			index: 2,
			speaker: "member",
		});
		expect(notificationCount).toBe(2);

		const nextViewedSelections = [
			{ index: 3, speaker: "model" as const },
			{ index: 3, speaker: "member" as const },
		];
		store.publishViewport(
			{ index: 3, speaker: "model" },
			[3, 8],
			nextViewedSelections,
		);
		expect(store.getSnapshot()).toEqual({
			activeSelection: { index: 3, speaker: "model" },
			viewedSelections: nextViewedSelections,
			visibleRange: [3, 8],
		});
		expect(notificationCount).toBe(3);

		unsubscribe();
		store.publishViewport(
			{ index: 5, speaker: "member" },
			[5, 9],
			[{ index: 5, speaker: "member" }],
		);
		expect(notificationCount).toBe(3);
	});
});
