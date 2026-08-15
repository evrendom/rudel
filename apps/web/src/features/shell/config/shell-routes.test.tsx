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

	it("prefers the sessions route for /session", () => {
		expect(getCurrentShellRoute("/session")).toBe(shellRouteMap.sessions);
	});

	it("prefers the sessions route for nested session detail paths", () => {
		expect(getCurrentShellRoute("/session/session-123")).toBe(
			shellRouteMap.sessions,
		);
	});

	it("matches routes inside the bottom rail preview namespace", () => {
		expect(getCurrentShellRoute("/dev/bottom-rail")).toBe(
			shellRouteMap.dashboard,
		);
		expect(getCurrentShellRoute("/dev/bottom-rail/session/session-123")).toBe(
			shellRouteMap.sessions,
		);
		expect(getCurrentShellRoute("/dev/bottom-rail/skills")).toBe(
			shellRouteMap.skills,
		);
		expect(getCurrentShellRoute("/dev/bottom-rail/team")).toBe(
			shellRouteMap.team,
		);
		expect(getCurrentShellRoute("/dev/bottom-rail/settings/account")).toBe(
			shellRouteMap.settings,
		);
	});

	it("matches routes inside the left sidebar preview namespace", () => {
		expect(getCurrentShellRoute("/dev/left-sidebar")).toBe(
			shellRouteMap.dashboard,
		);
		expect(getCurrentShellRoute("/dev/left-sidebar/session/session-123")).toBe(
			shellRouteMap.sessions,
		);
		expect(getCurrentShellRoute("/dev/left-sidebar/skills")).toBe(
			shellRouteMap.skills,
		);
		expect(getCurrentShellRoute("/dev/left-sidebar/team")).toBe(
			shellRouteMap.team,
		);
		expect(getCurrentShellRoute("/dev/left-sidebar/settings/account")).toBe(
			shellRouteMap.settings,
		);
	});

	it("matches routes inside the left sidebar thread namespace", () => {
		expect(getCurrentShellRoute("/dev/left-sidebar-thread")).toBe(
			shellRouteMap.dashboard,
		);
		expect(
			getCurrentShellRoute("/dev/left-sidebar-thread/session/session-123"),
		).toBe(shellRouteMap.sessions);
		expect(getCurrentShellRoute("/dev/left-sidebar-thread/skills")).toBe(
			shellRouteMap.skills,
		);
		expect(getCurrentShellRoute("/dev/left-sidebar-thread/team")).toBe(
			shellRouteMap.team,
		);
		expect(
			getCurrentShellRoute("/dev/left-sidebar-thread/settings/account"),
		).toBe(shellRouteMap.settings);
	});

	it("uses history as the sessions shortcut", () => {
		expect(shellRouteMap.sessions.shortcut).toBe("H");
	});

	it("matches the skills route and uses its unique shortcut", () => {
		expect(getCurrentShellRoute("/skills")).toBe(shellRouteMap.skills);
		expect(shellRouteMap.skills.shortcut).toBe("K");
		expect(shellRoutes.findIndex((route) => route.id === "skills")).toBe(
			shellRoutes.findIndex((route) => route.id === "sessions") + 1,
		);
	});

	it("keeps primary shell shortcuts unique", () => {
		const shortcuts = shellRoutes.map((route) => route.shortcut);

		expect(new Set(shortcuts).size).toBe(shortcuts.length);
	});
});
