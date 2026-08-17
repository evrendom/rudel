const SESSION_DETAIL_TIMEOUT_MS = 30_000;

export class SessionDetailTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`The session detail request timed out after ${timeoutMs}ms.`);
		this.name = "SessionDetailTimeoutError";
	}
}

export async function runSessionDetailRequest<TData>(
	request: (signal: AbortSignal) => Promise<TData>,
	querySignal: AbortSignal,
	timeoutMs = SESSION_DETAIL_TIMEOUT_MS,
): Promise<TData> {
	const requestController = new AbortController();
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let handleQueryAbort: (() => void) | undefined;

	const controlPromise = new Promise<never>((_resolve, reject) => {
		handleQueryAbort = () => {
			const reason = getAbortReason(querySignal);
			requestController.abort(reason);
			reject(reason);
		};

		if (querySignal.aborted) {
			handleQueryAbort();
			return;
		}

		querySignal.addEventListener("abort", handleQueryAbort, { once: true });
		timeoutId = setTimeout(() => {
			const timeoutError = new SessionDetailTimeoutError(timeoutMs);
			requestController.abort(timeoutError);
			reject(timeoutError);
		}, timeoutMs);
	});

	try {
		return await Promise.race([
			request(requestController.signal),
			controlPromise,
		]);
	} finally {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
		if (handleQueryAbort) {
			querySignal.removeEventListener("abort", handleQueryAbort);
		}
	}
}

export function isSessionDetailTimeoutError(
	value: unknown,
): value is SessionDetailTimeoutError {
	return value instanceof SessionDetailTimeoutError;
}

export function hasSessionDetailErrorCode(value: unknown, code: string) {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		value.code === code
	);
}

export function shouldRetrySessionDetailQuery(
	failureCount: number,
	error: unknown,
) {
	if (failureCount >= 1 || isSessionDetailTimeoutError(error)) {
		return false;
	}

	return !["FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].some((code) =>
		hasSessionDetailErrorCode(error, code),
	);
}

function getAbortReason(signal: AbortSignal) {
	return signal.reason instanceof Error
		? signal.reason
		: new DOMException(
				"The session detail request was cancelled.",
				"AbortError",
			);
}
