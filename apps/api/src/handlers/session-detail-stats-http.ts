import { getSessionDetailInstrumentationStats } from "../services/session-detail.service.js";

interface SessionDetailStatsAuthSession {
	session: object;
	user: object;
}

export async function handleSessionDetailStatsRequest(input: {
	cors: Record<string, string>;
	enabled: boolean;
	getSession: (
		request: Request,
	) => Promise<SessionDetailStatsAuthSession | null>;
	request: Request;
}) {
	if (!input.enabled) {
		return new Response("Not Found", { status: 404, headers: input.cors });
	}
	if (input.request.method !== "GET") {
		return new Response("Method Not Allowed", {
			headers: { ...input.cors, Allow: "GET" },
			status: 405,
		});
	}

	const session = await input.getSession(input.request);
	if (!session) {
		return new Response("Unauthorized", {
			headers: input.cors,
			status: 401,
		});
	}

	return Response.json(getSessionDetailInstrumentationStats(), {
		headers: { ...input.cors, "Cache-Control": "no-store" },
	});
}
