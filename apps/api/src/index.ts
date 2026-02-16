import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { router } from "./router.js";

const handler = new RPCHandler(router, {
	plugins: [new CORSPlugin()],
});

const port = process.env.PORT ?? 4010;

Bun.serve({
	port,
	async fetch(request) {
		const { matched, response } = await handler.handle(request, {
			prefix: "/rpc",
			context: {},
		});

		if (matched) {
			return response;
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`API server listening on http://localhost:${port}`);
