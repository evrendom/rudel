import { ORPCError } from "@orpc/client";
import { createApiClient } from "./api-client.js";
import {
	type Credentials,
	clearCredentials,
	loadCredentials,
} from "./credentials.js";

type AuthSuccess = {
	authenticated: true;
	credentials: Credentials;
	user: { id: string; email: string; name: string };
};

type AuthFailure = {
	authenticated: false;
	reason: "no_credentials" | "token_expired" | "network_error" | "rate_limited";
	message: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

export async function verifyAuth(): Promise<AuthResult> {
	const credentials = loadCredentials();
	if (!credentials) {
		return {
			authenticated: false,
			reason: "no_credentials",
			message: "Not authenticated. Run `rudel login` first.",
		};
	}

	const client = createApiClient(credentials);
	try {
		const user =
			credentials.authType === "api-key"
				? await client.cli.authStatus()
				: await client.me();
		return { authenticated: true, credentials, user };
	} catch (error) {
		if (error instanceof ORPCError && error.status === 429) {
			return {
				authenticated: false,
				reason: "rate_limited",
				message:
					"API key rate limit reached. Run `rudel login` to create a fresh ingest key, or wait for the key's rate-limit window to reset.",
			};
		}

		const message = String(error);
		const isAuthError =
			message.includes("401") ||
			message.includes("403") ||
			message.includes("Unauthorized") ||
			message.includes("Forbidden");

		if (isAuthError) {
			clearCredentials();
			return {
				authenticated: false,
				reason: "token_expired",
				message:
					"Session expired or invalid. Run `rudel login` to re-authenticate.",
			};
		}

		return {
			authenticated: false,
			reason: "network_error",
			message: "Failed to verify authentication. Check your connection.",
		};
	}
}
