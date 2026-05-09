import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { contract } from "@rudel/api-routes";

const link = new RPCLink({
	url: new URL("/rpc", window.location.origin).href,
	fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export const client: ContractRouterClient<typeof contract> =
	createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
