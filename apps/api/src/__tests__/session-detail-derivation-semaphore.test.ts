import { describe, expect, test } from "bun:test";
import { createSessionDetailDerivationSemaphore } from "../services/session-detail-derivation-semaphore.js";

describe("session detail derivation semaphore", () => {
	test("runs at most two derivations and admits queued work in order", async () => {
		const semaphore = createSessionDetailDerivationSemaphore(2);
		const firstGate = Promise.withResolvers<void>();
		const secondGate = Promise.withResolvers<void>();
		const thirdGate = Promise.withResolvers<void>();
		const started: number[] = [];

		const first = semaphore.run(async () => {
			started.push(1);
			await firstGate.promise;
			return 1;
		});
		const second = semaphore.run(async () => {
			started.push(2);
			await secondGate.promise;
			return 2;
		});
		const third = semaphore.run(async () => {
			started.push(3);
			await thirdGate.promise;
			return 3;
		});

		await Promise.resolve();
		expect(started).toEqual([1, 2]);
		expect(semaphore.getStats()).toEqual({
			activeCount: 2,
			maximumActiveCount: 2,
			maximumPendingCount: 1,
			maxConcurrent: 2,
			pendingCount: 1,
		});

		firstGate.resolve();
		expect(await first).toBe(1);
		await Promise.resolve();
		expect(started).toEqual([1, 2, 3]);

		secondGate.resolve();
		thirdGate.resolve();
		expect(await Promise.all([second, third])).toEqual([2, 3]);
		expect(semaphore.getStats()).toMatchObject({
			activeCount: 0,
			maximumActiveCount: 2,
			pendingCount: 0,
		});
	});

	test("releases a permit when a derivation fails", async () => {
		const semaphore = createSessionDetailDerivationSemaphore(1);

		await expect(
			semaphore.run(() => Promise.reject(new Error("expected failure"))),
		).rejects.toThrow("expected failure");
		expect(await semaphore.run(() => Promise.resolve("recovered"))).toBe(
			"recovered",
		);
		expect(semaphore.getStats().activeCount).toBe(0);
	});
});
