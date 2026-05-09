import { join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDesktopFrontend } from "./build.js";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const distDir = join(appRoot, "dist");
const port = Number.parseInt(process.env.PORT ?? "1420", 10);

const contentTypes = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".webp", "image/webp"],
]);

await buildDesktopFrontend();

const server = Bun.serve({
	port,
	async fetch(request) {
		const url = new URL(request.url);
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

		return new Response(file, {
			headers: {
				"content-type": contentTypeFor(filePath),
			},
		});
	},
});

console.log(`Rudel Desktop dev server: http://localhost:${server.port}`);

function contentTypeFor(path: string): string {
	const extension = path.slice(path.lastIndexOf("."));
	return contentTypes.get(extension) ?? "application/octet-stream";
}
