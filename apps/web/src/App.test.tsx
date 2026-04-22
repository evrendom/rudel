import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const { mockUseSession } = vi.hoisted(() => ({
	mockUseSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: mockUseSession,
	},
}));

vi.mock("@/features/analytics/tracking/ProductAnalyticsSessionSync", () => ({
	ProductAnalyticsSessionSync: () => null,
}));

vi.mock("@/features/auth/GuestApp", () => ({
	GuestApp: () => <div>Guest App</div>,
}));

vi.mock("@/features/auth/DeviceAuthorizationApp", () => ({
	DeviceAuthorizationApp: () => <div>Device App</div>,
}));

vi.mock("@/features/auth/AuthenticatedApp", () => ({
	AuthenticatedApp: () => <div>Authenticated App</div>,
}));

vi.mock("@/features/wrapped/team-card/page", () => ({
	WrappedTeamCardPage: () => <div>Wrapped Team Card</div>,
}));

vi.mock("@/features/wrapped/PublicWrappedSharePage", () => ({
	PublicWrappedSharePage: () => <div>Wrapped Share Page</div>,
}));

vi.mock("@/features/get-started/WrappedDesktopResumePage", () => ({
	WrappedDesktopResumePage: () => <div>Wrapped Desktop Resume</div>,
}));

vi.mock("@/features/auth/ResetPasswordApp", () => ({
	ResetPasswordApp: () => <div>Reset Password App</div>,
}));

vi.mock("@/features/get-started/GetStartedRouteGate", () => ({
	GetStartedRouteGate: () => <div>Get Started Gate</div>,
}));

describe("App mobile desktop-only overlay", () => {
	beforeEach(() => {
		mockUseSession.mockReset();
		mockUseSession.mockReturnValue({ data: null, isPending: false });
	});

	it("renders the desktop-only overlay on the guest homepage", () => {
		render(
			<MemoryRouter initialEntries={["/"]}>
				<App />
			</MemoryRouter>,
		);

		expect(screen.getByText("Guest App")).toBeInTheDocument();
		expect(screen.getByTestId("desktop-only-overlay")).toHaveClass(
			"hidden",
			"max-[499px]:flex",
		);
		expect(
			screen.getByText(
				"Please use it on desktop or resize your window. Otherwise it will look horrendous.",
			),
		).toBeInTheDocument();
	});

	it("does not show the overlay for the device approval utility screen", () => {
		mockUseSession.mockReturnValue({
			data: { session: { userId: "user-1" }, user: { id: "user-1" } },
			isPending: false,
		});

		render(
			<MemoryRouter initialEntries={["/?user_code=ABCD-1234"]}>
				<App />
			</MemoryRouter>,
		);

		expect(screen.getByText("Device App")).toBeInTheDocument();
		expect(screen.queryByText("Desktop only")).toBeNull();
	});

	it("routes /wrapped to the wrapped team card flow without the desktop overlay", async () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Team Card")).toBeInTheDocument();
		expect(screen.queryByText("Desktop only")).toBeNull();
	});

	it("routes /wrapped/share/:id to the public wrapped share flow", async () => {
		render(
			<MemoryRouter initialEntries={["/wrapped/share/share-123"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Share Page")).toBeInTheDocument();
		expect(screen.queryByText("Desktop only")).toBeNull();
	});
});
