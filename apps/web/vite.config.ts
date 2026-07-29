import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

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
		plugins: [react(), tailwindcss()],
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
			environmentOptions: {
				jsdom: {
					url: "http://localhost:4011",
				},
			},
			setupFiles: ["./src/test/setup.ts"],
		},
	};
});
