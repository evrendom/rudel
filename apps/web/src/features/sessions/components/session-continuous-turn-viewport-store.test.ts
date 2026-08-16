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
		store.publishViewport(2, [2, 7]);
		expect(store.getSnapshot()).toEqual({
			activeSelection: { index: 2, speaker: "model" },
			visibleRange: [2, 7],
		});
		expect(notificationCount).toBe(1);

		store.publishViewport(2, [2, 7]);
		expect(notificationCount).toBe(1);

		store.publishSelection({ index: 2, speaker: "member" });
		expect(store.getSnapshot().activeSelection).toEqual({
			index: 2,
			speaker: "member",
		});
		expect(notificationCount).toBe(2);

		store.publishViewport(3, [3, 8]);
		expect(store.getSnapshot()).toEqual({
			activeSelection: { index: 3, speaker: "member" },
			visibleRange: [3, 8],
		});
		expect(notificationCount).toBe(3);

		unsubscribe();
		store.publishViewport(5, [5, 9]);
		expect(notificationCount).toBe(3);
	});
});
