import { expect, test } from "playwright/test";

test("home page renders", async ({ page }) => {
	await page.goto("http://localhost:4011");
	await expect(page).toHaveTitle(/Rudel/i);
});
