import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const { version } = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

async function getLatestGitHubVersion() {
	const response = await fetch(
		"https://api.github.com/repos/evrendom/rudel/releases/latest",
		{
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "rudel-web-build",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`GitHub returned ${response.status}`);
	}

	const data = (await response.json()) as { tag_name?: string };

	if (!data.tag_name) {
		throw new Error("GitHub release response did not include a tag");
	}

	return data.tag_name.replace(/^rudel@/, "");
}

function getLatestLocalTagVersion() {
	const output = execFileSync("git", ["tag", "--sort=-version:refname"], {
		cwd: __dirname,
		encoding: "utf-8",
	});

	const tag = output
		.split("\n")
		.map((line) => line.trim())
		.find(Boolean);

	if (!tag) {
		throw new Error("No git tags found");
	}

	return tag.replace(/^rudel@/, "");
}

async function resolveAppVersion() {
	try {
		return await getLatestGitHubVersion();
	} catch {
		try {
			return getLatestLocalTagVersion();
		} catch {
			return version;
		}
	}
}

// Point the dev proxy at a remote API (e.g. RUDEL_API_TARGET=https://app.rudel.ai)
// instead of the default local API server. For https targets the proxy rewrites
// the Host/Origin headers and cookie domain so the remote server's origin checks
// pass and its session cookie sticks to localhost.
function buildApiProxy(target: string) {
	if (!target.startsWith("https://")) {
		return { "/api": target, "/rpc": target };
	}

	const options = {
		target,
		changeOrigin: true,
		cookieDomainRewrite: "localhost",
		headers: { origin: target },
	};

	return { "/api": options, "/rpc": options };
}

const interfereReferenceRoot = path.resolve(
	__dirname,
	"../marketing/__DO_NOT_MERGE__inspiration/interfere-com",
);
const interfereReferenceAssetRoots = new Map([
	[
		"/engineers-v2-assets/",
		path.resolve(interfereReferenceRoot, "engineers-v2-assets"),
	],
	[
		"/designers-session-assets/",
		path.resolve(interfereReferenceRoot, "designers-session-assets"),
	],
]);
const interfereReferenceRoutes = new Map([
	["/product/engineers-v2", "interfere-engineers-v2.capture.html"],
	["/product/engineers-v2/", "interfere-engineers-v2.capture.html"],
	["/product/engineers-v2/hero", "interfere-engineers-v2-hero.capture.html"],
	["/product/engineers-v2/hero/", "interfere-engineers-v2-hero.capture.html"],
	["/product/designers-v2", "interfere-designers-session.capture.html"],
	["/product/designers-v2/", "interfere-designers-session.capture.html"],
	[
		"/product/designers-v2/ship-faster",
		"interfere-designers-ship-faster-scroll.capture.html",
	],
	[
		"/product/designers-v2/ship-faster/",
		"interfere-designers-ship-faster-scroll.capture.html",
	],
	[
		"/product/designers-v2/ship-faster/state-1",
		"interfere-designers-ship-faster-state-1.capture.html",
	],
	[
		"/product/designers-v2/ship-faster/state-2",
		"interfere-designers-session-section.capture.html",
	],
	[
		"/product/designers-v2/ship-faster/state-3",
		"interfere-designers-ship-faster-state-3.capture.html",
	],
]);
const interfereReferenceContentTypes: Record<string, string> = {
	".avif": "image/avif",
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".woff2": "font/woff2",
};

function interfereReferencePlugin(): Plugin {
	return {
		name: "interfere-reference",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (!request.url) {
					next();
					return;
				}

				let requestPath: string;
				try {
					requestPath = decodeURIComponent(
						new URL(request.url, "http://localhost").pathname,
					);
				} catch {
					next();
					return;
				}

				const captureName = interfereReferenceRoutes.get(requestPath);
				let filePath = captureName
					? path.resolve(interfereReferenceRoot, captureName)
					: null;

				for (const [assetPrefix, assetRoot] of interfereReferenceAssetRoots) {
					if (requestPath.startsWith(assetPrefix)) {
						const assetName = requestPath.slice(assetPrefix.length);
						if (assetName && path.basename(assetName) === assetName) {
							filePath = path.resolve(assetRoot, assetName);
						}
						break;
					}
				}

				if (
					!filePath ||
					!existsSync(filePath) ||
					!statSync(filePath).isFile()
				) {
					next();
					return;
				}

				response.statusCode = 200;
				response.setHeader("cache-control", "no-store");
				response.setHeader(
					"content-type",
					interfereReferenceContentTypes[
						path.extname(filePath).toLowerCase()
					] ?? "application/octet-stream",
				);
				createReadStream(filePath).pipe(response);
			});
		},
	};
}

export default defineConfig(async ({ mode }) => {
	const appVersion = await resolveAppVersion();
	const env = loadEnv(mode, __dirname, "");
	const apiTarget =
		env.RUDEL_API_TARGET ??
		process.env.RUDEL_API_TARGET ??
		"http://localhost:4010";

	return {
		define: {
			__APP_VERSION__: JSON.stringify(appVersion),
		},
		plugins: [interfereReferencePlugin(), react(), tailwindcss()],
		server: {
			port: 4011,
			proxy: buildApiProxy(apiTarget),
		},
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		test: {
			environment: "jsdom",
			exclude: [...configDefaults.exclude, "e2e/**"],
			environmentOptions: {
				jsdom: {
					url: "http://localhost:4011",
				},
			},
			setupFiles: ["./src/test/setup.ts"],
		},
	};
});
