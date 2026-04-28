import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CHATWOOT_CLOSED_EVENT,
	CHATWOOT_OPENED_EVENT,
	closeChatwoot,
	openChatwoot,
} from "./chatwoot";

afterEach(() => {
	vi.unstubAllEnvs();
	delete window.$chatwoot;
});

function stubLoadedChatwoot(toggle: (state?: "open" | "close") => void) {
	window.$chatwoot = {
		hasLoaded: true,
		reset: vi.fn(),
		setLabel: vi.fn(),
		setUser: vi.fn(),
		toggle,
	};
}

function stubChatwootEnv() {
	vi.stubEnv("VITE_CHATWOOT_BASE_URL", "https://app.chatwoot.com");
	vi.stubEnv("VITE_CHATWOOT_WEBSITE_TOKEN", "website-token");
}

describe("chatwoot", () => {
	it("dispatches a window event after opening the loaded widget", async () => {
		const handleOpened = vi.fn();
		const toggle = vi.fn();

		stubChatwootEnv();
		stubLoadedChatwoot(toggle);
		window.addEventListener(CHATWOOT_OPENED_EVENT, handleOpened);

		await openChatwoot();

		window.removeEventListener(CHATWOOT_OPENED_EVENT, handleOpened);
		expect(toggle).toHaveBeenCalledWith("open");
		expect(handleOpened).toHaveBeenCalledTimes(1);
	});

	it("dispatches a window event after closing the loaded widget", async () => {
		const handleClosed = vi.fn();
		const toggle = vi.fn();

		stubChatwootEnv();
		stubLoadedChatwoot(toggle);
		window.addEventListener(CHATWOOT_CLOSED_EVENT, handleClosed);

		await closeChatwoot();

		window.removeEventListener(CHATWOOT_CLOSED_EVENT, handleClosed);
		expect(toggle).toHaveBeenCalledWith("close");
		expect(handleClosed).toHaveBeenCalledTimes(1);
	});
});
