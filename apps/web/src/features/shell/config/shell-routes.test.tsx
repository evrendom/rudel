import { describe, expect, it } from "vitest";
import {
	getCurrentShellRoute,
	shellRouteMap,
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
});
