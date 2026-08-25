import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { contract } from "../contracts/index.js";
import { debugLog } from "./debug.js";

export interface ClientConfig {
	apiBaseUrl: string;
	token: string;
	authType?: "bearer" | "api-key";
}

export function createApiClient(
	config: ClientConfig,
): ContractRouterClient<typeof contract> {
	const authType = config.authType ?? "bearer";
	const authHeaders =
		authType === "api-key"
			? { "x-api-key": config.token }
			: { Authorization: `Bearer ${config.token}` };
	debugLog("creating API client", {
		apiBaseUrl: config.apiBaseUrl,
		authType,
	});

	const link = new RPCLink({
		url: `${config.apiBaseUrl}/rpc`,
		headers: authHeaders,
	});
	return createORPCClient(link);
}
