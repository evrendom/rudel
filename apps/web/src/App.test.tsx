import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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
	AuthenticatedApp: ({
		rootRedirectTarget,
	}: {
		rootRedirectTarget: string | null;
	}) => (
		<div>
			<div>Authenticated App</div>
			<div>Root redirect: {rootRedirectTarget ?? "none"}</div>
		</div>
	),
}));

vi.mock("@/features/wrapped/WrappedRouteGate", () => ({
	WrappedRouteGate: ({ publicId }: { publicId: string | null }) => (
		<div>
			<div>Wrapped Route Gate</div>
			<div>Public id: {publicId ?? "none"}</div>
		</div>
	),
}));

vi.mock("@/features/wrapped/WrappedDevPage", () => ({
	WrappedDevPage: () => <div>Wrapped Dev Page</div>,
}));

vi.mock("@/features/get-started/WrappedDesktopResumePage", () => ({
	WrappedDesktopResumePage: () => <div>Wrapped Desktop Resume</div>,
}));

vi.mock("@/features/auth/ResetPasswordApp", () => ({
	ResetPasswordApp: () => <div>Reset Password App</div>,
}));

vi.mock("@/features/auth/YcPasswordLoginPage", () => ({
	YcPasswordLoginPage: () => <div>YC Password Login Page</div>,
}));

describe("App wrapped routing", () => {
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
	});

	it("keeps the device approval route outside the wrapped gate", () => {
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
		expect(screen.queryByText("Wrapped Route Gate")).toBeNull();
	});

	it("routes /wrapped to the wrapped route gate", async () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(screen.getByText("Public id: none")).toBeInTheDocument();
		expect(screen.queryByText("Desktop only")).toBeNull();
	});

	it("canonicalizes YC review /wrapped visits to the wrapped story", async () => {
		mockUseSession.mockReturnValue({
			data: {
				session: { userId: "user-1", ycReview: true },
				user: { id: "user-1" },
			},
			isPending: false,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped?flow=desktop-ready"]}>
				<App />
				<LocationProbe />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(
			screen.getByText("Current route: /wrapped?flow=story"),
		).toBeInTheDocument();
	});

	it("routes /wrapped/:id to the public wrapped route gate branch", async () => {
		render(
			<MemoryRouter initialEntries={["/wrapped/share-123"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(screen.getByText("Public id: share-123")).toBeInTheDocument();
	});

	it("routes /dev/wrapped to the wrapped dev page in development", async () => {
		render(
			<MemoryRouter initialEntries={["/dev/wrapped"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Dev Page")).toBeInTheDocument();
	});

	it("redirects /get-started into /wrapped", async () => {
		render(
			<MemoryRouter initialEntries={["/get-started"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(screen.getByText("Public id: none")).toBeInTheDocument();
	});

	it("redirects /dashboard/get-started into /wrapped", async () => {
		render(
			<MemoryRouter initialEntries={["/dashboard/get-started"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(screen.getByText("Public id: none")).toBeInTheDocument();
	});

	it("redirects the legacy /wrapped/share/:id route to the canonical public page", async () => {
		render(
			<MemoryRouter initialEntries={["/wrapped/share/share-123"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(screen.getByText("Public id: share-123")).toBeInTheDocument();
	});

	it("routes /yc to the dedicated password login page without the desktop-only overlay", async () => {
		render(
			<MemoryRouter initialEntries={["/yc"]}>
				<App />
			</MemoryRouter>,
		);

		expect(
			await screen.findByText("YC Password Login Page"),
		).toBeInTheDocument();
		expect(screen.queryByText("Guest App")).toBeNull();
		expect(screen.queryByText("Desktop only")).toBeNull();
	});

	it("sends authenticated /yc visitors into wrapped", async () => {
		mockUseSession.mockReturnValue({
			data: { session: { userId: "user-1" }, user: { id: "user-1" } },
			isPending: false,
		});

		render(
			<MemoryRouter initialEntries={["/yc"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(screen.getByText("Public id: none")).toBeInTheDocument();
		expect(screen.queryByText("YC Password Login Page")).toBeNull();
	});

	it("sends authenticated YC /yc visitors into the wrapped story", async () => {
		mockUseSession.mockReturnValue({
			data: {
				session: { userId: "user-1", ycReview: true },
				user: { id: "user-1" },
			},
			isPending: false,
		});

		render(
			<MemoryRouter initialEntries={["/yc"]}>
				<App />
				<LocationProbe />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Wrapped Route Gate")).toBeInTheDocument();
		expect(
			screen.getByText("Current route: /wrapped?flow=story"),
		).toBeInTheDocument();
		expect(screen.queryByText("YC Password Login Page")).toBeNull();
	});

	it("routes YC review session root visits into the wrapped story first", async () => {
		mockUseSession.mockReturnValue({
			data: {
				session: { userId: "user-1", ycReview: true },
				user: { id: "user-1" },
			},
			isPending: false,
		});

		render(
			<MemoryRouter initialEntries={["/"]}>
				<App />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Authenticated App")).toBeInTheDocument();
		expect(
			screen.getByText("Root redirect: /wrapped?flow=story"),
		).toBeInTheDocument();
	});
});

function LocationProbe() {
	const location = useLocation();

	return (
		<div>
			Current route: {location.pathname}
			{location.search}
		</div>
	);
}
