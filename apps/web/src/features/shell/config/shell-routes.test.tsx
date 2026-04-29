import { describe, expect, it } from "vitest";
import {
	getCurrentShellRoute,
	shellRouteMap,
	shellRoutes,
} from "@/features/shell/config/shell-routes";

describe("getCurrentShellRoute", () => {
	it("matches the dashboard route for /dashboard", () => {
		expect(getCurrentShellRoute("/dashboard")).toBe(shellRouteMap.dashboard);
	});

	it("prefers the sessions route for /dashboard/sessions", () => {
		expect(getCurrentShellRoute("/dashboard/sessions")).toBe(
			shellRouteMap.sessions,
		);
	});

	it("prefers the sessions route for nested session detail paths", () => {
		expect(getCurrentShellRoute("/dashboard/sessions/session-123")).toBe(
			shellRouteMap.sessions,
		);
	});

	it("uses history as the sessions shortcut", () => {
		expect(shellRouteMap.sessions.shortcut).toBe("H");
	});

	it("keeps primary shell shortcuts unique", () => {
		const shortcuts = shellRoutes.map((route) => route.shortcut);

		expect(new Set(shortcuts).size).toBe(shortcuts.length);
	});
});
