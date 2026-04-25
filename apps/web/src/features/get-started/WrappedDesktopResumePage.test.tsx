import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedDesktopResumePage } from "@/features/get-started/WrappedDesktopResumePage";

const { mockTrackUtilityUsed, mockUseSession, mockWrappedResumeConsume } =
	vi.hoisted(() => ({
		mockTrackUtilityUsed: vi.fn(),
		mockUseSession: vi.fn(),
		mockWrappedResumeConsume: vi.fn(),
	}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackUtilityUsed: mockTrackUtilityUsed,
	}),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: mockUseSession,
	},
}));

vi.mock("@/lib/orpc", () => ({
	client: {
		wrappedResume: {
			consume: mockWrappedResumeConsume,
		},
	},
}));

const now = new Date("2026-04-22T10:00:00.000Z");

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

describe("WrappedDesktopResumePage", () => {
	beforeEach(() => {
		mockTrackUtilityUsed.mockReset();
		mockUseSession.mockReset();
		mockWrappedResumeConsume.mockReset();
	});

	it("shows a loading state while auth is still pending", () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: true,
		});

		render(
			<MemoryRouter initialEntries={["/resume/token-123"]}>
				<WrappedDesktopResumePage token="token-123" />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("Checking your account before continuing…"),
		).toBeInTheDocument();
	});

	it("redirects unauthenticated viewers back through homepage auth", async () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
		});

		render(
			<MemoryRouter initialEntries={["/resume/token-123"]}>
				<Routes>
					<Route
						path="/resume/:token"
						element={<WrappedDesktopResumePage token="token-123" />}
					/>
					<Route path="/" element={<LocationDisplay />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByText("/?redirect=%2Fresume%2Ftoken-123"),
			).toBeInTheDocument();
		});
	});

	it("navigates to the wrapped destination returned by the resume claim", async () => {
		mockUseSession.mockReturnValue({
			data: session,
			isPending: false,
		});
		mockWrappedResumeConsume.mockResolvedValue({
			redirect_to: "/wrapped?share_id=share-123",
			share_id: "share-123",
		});

		render(
			<MemoryRouter initialEntries={["/resume/token-123"]}>
				<Routes>
					<Route
						path="/resume/:token"
						element={<WrappedDesktopResumePage token="token-123" />}
					/>
					<Route path="/wrapped" element={<LocationDisplay />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByText("/wrapped?share_id=share-123"),
			).toBeInTheDocument();
		});

		expect(mockWrappedResumeConsume).toHaveBeenCalledWith({
			token: "token-123",
		});
	});

	it("shows an inline error when the resume token cannot be consumed", async () => {
		mockUseSession.mockReturnValue({
			data: session,
			isPending: false,
		});
		mockWrappedResumeConsume.mockRejectedValue(
			new Error("Resume token expired"),
		);

		render(
			<MemoryRouter initialEntries={["/resume/token-123"]}>
				<WrappedDesktopResumePage token="token-123" />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Desktop link unavailable")).toBeInTheDocument();
		});

		expect(screen.getByText("Resume token expired")).toBeInTheDocument();
	});
});

function LocationDisplay() {
	const location = useLocation();

	return <div>{`${location.pathname}${location.search}`}</div>;
}
