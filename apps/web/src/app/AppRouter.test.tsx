import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "./AppRouter";

vi.mock("@/features/invitations/AcceptInvitationPage", () => ({
	AcceptInvitationPage: () => <div>Invitation Page</div>,
}));

vi.mock("@/features/shell/AppShellLayout", () => ({
	AppShellLayout: () => (
		<div>
			App shell
			<Outlet />
		</div>
	),
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

	it("routes /skills through the authenticated app shell", async () => {
		render(
			<MemoryRouter initialEntries={["/skills"]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("App shell")).toBeInTheDocument();
			expect(screen.getByText("Historical skills page")).toBeInTheDocument();
		});
	});

	it("keeps /dashboard on the existing app shell", async () => {
		render(
			<MemoryRouter initialEntries={["/dashboard"]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("App shell")).toBeInTheDocument();
			expect(screen.getByText("Dashboard page")).toBeInTheDocument();
			expect(screen.queryByText("Bottom rail shell")).not.toBeInTheDocument();
		});
	});

	it("routes /dev/bottom-rail through the isolated bottom rail shell", async () => {
		render(
			<MemoryRouter initialEntries={["/dev/bottom-rail"]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Bottom rail shell")).toBeInTheDocument();
			expect(screen.getByText("Dashboard page")).toBeInTheDocument();
			expect(screen.queryByText("App shell")).not.toBeInTheDocument();
		});
	});

	it.each([
		["/dev/bottom-rail/session", "Sessions page"],
		["/dev/bottom-rail/session/session-123", "Sessions page"],
		["/dev/bottom-rail/skills", "Historical skills page"],
		["/dev/bottom-rail/team", "Team page"],
		["/dev/bottom-rail/settings", "Workspace settings page"],
		["/dev/bottom-rail/settings/workspace", "Workspace settings page"],
		["/dev/bottom-rail/settings/members", "Members settings page"],
		["/dev/bottom-rail/settings/account", "Account settings page"],
		["/dev/bottom-rail/settings/invitations", "Account settings page"],
		["/dev/bottom-rail/settings/create-workspace", "Workspace settings page"],
	])("keeps %s inside the bottom rail shell", async (path, pageContent) => {
		render(
			<MemoryRouter initialEntries={[path]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Bottom rail shell")).toBeInTheDocument();
			expect(screen.getByText(pageContent)).toBeInTheDocument();
			expect(screen.queryByText("App shell")).not.toBeInTheDocument();
		});
	});

	it("routes /dev/left-sidebar through the isolated left sidebar shell", async () => {
		render(
			<MemoryRouter initialEntries={["/dev/left-sidebar"]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Left sidebar shell")).toBeInTheDocument();
			expect(screen.getByText("Dashboard page")).toBeInTheDocument();
			expect(screen.queryByText("App shell")).not.toBeInTheDocument();
			expect(screen.queryByText("Bottom rail shell")).not.toBeInTheDocument();
		});
	});

	it.each([
		["/dev/left-sidebar/session", "Sessions page"],
		["/dev/left-sidebar/session/session-123", "Sessions page"],
		["/dev/left-sidebar/skills", "Historical skills page"],
		["/dev/left-sidebar/team", "Team page"],
		["/dev/left-sidebar/settings", "Workspace settings page"],
		["/dev/left-sidebar/settings/workspace", "Workspace settings page"],
		["/dev/left-sidebar/settings/members", "Members settings page"],
		["/dev/left-sidebar/settings/account", "Account settings page"],
		["/dev/left-sidebar/settings/invitations", "Account settings page"],
		["/dev/left-sidebar/settings/create-workspace", "Workspace settings page"],
	])("keeps %s inside the left sidebar shell", async (path, pageContent) => {
		render(
			<MemoryRouter initialEntries={[path]}>
				<AppRouter rootRedirectTarget={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Left sidebar shell")).toBeInTheDocument();
			expect(screen.getByText(pageContent)).toBeInTheDocument();
			expect(screen.queryByText("App shell")).not.toBeInTheDocument();
			expect(screen.queryByText("Bottom rail shell")).not.toBeInTheDocument();
		});
	});
});
