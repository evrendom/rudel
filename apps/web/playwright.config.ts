import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./browser-tests",
	testMatch: "**/*.pw.ts",
	fullyParallel: false,
	workers: 1,
	timeout: 10_000,
	reporter: "line",
	outputDir: "../../.context/playwright-results",
	use: {
		...devices["Desktop Chrome"],
		baseURL: "http://127.0.0.1:4174",
		channel: "chrome",
	},
	webServer: {
		command: "bun run dev -- --host 127.0.0.1 --port 4174",
		url: "http://127.0.0.1:4174/browser-tests/message-content.html",
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
