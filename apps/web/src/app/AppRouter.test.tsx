import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "./AppRouter";

vi.mock("@/features/invitations/AcceptInvitationPage", () => ({
	AcceptInvitationPage: () => <div>Invitation Page</div>,
}));

vi.mock("@/features/shell/AppShellLayout", () => ({
	BottomRailAppShellLayout: () => (
		<div>
			Bottom rail shell
			<Outlet />
		</div>
	),
	LeftSidebarAppShellLayout: () => (
		<div>
			Left sidebar shell
			<Outlet />
		</div>
	),
}));

vi.mock("@/features/dashboard/DashboardPage", () => ({
	DashboardPage: () => <div>Dashboard page</div>,
}));

vi.mock("@/features/sessions/sessions-page", () => ({
	SessionsPage: () => <div>Sessions page</div>,
}));

vi.mock("@/features/skills/SkillsPage", () => ({
	SkillsPage: () => <div>Historical skills page</div>,
}));

vi.mock("@/features/team/TeamPage", () => ({
	TeamPage: () => <div>Team page</div>,
}));

vi.mock("@/features/settings/SettingsLayout", () => ({
	SettingsLayout: () => (
		<div>
			Settings layout
			<Outlet />
		</div>
	),
}));

vi.mock("@/features/settings/workspace/WorkspaceSettingsPage", () => ({
	WorkspaceSettingsPage: () => <div>Workspace settings page</div>,
}));

vi.mock("@/features/settings/members/MembersSettingsPage", () => ({
	MembersSettingsPage: () => <div>Members settings page</div>,
}));

vi.mock("@/features/settings/account/AccountSettingsPage", () => ({
	AccountSettingsPage: () => <div>Account settings page</div>,
}));

describe("AppRouter", () => {
	it("preserves explicit authenticated root redirects", async () => {
		render(
			<MemoryRouter initialEntries={["/"]}>
				<AppRouter rootRedirectTarget="/invitation/123" />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Invitation Page")).toBeInTheDocument();
		});
	});

	it.each([
		["/dashboard", "Dashboard page"],
		["/session", "Sessions page"],
		["/session/session-123", "Sessions page"],
		["/skills", "Historical skills page"],
		["/team", "Team page"],
		["/settings", "Workspace settings page"],
		["/settings/members", "Members settings page"],
		["/settings/account", "Account settings page"],
	])("routes canonical %s through the left sidebar shell", async (path, pageContent) => {
		render(
			<MemoryRouter initialEntries={[path]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Left sidebar shell")).toBeInTheDocument();
			expect(screen.getByText(pageContent)).toBeInTheDocument();
		});
	});

	it.each([
		["/dev/left-sidebar-thread", "Dashboard page"],
		["/dev/left-sidebar-thread/session", "Sessions page"],
		["/dev/left-sidebar-thread/session/session-123", "Sessions page"],
	])("keeps the surviving %s compatibility route", async (path, pageContent) => {
		render(
			<MemoryRouter initialEntries={[path]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Left sidebar shell")).toBeInTheDocument();
			expect(screen.getByText(pageContent)).toBeInTheDocument();
		});
	});

	it("keeps the bottom rail shell preview independent", async () => {
		render(
			<MemoryRouter initialEntries={["/dev/bottom-rail"]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Bottom rail shell")).toBeInTheDocument();
			expect(screen.getByText("Dashboard page")).toBeInTheDocument();
		});
	});
});
