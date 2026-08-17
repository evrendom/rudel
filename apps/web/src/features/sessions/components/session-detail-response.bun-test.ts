import { describe, expect, test } from "bun:test";
import {
	runSessionDetailRequest,
	SessionDetailTimeoutError,
	shouldRetrySessionDetailQuery,
} from "./session-detail-response";
import {
	canRetrySessionDetailError,
	getSessionDetailErrorState,
} from "./session-detail-view-utils";

describe("runSessionDetailRequest", () => {
	test("aborts a request and reports a distinct timeout error", async () => {
		let requestWasAborted = false;
		const queryController = new AbortController();

		const request = runSessionDetailRequest(
			(requestSignal) =>
				new Promise<never>(() => {
					requestSignal.addEventListener("abort", () => {
						requestWasAborted = true;
					});
				}),
			queryController.signal,
			1,
		);

		await expect(request).rejects.toBeInstanceOf(SessionDetailTimeoutError);
		expect(requestWasAborted).toBe(true);
	});
});

describe("session detail error policy", () => {
	test("gives timeouts a specific retryable state without automatic retries", () => {
		const error = new SessionDetailTimeoutError(30_000);

		expect(getSessionDetailErrorState(error)).toEqual({
			description:
				"The server did not respond in time. Check the API and try again.",
			title: "Session Request Timed Out",
		});
		expect(canRetrySessionDetailError(error)).toBe(true);
		expect(shouldRetrySessionDetailQuery(0, error)).toBe(false);
	});

	test("does not retry ownership or missing-session failures", () => {
		expect(shouldRetrySessionDetailQuery(0, { code: "FORBIDDEN" })).toBe(false);
		expect(shouldRetrySessionDetailQuery(0, { code: "NOT_FOUND" })).toBe(false);
		expect(canRetrySessionDetailError({ code: "FORBIDDEN" })).toBe(false);
	});

	test("allows one automatic retry for an ordinary transient failure", () => {
		const error = new Error("connection reset");

		expect(shouldRetrySessionDetailQuery(0, error)).toBe(true);
		expect(shouldRetrySessionDetailQuery(1, error)).toBe(false);
	});
});
