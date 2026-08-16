import { describe, expect, test } from "bun:test";
import { createSessionDetailInstrumentation } from "../services/session-detail-instrumentation.js";

describe("session detail instrumentation", () => {
	test("reports bounded request and derivation percentiles", () => {
		let memory = {
			arrayBuffers: 100,
			external: 200,
			heapTotal: 300,
			heapUsed: 250,
			rss: 500,
		};
		const instrumentation = createSessionDetailInstrumentation({
			maxSamples: 3,
			readMemoryUsage: () => memory,
			startedAt: "2026-08-16T00:00:00.000Z",
		});

		for (const durationMs of [10, 20, 30, 40]) {
			instrumentation.recordRequestLatency("overview", durationMs);
		}
		instrumentation.recordDerivation({
			cachedBytes: 400,
			durationMs: 50,
			heapGrowthBytes: 60,
			rawBytes: 700,
		});
		memory = {
			arrayBuffers: 110,
			external: 220,
			heapTotal: 330,
			heapUsed: 290,
			rss: 550,
		};

		const stats = instrumentation.getStats();
		expect(stats.requests.overview).toEqual({
			maximum: 40,
			p50: 30,
			p95: 40,
			p99: 40,
			sampleCount: 3,
		});
		expect(stats.derivations).toEqual({
			cachedBytes: {
				maximum: 400,
				p50: 400,
				p95: 400,
				p99: 400,
				sampleCount: 1,
			},
			durationMs: {
				maximum: 50,
				p50: 50,
				p95: 50,
				p99: 50,
				sampleCount: 1,
			},
			heapGrowthBytes: {
				maximum: 60,
				p50: 60,
				p95: 60,
				p99: 60,
				sampleCount: 1,
			},
			rawBytes: {
				maximum: 700,
				p50: 700,
				p95: 700,
				p99: 700,
				sampleCount: 1,
			},
			sampleCount: 1,
		});
		expect(stats.processMemory.growth).toEqual({
			arrayBuffers: 10,
			external: 20,
			heapTotal: 30,
			heapUsed: 40,
			rss: 50,
		});
	});

	test("reports empty summaries before requests", () => {
		const memory = process.memoryUsage();
		const instrumentation = createSessionDetailInstrumentation({
			maxSamples: 4,
			readMemoryUsage: () => memory,
			startedAt: "2026-08-16T00:00:00.000Z",
		});

		expect(instrumentation.getStats().requests.turn).toEqual({
			maximum: null,
			p50: null,
			p95: null,
			p99: null,
			sampleCount: 0,
		});
	});
});
