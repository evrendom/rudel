import { defineConfig } from "@playwright/test";

const TRACE_TREE_BASE_URL = "http://127.0.0.1:55173";

export default defineConfig({
	expect: {
		toHaveScreenshot: {
			maxDiffPixels: 0,
			pathTemplate:
				"{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
		},
	},
	fullyParallel: true,
	outputDir: "../../.context/playwright/trace-tree",
	projects: [
		{ name: "chromium", use: { browserName: "chromium" } },
		{
			name: "webkit",
			testIgnore: /session-transcript-scroll-forensics\.spec\.ts/u,
			use: { browserName: "webkit" },
		},
		{
			name: "firefox",
			testIgnore: /session-transcript-scroll-forensics\.spec\.ts/u,
			use: { browserName: "firefox" },
		},
	],
	reporter: process.env.CI ? "github" : "line",
	retries: process.env.CI ? 1 : 0,
	testDir: "./e2e/trace-tree",
	timeout: 60_000,
	updateSnapshots: process.env.CI ? "none" : "missing",
	use: {
		baseURL: TRACE_TREE_BASE_URL,
		colorScheme: "light",
		trace: "retain-on-failure",
		viewport: { height: 895, width: 1_500 },
	},
	webServer: {
		command: "bun run dev --host 127.0.0.1 --port 55173 --strictPort",
		reuseExistingServer: !process.env.CI,
		stderr: "pipe",
		stdout: "ignore",
		url: `${TRACE_TREE_BASE_URL}/dev/trace-tree-fixture`,
	},
});
