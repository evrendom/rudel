import { authClient } from "@/lib/auth-client";

export type AppSession = ReturnType<typeof authClient.useSession>["data"];

export function getDeviceUserCode(search?: string): string | null {
	const params = new URLSearchParams(search ?? window.location.search);
	return params.get("user_code");
}

export function getValidRedirect(search?: string): string | null {
	const params = new URLSearchParams(search ?? window.location.search);
	const redirect = params.get("redirect");
	if (!redirect) return null;
	if (!redirect.startsWith("/") || redirect.startsWith("//")) return null;
	return redirect;
}

export function getSessionUserId(
	session: AppSession | null | undefined,
): string | null {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
		: null;
}

export function getSessionUserEmail(
	session: AppSession | null | undefined,
): string | undefined {
	return session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
		? session.user.email
		: undefined;
}

export function getSessionUserName(
	session: AppSession | null | undefined,
): string | undefined {
	return session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
		? session.user.name
		: undefined;
}
