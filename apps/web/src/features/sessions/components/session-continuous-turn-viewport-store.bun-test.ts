import { describe, expect, test } from "bun:test";
import { createSessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";

describe("session continuous turn viewport store", () => {
	test("publishes distinct visible ranges only to leaf subscribers", () => {
		const store = createSessionContinuousTurnViewportStore();
		let notificationCount = 0;
		const unsubscribe = store.subscribe(() => {
			notificationCount += 1;
		});

		expect(store.getSnapshot()).toBeUndefined();
		store.publish([2, 7]);
		expect(store.getSnapshot()).toEqual([2, 7]);
		expect(notificationCount).toBe(1);

		store.publish([2, 7]);
		expect(notificationCount).toBe(1);

		store.publish([3, 8]);
		expect(store.getSnapshot()).toEqual([3, 8]);
		expect(notificationCount).toBe(2);

		unsubscribe();
		store.publish([5, 9]);
		expect(notificationCount).toBe(2);
	});
});
