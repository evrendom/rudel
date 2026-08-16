import { SessionDetailSchema } from "@rudel/api-routes";
import { type ZodIssue, z } from "zod";

const sessionDetailFallbackSchema = z
	.object({
		content: z.unknown().optional(),
		duration_min: z.unknown().optional(),
		git_branch: z.unknown().optional(),
		git_sha: z.unknown().optional(),
		input_tokens: z.unknown().optional(),
		last_interaction_date: z.unknown().optional(),
		model_used: z.unknown().optional(),
		output_tokens: z.unknown().optional(),
		project_path: z.unknown().optional(),
		repository: z.unknown().optional(),
		session_date: z.unknown().optional(),
		session_id: z.unknown().optional(),
		skills: z.unknown().optional(),
		slash_commands: z.unknown().optional(),
		source: z.unknown().optional(),
		subagents: z.unknown().optional(),
		success_score: z.unknown().optional(),
		total_interactions: z.unknown().optional(),
		total_tokens: z.unknown().optional(),
		user_id: z.unknown().optional(),
	})
	.strip();

export const SESSION_DETAIL_TIMEOUT_MS = 30_000;

export type SessionDetailViewModelSource = z.infer<
	typeof sessionDetailFallbackSchema
>;

export type ParsedSessionDetailResponse = {
	session: SessionDetailViewModelSource;
	shapeIssueFields: readonly string[];
};

export class SessionDetailResponseError extends Error {
	constructor() {
		super("The session detail response is not an object.");
		this.name = "SessionDetailResponseError";
	}
}

export class SessionDetailTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`The session detail request timed out after ${timeoutMs}ms.`);
		this.name = "SessionDetailTimeoutError";
	}
}

export function parseSessionDetailResponse(
	value: unknown,
	requestedSessionId: string,
): ParsedSessionDetailResponse {
	const contractResult = SessionDetailSchema.safeParse(value);
	if (contractResult.success) {
		return {
			session: contractResult.data,
			shapeIssueFields: [],
		};
	}

	const fallbackResult = sessionDetailFallbackSchema.safeParse(value);
	if (!fallbackResult.success) {
		throw new SessionDetailResponseError();
	}

	const hasUsableSessionId =
		typeof fallbackResult.data.session_id === "string" &&
		fallbackResult.data.session_id.length > 0;
	const sessionId = hasUsableSessionId
		? fallbackResult.data.session_id
		: requestedSessionId;
	const shapeIssueFields = getShapeIssueFields(contractResult.error.issues);

	return {
		session: {
			...fallbackResult.data,
			session_id: sessionId,
		},
		shapeIssueFields: hasUsableSessionId
			? shapeIssueFields
			: [...new Set([...shapeIssueFields, "session_id"])],
	};
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

export function isSessionDetailResponseError(
	value: unknown,
): value is SessionDetailResponseError {
	return value instanceof SessionDetailResponseError;
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
	if (
		failureCount >= 1 ||
		isSessionDetailResponseError(error) ||
		isSessionDetailTimeoutError(error)
	) {
		return false;
	}

	return !["FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].some((code) =>
		hasSessionDetailErrorCode(error, code),
	);
}

function getShapeIssueFields(issues: readonly ZodIssue[]) {
	return [
		...new Set(
			issues.map((issue) => {
				const [field] = issue.path;
				return typeof field === "string" ? field : "response";
			}),
		),
	];
}

function getAbortReason(signal: AbortSignal) {
	return signal.reason instanceof Error
		? signal.reason
		: new DOMException(
				"The session detail request was cancelled.",
				"AbortError",
			);
}
