import { orpc } from "@/lib/orpc";
import {
	parseSessionDetailResponse,
	runSessionDetailRequest,
} from "./session-detail-response";

export async function fetchSessionDetail(
	sessionId: string,
	querySignal: AbortSignal,
) {
	const response = await runSessionDetailRequest(
		(requestSignal) =>
			orpc.analytics.sessions.detail.call(
				{ sessionId },
				{ signal: requestSignal },
			),
		querySignal,
	);
	const parsedResponse = parseSessionDetailResponse(response, sessionId);

	if (parsedResponse.shapeIssueFields.length > 0) {
		console.warn("[SessionDetailView] Recovered a drifted response shape", {
			fields: parsedResponse.shapeIssueFields,
			sessionId,
		});
	}

	return parsedResponse;
}
