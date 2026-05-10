import { watch } from "node:fs";
import { join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDesktopFrontend } from "./build.js";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = normalize(join(appRoot, "../.."));
const distDir = join(appRoot, "dist");
const port = Number.parseInt(process.env.PORT ?? "1420", 10);
const devEventPath = "/__rudel_dev_events";
const textEncoder = new TextEncoder();
const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

const contentTypes = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".webp", "image/webp"],
]);

const initialBuildSucceeded = await buildDesktopFrontend();
if (!initialBuildSucceeded) {
	process.exitCode = 1;
}

const server = Bun.serve({
	port,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === devEventPath) {
			return devEventsResponse();
		}

		const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
		const relativePath = pathname.replace(/^\/+/, "");
		const filePath = normalize(join(distDir, relativePath));
		const distRelativePath = relative(distDir, filePath);

		if (distRelativePath.startsWith("..")) {
			return new Response("Not found", { status: 404 });
		}

		const file = Bun.file(filePath);
		if (!(await file.exists())) {
			return new Response("Not found", { status: 404 });
		}

		if (pathname === "/index.html") {
			const html = await file.text();
			return new Response(injectDevClient(html), {
				headers: {
					"cache-control": "no-store",
					"content-type": "text/html; charset=utf-8",
				},
			});
		}

		return new Response(file, {
			headers: {
				"cache-control": "no-store",
				"content-type": contentTypeFor(filePath),
			},
		});
	},
});

watchFrontendSources();
console.log(`Rudel Desktop dev server: http://localhost:${server.port}`);

function contentTypeFor(path: string): string {
	const extension = path.slice(path.lastIndexOf("."));
	return contentTypes.get(extension) ?? "application/octet-stream";
}

function devEventsResponse(): Response {
	let activeController: ReadableStreamDefaultController<Uint8Array> | undefined;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			activeController = controller;
			reloadClients.add(controller);
			sendEvent(controller, "ready", "connected");
		},
		cancel() {
			if (activeController) {
				reloadClients.delete(activeController);
			}
		},
	});

	return new Response(stream, {
		headers: {
			"cache-control": "no-cache",
			connection: "keep-alive",
			"content-type": "text/event-stream",
		},
	});
}

function injectDevClient(html: string): string {
	const script = `<script>
(() => {
	const events = new EventSource("${devEventPath}");
	events.addEventListener("reload", () => location.reload());
})();
</script>`;
	return html.replace("</body>", `${script}</body>`);
}

function watchFrontendSources() {
	const watchRoots = [
		join(appRoot, "src"),
		join(repoRoot, "packages", "desktop-ui", "src"),
	];

	for (const watchRoot of watchRoots) {
		watch(watchRoot, { recursive: true }, scheduleRebuild);
	}
}

let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
let isRebuilding = false;
let rebuildQueued = false;

function scheduleRebuild() {
	if (rebuildTimer) {
		clearTimeout(rebuildTimer);
	}
	rebuildTimer = setTimeout(() => {
		void rebuildAndReload();
	}, 80);
}

async function rebuildAndReload(): Promise<void> {
	if (isRebuilding) {
		rebuildQueued = true;
		return;
	}

	isRebuilding = true;
	const buildSucceeded = await buildDesktopFrontend();
	isRebuilding = false;

	if (buildSucceeded) {
		broadcastReload();
	}

	if (rebuildQueued) {
		rebuildQueued = false;
		await rebuildAndReload();
	}
}

function broadcastReload() {
	for (const client of reloadClients) {
		sendEvent(client, "reload", Date.now().toString());
	}
}

function sendEvent(
	controller: ReadableStreamDefaultController<Uint8Array>,
	event: string,
	data: string,
) {
	controller.enqueue(textEncoder.encode(`event: ${event}\ndata: ${data}\n\n`));
}
