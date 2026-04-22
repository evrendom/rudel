import { createApiClient } from "./api-client";
import {
	type Credentials,
	clearCredentials,
	loadCredentials,
} from "./credentials";

type AuthSuccess = {
	authenticated: true;
	credentials: Credentials;
	user: { id: string; email: string; name: string };
};

type AuthFailure = {
	authenticated: false;
	reason: "no_credentials" | "token_expired" | "network_error";
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
