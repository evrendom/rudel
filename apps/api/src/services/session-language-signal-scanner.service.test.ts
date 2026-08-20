import { describe, expect, test } from "bun:test";
import { SessionLanguageSignalScanner } from "./session-language-signal-scanner.service.js";

describe("session language-signal scanner", () => {
	test("terminates a timed-out worker and respawns for the next scan", async () => {
		let workersCreated = 0;
		const scanner = new SessionLanguageSignalScanner({
			createWorker: () => {
				workersCreated += 1;
				return new Worker(
					workersCreated === 1
						? new URL(
								"../__tests__/fixtures/hanging-language-signal-scanner.worker.ts",
								import.meta.url,
							).href
						: new URL(
								"./session-language-signal-scanner.worker.ts",
								import.meta.url,
							).href,
				);
			},
			scanTimeoutMs: 1_000,
		});

		try {
			await expect(scanner.scan("ignored")).rejects.toThrow("deadline");
			await expect(scanner.scan("")).resolves.toEqual({
				member_apologies: 0,
				member_positive: 0,
				member_swears: 0,
				model_apologies: 0,
				model_positive: 0,
				model_swears: 0,
			});
			expect(workersCreated).toBe(2);
		} finally {
			scanner.close();
		}
	});

	test("stays closed after shutdown", async () => {
		const scanner = new SessionLanguageSignalScanner();
		scanner.close();

		await expect(scanner.scan("ignored")).rejects.toThrow("shutting down");
	});
});
