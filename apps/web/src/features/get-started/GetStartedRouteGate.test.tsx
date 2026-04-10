import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { appRoutes } from "@/app/routes";
import type { AppSession } from "@/features/auth/auth-route-utils";
import { GetStartedRouteGate } from "@/features/get-started/GetStartedRouteGate";

const now = new Date("2026-04-10T15:00:00.000Z");

const session: NonNullable<AppSession> = {
	session: {
		id: "session-1",
		token: "token-1",
		userId: "user-1",
		createdAt: now,
		updatedAt: now,
		expiresAt: now,
	},
	user: {
		id: "user-1",
		email: "ada@example.com",
		name: "Ada Lovelace",
		emailVerified: true,
		image: null,
		createdAt: now,
		updatedAt: now,
	},
};

describe("GetStartedRouteGate", () => {
	it("renders the setup page immediately while auth is pending", () => {
		render(
			<MemoryRouter initialEntries={[appRoutes.getStarted()]}>
				<GetStartedRouteGate
					isPending={true}
					pathname={appRoutes.getStarted()}
					session={null}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Run these commands first so your dashboard isn't empty",
			}),
		).toBeInTheDocument();
		expect(document.querySelector("header")).toBeNull();
		expect(document.querySelector("[data-sidebar]")).toBeNull();
		expect(screen.queryByText("Tokens")).not.toBeInTheDocument();
		expect(screen.queryByText("Commits")).not.toBeInTheDocument();
		expect(screen.queryByText("Errors")).not.toBeInTheDocument();
		expect(screen.queryByRole("link")).toBeNull();
	});

	it("redirects unauthenticated canonical get-started visits back to home", () => {
		render(
			<MemoryRouter initialEntries={[appRoutes.getStarted()]}>
				<Routes>
					<Route path="/" element={<div>Guest landing</div>} />
					<Route
						path={appRoutes.getStarted()}
						element={
							<GetStartedRouteGate
								isPending={false}
								pathname={appRoutes.getStarted()}
								session={null}
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Guest landing")).toBeInTheDocument();
	});

	it("redirects legacy get-started visits to the canonical route", () => {
		render(
			<MemoryRouter initialEntries={[appRoutes.dashboardGetStartedLegacy()]}>
				<Routes>
					<Route
						path={appRoutes.dashboardGetStartedLegacy()}
						element={
							<GetStartedRouteGate
								isPending={false}
								pathname={appRoutes.dashboardGetStartedLegacy()}
								session={session}
							/>
						}
					/>
					<Route
						path={appRoutes.getStarted()}
						element={<div>Canonical get started route</div>}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Canonical get started route")).toBeInTheDocument();
	});

	it("renders the ready state on the canonical route without dashboard chrome", () => {
		render(
			<MemoryRouter initialEntries={[appRoutes.getStarted()]}>
				<GetStartedRouteGate
					isPending={false}
					pathname={appRoutes.getStarted()}
					session={session}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Run these commands first so your dashboard isn't empty",
			}),
		).toBeInTheDocument();
		expect(screen.queryByRole("link")).toBeNull();
	});
});
