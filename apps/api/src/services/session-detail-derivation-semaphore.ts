export function createSessionDetailDerivationSemaphore(maxConcurrent: number) {
	if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent <= 0) {
		throw new Error("derivation concurrency must be a positive integer");
	}

	let activeCount = 0;
	let maximumActiveCount = 0;
	let maximumPendingCount = 0;
	const pending: Array<() => void> = [];

	async function run<TValue>(work: () => Promise<TValue>) {
		await acquire();
		try {
			return await work();
		} finally {
			release();
		}
	}

	async function acquire() {
		if (activeCount < maxConcurrent) {
			activeCount += 1;
			maximumActiveCount = Math.max(maximumActiveCount, activeCount);
			return;
		}

		await new Promise<void>((resolve) => {
			pending.push(resolve);
			maximumPendingCount = Math.max(maximumPendingCount, pending.length);
		});
	}

	function release() {
		const next = pending.shift();
		if (next) {
			next();
			return;
		}
		activeCount -= 1;
	}

	return {
		getStats() {
			return {
				activeCount,
				maximumActiveCount,
				maximumPendingCount,
				maxConcurrent,
				pendingCount: pending.length,
			};
		},
		run,
	};
}
