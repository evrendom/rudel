import type { SessionAnalytics } from "@rudel/api-routes";

export function getSessionRepositoryValue(session: SessionAnalytics) {
	return session.repository || session.project_path;
}

export function getSessionRepositoryLabelFromValue(value: string) {
	const segments = value.split("/").filter(Boolean);

	if (segments.length === 0) {
		return "-";
	}

	return segments.slice(-2).join("/");
}

export function getSessionRepositoryLabel(session: SessionAnalytics) {
	return getSessionRepositoryLabelFromValue(getSessionRepositoryValue(session));
}

export function formatSessionTimestamp(value: string) {
	const normalizedValue = value.endsWith("Z") ? value : `${value}Z`;
	const date = new Date(normalizedValue);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
