export function getSessionDetailPath(sessionId: string): string {
	return `/dashboard/sessions/${encodeURIComponent(sessionId)}`;
}
