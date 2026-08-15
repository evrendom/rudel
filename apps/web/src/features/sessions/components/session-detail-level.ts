export type SessionDetailLevel = "request" | "normal";

export function resolveSessionDetailLevel(
	value: string | null,
): SessionDetailLevel {
	return value === "request" ? "request" : "normal";
}
