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

export interface RpcClientConfig {
	rpcUrl: string;
	token: string;
	authType?: "bearer" | "api-key";
}

export function createApiClient(
	config: ClientConfig,
): ContractRouterClient<typeof contract> {
	return createRpcClient({
		rpcUrl: `${config.apiBaseUrl.replace(/\/+$/u, "")}/rpc`,
		token: config.token,
		authType: config.authType,
	});
}

export function createRpcClient(
	config: RpcClientConfig,
): ContractRouterClient<typeof contract> {
	const authType = config.authType ?? "bearer";
	const authHeaders =
		authType === "api-key"
			? { "x-api-key": config.token }
			: { Authorization: `Bearer ${config.token}` };
	debugLog("creating API client", {
		apiBaseUrl: config.rpcUrl,
		authType,
	});

	const link = new RPCLink({
		url: config.rpcUrl,
		headers: authHeaders,
	});
	return createORPCClient(link);
}
