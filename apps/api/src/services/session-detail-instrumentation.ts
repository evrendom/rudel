export type SessionDetailRequestKind = "overview" | "subagent" | "turn";

export interface SessionDetailDerivationSample {
	cachedBytes: number;
	durationMs: number;
	heapGrowthBytes: number;
	rawBytes: number;
}

export interface SessionDetailNumericSummary {
	maximum: number | null;
	p50: number | null;
	p95: number | null;
	p99: number | null;
	sampleCount: number;
}

interface SessionDetailInstrumentationOptions {
	maxSamples: number;
	readMemoryUsage: () => ReturnType<typeof process.memoryUsage>;
	startedAt: string;
}

export function createSessionDetailInstrumentation(
	options: SessionDetailInstrumentationOptions,
) {
	const requestSamples: Record<SessionDetailRequestKind, number[]> = {
		overview: [],
		subagent: [],
		turn: [],
	};
	const derivationSamples: SessionDetailDerivationSample[] = [];
	const baselineMemory = options.readMemoryUsage();

	function recordRequestLatency(
		kind: SessionDetailRequestKind,
		durationMs: number,
	) {
		pushBounded(requestSamples[kind], durationMs, options.maxSamples);
		return summarizeNumericSamples(requestSamples[kind]);
	}

	function recordDerivation(sample: SessionDetailDerivationSample) {
		derivationSamples.push(sample);
		if (derivationSamples.length > options.maxSamples) {
			derivationSamples.shift();
		}
	}

	function getStats() {
		const currentMemory = options.readMemoryUsage();
		return {
			derivations: {
				cachedBytes: summarizeNumericSamples(
					derivationSamples.map((sample) => sample.cachedBytes),
				),
				durationMs: summarizeNumericSamples(
					derivationSamples.map((sample) => sample.durationMs),
				),
				heapGrowthBytes: summarizeNumericSamples(
					derivationSamples.map((sample) => sample.heapGrowthBytes),
				),
				rawBytes: summarizeNumericSamples(
					derivationSamples.map((sample) => sample.rawBytes),
				),
				sampleCount: derivationSamples.length,
			},
			processMemory: {
				baseline: baselineMemory,
				current: currentMemory,
				growth: subtractMemoryUsage(currentMemory, baselineMemory),
			},
			requests: {
				overview: summarizeNumericSamples(requestSamples.overview),
				subagent: summarizeNumericSamples(requestSamples.subagent),
				turn: summarizeNumericSamples(requestSamples.turn),
			},
			startedAt: options.startedAt,
		};
	}

	return {
		getStats,
		recordDerivation,
		recordRequestLatency,
	};
}

function pushBounded(values: number[], value: number, maximumLength: number) {
	values.push(value);
	if (values.length > maximumLength) {
		values.shift();
	}
}

function summarizeNumericSamples(
	values: readonly number[],
): SessionDetailNumericSummary {
	if (values.length === 0) {
		return {
			maximum: null,
			p50: null,
			p95: null,
			p99: null,
			sampleCount: 0,
		};
	}

	const sorted = [...values].sort((left, right) => left - right);
	return {
		maximum: sorted.at(-1) ?? null,
		p50: percentile(sorted, 0.5),
		p95: percentile(sorted, 0.95),
		p99: percentile(sorted, 0.99),
		sampleCount: sorted.length,
	};
}

function percentile(sorted: readonly number[], fraction: number) {
	return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}

function subtractMemoryUsage(
	current: ReturnType<typeof process.memoryUsage>,
	baseline: ReturnType<typeof process.memoryUsage>,
) {
	return {
		arrayBuffers: current.arrayBuffers - baseline.arrayBuffers,
		external: current.external - baseline.external,
		heapTotal: current.heapTotal - baseline.heapTotal,
		heapUsed: current.heapUsed - baseline.heapUsed,
		rss: current.rss - baseline.rss,
	};
}
