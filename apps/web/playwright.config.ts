import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	fullyParallel: false,
	outputDir: "../../.context/playwright/wrapped-resource-budget",
	projects: [
		{
			name: "Google Chrome",
			use: {
				...devices["Desktop Chrome"],
				channel: "chrome",
			},
		},
	],
	testDir: "./e2e",
	use: {
		baseURL: "http://127.0.0.1:4173",
		headless: true,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun run dev --host 127.0.0.1 --port 4173",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: "http://127.0.0.1:4173/dev/wrapped?stage=public&overStats=1",
	},
});
