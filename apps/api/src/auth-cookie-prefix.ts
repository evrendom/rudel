import { isLoopbackHostname } from "@rudel/api-routes";

/**
 * Browser cookies are scoped by hostname, not port. Give each local frontend
 * port its own Better Auth namespace so parallel workspaces cannot overwrite
 * one another's session token. Production keeps Better Auth's existing prefix.
 */
export function resolveAuthCookiePrefix(
	frontendOrigin: string,
): string | undefined {
	let url: URL;
	try {
		url = new URL(frontendOrigin);
	} catch {
		return undefined;
	}

	if (!isLoopbackHostname(url.hostname)) {
		return undefined;
	}

	const port =
		url.port ||
		(url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "");
	return port ? `rudel-local-${port}` : undefined;
}
