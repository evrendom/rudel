import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "@/app/routes";
import { DeviceAuthorizationApp } from "./DeviceAuthorizationApp";

const { mockTrackAuthenticationAction } = vi.hoisted(() => ({
	mockTrackAuthenticationAction: vi.fn(),
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackAuthenticationAction: mockTrackAuthenticationAction,
	}),
}));

const now = new Date("2026-04-11T08:00:00.000Z");

const session = {
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

function WrappedLocation() {
	const location = useLocation();

	return <div>Wrapped: {location.search}</div>;
}

describe("DeviceAuthorizationApp", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockTrackAuthenticationAction.mockReset();
	});

	it("redirects to wrapped after approval when sessions are still missing", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 200 }));

		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/device?user_code=ABCD-1234"]}>
				<Routes>
					<Route
						path="/device"
						element={
							<DeviceAuthorizationApp
								deviceUserCode="ABCD-1234"
								session={session}
							/>
						}
					/>
					<Route
						path={appRoutes.wrappedTeamCard()}
						element={<WrappedLocation />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Approve" }));

		await waitFor(() => {
			expect(
				screen.getByText("Wrapped: ?flow=desktop-ready"),
			).toBeInTheDocument();
		});

		expect(fetchMock).toHaveBeenCalledWith("/api/auth/device/approve", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userCode: "ABCD-1234" }),
		});

		expect(screen.queryByText("CLI login approved")).toBeNull();
	});

	it("keeps users in wrapped after approval instead of sending them to dashboard", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 200 }),
		);

		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/device?user_code=ABCD-1234"]}>
				<Routes>
					<Route
						path="/device"
						element={
							<DeviceAuthorizationApp
								deviceUserCode="ABCD-1234"
								session={session}
							/>
						}
					/>
					<Route
						path={appRoutes.wrappedTeamCard()}
						element={<WrappedLocation />}
					/>
					<Route path={appRoutes.dashboard()} element={<div>Dashboard</div>} />
				</Routes>
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Approve" }));

		await waitFor(() => {
			expect(
				screen.getByText("Wrapped: ?flow=desktop-ready"),
			).toBeInTheDocument();
		});
		expect(screen.queryByText("Dashboard")).toBeNull();
	});
});
