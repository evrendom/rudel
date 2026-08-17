import {
	SESSION_DETAIL_STALE_REVISION_CODE,
	type SessionDetailSubagent,
	type SessionDetailTurn,
	type SessionDetailWindow,
	type SessionDetailWindowRequest,
} from "@rudel/api-routes";
import { orpc } from "@/lib/orpc";
import {
	assertExpectedSessionDetailRevision,
	logRecoveredSessionDetailShape,
	type ParsedSessionDetailOverview,
	parseSessionDetailOverviewResponse,
	parseSessionDetailSubagentResponse,
	parseSessionDetailTurnResponse,
	parseSessionDetailWindowResponse,
	SessionDetailFastResponseError,
	SessionDetailFastRevisionMismatchError,
} from "./session-detail-fast-response";
import {
	hasSessionDetailErrorCode,
	runSessionDetailRequest,
	shouldRetrySessionDetailQuery,
} from "./session-detail-response";

const SESSION_DETAIL_FAST_QUERY_PREFIX = "session-detail-v2";
const SESSION_DETAIL_BODY_GC_TIME_MS = 10 * 60 * 1_000;
export const SESSION_DETAIL_OVERVIEW_STALE_TIME_MS = 60 * 1_000;
export const SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS = Number.POSITIVE_INFINITY;
export const SESSION_DETAIL_BODY_CACHE_TIME_MS = SESSION_DETAIL_BODY_GC_TIME_MS;
export const SESSION_DETAIL_WINDOW_CACHE_TIME_MS = 10 * 60 * 1_000;

export function sessionDetailFirstOverviewQueryKey(sessionId: string) {
	return [
		SESSION_DETAIL_FAST_QUERY_PREFIX,
		"overview",
		sessionId,
		"latest",
		"first",
	] as const;
}

export function sessionDetailOverviewPageQueryKey(input: {
	revision: string;
	sessionId: string;
	turnCursor: string;
}) {
	return [
		SESSION_DETAIL_FAST_QUERY_PREFIX,
		"overview",
		input.sessionId,
		input.revision,
		input.turnCursor,
	] as const;
}

export function sessionDetailWindowQueryKey(
	input: SessionDetailWindowRequest,
	debugModeKey: string,
) {
	return [
		SESSION_DETAIL_FAST_QUERY_PREFIX,
		"window",
		input.sessionId,
		debugModeKey,
		input,
	] as const;
}

export function sessionDetailTurnQueryKey(input: {
	revision: string;
	sessionId: string;
	turnId: string;
}) {
	return [
		SESSION_DETAIL_FAST_QUERY_PREFIX,
		"body",
		input.sessionId,
		input.revision,
		"turn",
		input.turnId,
	] as const;
}

export function sessionDetailSubagentQueryKey(input: {
	revision: string;
	sessionId: string;
	subagentId: string;
}) {
	return [
		SESSION_DETAIL_FAST_QUERY_PREFIX,
		"body",
		input.sessionId,
		input.revision,
		"subagent",
		input.subagentId,
	] as const;
}

export function sessionDetailBodyQueryPrefix(sessionId: string) {
	return [SESSION_DETAIL_FAST_QUERY_PREFIX, "body", sessionId] as const;
}

export function sessionDetailRevisionQueryPrefix(
	sessionId: string,
	revision: string,
) {
	return [
		SESSION_DETAIL_FAST_QUERY_PREFIX,
		"overview",
		sessionId,
		revision,
	] as const;
}

export async function fetchSessionDetailOverview(
	input: {
		expectedRevision?: string;
		sessionId: string;
		turnCursor?: string;
	},
	querySignal: AbortSignal,
): Promise<ParsedSessionDetailOverview> {
	const response = await runSessionDetailRequest(
		(requestSignal) =>
			orpc.analytics.sessions.detailOverview.call(
				{
					sessionId: input.sessionId,
					...(input.turnCursor ? { turnCursor: input.turnCursor } : {}),
				},
				{ signal: requestSignal },
			),
		querySignal,
	);
	const parsed = parseSessionDetailOverviewResponse(response, input.sessionId);
	assertExpectedSessionDetailRevision(
		input.expectedRevision,
		parsed.overview.revision,
	);
	logRecoveredSessionDetailShape(
		"overview",
		input.sessionId,
		parsed.shapeIssueFields,
	);
	return parsed;
}

export async function fetchSessionDetailWindow(
	input: SessionDetailWindowRequest,
	querySignal: AbortSignal,
): Promise<SessionDetailWindow> {
	markSessionDetailWindowTiming("start");
	try {
		const response = await runSessionDetailRequest(
			(requestSignal) =>
				orpc.analytics.sessions.detailWindow.call(input, {
					signal: requestSignal,
				}),
			querySignal,
		);
		const parsed = parseSessionDetailWindowResponse(response);
		const expectedRevision =
			input.mode === "anchor" ? input.revision : undefined;
		assertExpectedSessionDetailRevision(
			expectedRevision,
			parsed.window.revision,
		);
		logRecoveredSessionDetailShape(
			"window",
			input.sessionId,
			parsed.shapeIssueFields,
		);
		return parsed.window;
	} finally {
		markSessionDetailWindowTiming("end");
	}
}

export function isSessionDetailWindowUnsupportedError(value: unknown) {
	return hasSessionDetailErrorCode(value, "NOT_FOUND");
}

export async function fetchSessionDetailTurn(
	input: { revision: string; sessionId: string; turnId: string },
	querySignal: AbortSignal,
): Promise<SessionDetailTurn> {
	const response = await runSessionDetailRequest(
		(requestSignal) =>
			orpc.analytics.sessions.detailTurn.call(input, {
				signal: requestSignal,
			}),
		querySignal,
	);
	const parsed = parseSessionDetailTurnResponse(response, input);
	assertExpectedSessionDetailRevision(input.revision, parsed.revision);
	return parsed;
}

export async function fetchSessionDetailSubagent(
	input: { revision: string; sessionId: string; subagentId: string },
	querySignal: AbortSignal,
): Promise<SessionDetailSubagent> {
	const response = await runSessionDetailRequest(
		(requestSignal) =>
			orpc.analytics.sessions.detailSubagent.call(input, {
				signal: requestSignal,
			}),
		querySignal,
	);
	const parsed = parseSessionDetailSubagentResponse(response, input);
	assertExpectedSessionDetailRevision(input.revision, parsed.revision);
	return parsed;
}

export function isSessionDetailStaleRevisionError(value: unknown) {
	return hasSessionDetailErrorCode(value, SESSION_DETAIL_STALE_REVISION_CODE);
}

export function shouldRetrySessionDetailFastQuery(
	failureCount: number,
	error: unknown,
) {
	if (
		error instanceof SessionDetailFastResponseError ||
		error instanceof SessionDetailFastRevisionMismatchError ||
		isSessionDetailStaleRevisionError(error)
	) {
		return false;
	}
	return shouldRetrySessionDetailQuery(failureCount, error);
}

function markSessionDetailWindowTiming(phase: "start" | "end") {
	if (!import.meta.env.DEV || typeof performance === "undefined") {
		return;
	}
	const mark = `transcript:window-fetch:${phase}`;
	performance.mark(mark);
	if (phase === "end") {
		performance.measure(
			"transcript:window-fetch",
			"transcript:window-fetch:start",
			mark,
		);
	}
}
