import { describe, expect, test } from "bun:test";
import {
	parseSessionDetailResponse,
	runSessionDetailRequest,
	SessionDetailResponseError,
	SessionDetailTimeoutError,
	shouldRetrySessionDetailQuery,
} from "./session-detail-response";
import {
	canRetrySessionDetailError,
	getSessionDetailErrorState,
} from "./session-detail-view-utils";

const validSessionDetail = {
	content: "",
	duration_min: 1,
	git_branch: null,
	git_sha: null,
	input_tokens: 10,
	last_interaction_date: "2026-08-16T08:01:00Z",
	model_used: "gpt-5",
	output_tokens: 5,
	project_path: "/workspace/rudel",
	repository: "rudel",
	session_date: "2026-08-16T08:00:00Z",
	session_id: "session-1",
	skills: [],
	slash_commands: [],
	subagents: {},
	total_interactions: 1,
	total_tokens: 15,
	user_id: "user-1",
};

describe("parseSessionDetailResponse", () => {
	test("passes through a contract-valid response without a shape warning", () => {
		const result = parseSessionDetailResponse(
			validSessionDetail,
			"requested-session",
		);

		expect(result.session).toEqual(validSessionDetail);
		expect(result.shapeIssueFields).toEqual([]);
	});

	test("preserves recoverable fields when a deployment returns a drifted row", () => {
		const result = parseSessionDetailResponse(
			{
				content: "transcript",
				input_tokens: "1200",
				session_id: "",
				subagents: [["reviewer", "subagent transcript"]],
				user_id: "user-1",
			},
			"requested-session",
		);

		expect(result.session).toEqual({
			content: "transcript",
			input_tokens: "1200",
			session_id: "requested-session",
			subagents: [["reviewer", "subagent transcript"]],
			user_id: "user-1",
		});
		expect(result.shapeIssueFields).toContain("input_tokens");
		expect(result.shapeIssueFields).toContain("session_id");
		expect(result.shapeIssueFields).toContain("subagents");
	});

	test("rejects a response that is not a session row", () => {
		expect(() =>
			parseSessionDetailResponse(["not", "a", "row"], "session-1"),
		).toThrow(SessionDetailResponseError);
	});
});

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
