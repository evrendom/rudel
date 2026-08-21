import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { contract } from "@rudel/api-routes";

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

	const link = new RPCLink({
		url: config.rpcUrl,
		headers: authHeaders,
	});
	return createORPCClient(link);
}
