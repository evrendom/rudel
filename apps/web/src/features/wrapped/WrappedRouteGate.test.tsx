import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/features/auth/auth-route-utils";
import { WrappedRouteGate } from "@/features/wrapped/WrappedRouteGate";

const {
	mockTrackUtilityUsed,
	mockUseIsMobile,
	mockUseSetupProgress,
} = vi.hoisted(() => ({
	mockTrackUtilityUsed: vi.fn(),
	mockUseIsMobile: vi.fn(),
	mockUseSetupProgress: vi.fn(),
}));

vi.mock("@/app/hooks/use-mobile", () => ({
	useIsMobile: mockUseIsMobile,
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackUtilityUsed: mockTrackUtilityUsed,
	}),
}));

vi.mock("@/features/get-started/use-setup-progress", () => ({
	useSetupProgress: mockUseSetupProgress,
}));

vi.mock("@/features/wrapped/WrappedPublicPage", () => ({
	WrappedPublicPage: ({ publicId }: { publicId: string }) => (
		<div>Public page: {publicId}</div>
	),
}));

vi.mock("@/features/auth/GuestApp", () => ({
	GuestApp: ({ title }: { title?: string }) => <div>{title ?? "Guest App"}</div>,
}));

vi.mock("@/features/get-started/DesktopResumePromptPage", () => ({
	DesktopResumePromptPage: ({ email }: { email: string }) => (
		<div>Wrapped mobile handoff: {email}</div>
	),
}));

vi.mock("@/features/wrapped/WrappedSetupPage", () => ({
	WrappedSetupPage: ({
		mode,
		onBackToSetup,
		onWaitForFirstSession,
	}: {
		mode: "checking" | "setup" | "waiting";
		onBackToSetup?: () => void;
		onWaitForFirstSession?: () => void;
	}) => (
		<div>
			<div>Wrapped setup mode: {mode}</div>
			{onWaitForFirstSession ? (
				<button onClick={onWaitForFirstSession} type="button">
					Start waiting
				</button>
			) : null}
			{onBackToSetup ? (
				<button onClick={onBackToSetup} type="button">
					Back to setup
				</button>
			) : null}
		</div>
	),
}));

vi.mock("@/features/wrapped/team-card/page", () => ({
	WrappedTeamCardPage: () => <div>Wrapped story</div>,
}));

const now = new Date("2026-04-22T10:00:00.000Z");

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

describe("WrappedRouteGate", () => {
	beforeEach(() => {
		mockTrackUtilityUsed.mockReset();
		mockUseIsMobile.mockReset();
		mockUseSetupProgress.mockReset();

		mockUseIsMobile.mockReturnValue(false);
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: false,
			isLoading: false,
			totalSessionCount: 0,
		});
	});

	it("renders the public page before auth branching when a public id exists", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped/share-123"]}>
				<WrappedRouteGate isPending={true} publicId="share-123" session={null} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Public page: share-123")).toBeInTheDocument();
	});

	it("renders a loading state while auth is pending", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={true} publicId={null} session={null} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Loading wrapped")).toBeInTheDocument();
	});

	it("renders auth when the viewer is not signed in", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={null} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Sign in to start your wrapped")).toBeInTheDocument();
	});

	it("renders mobile handoff for signed-in mobile viewers without uploads", () => {
		mockUseIsMobile.mockReturnValue(true);

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate
					isPending={false}
					publicId={null}
					session={session}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped mobile handoff: ada@example.com")).toBeInTheDocument();
	});

	it("renders setup for signed-in desktop viewers without uploads", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate
					isPending={false}
					publicId={null}
					session={session}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup mode: setup")).toBeInTheDocument();
	});

	it("switches from setup to waiting when the desktop user is ready to wait", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate
					isPending={false}
					publicId={null}
					session={session}
				/>
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Start waiting" }));

		expect(screen.getByText("Wrapped setup mode: waiting")).toBeInTheDocument();
	});

	it("keeps the setup shell visible while uploaded sessions are being checked", () => {
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: false,
			isLoading: true,
			totalSessionCount: 0,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate
					isPending={false}
					publicId={null}
					session={session}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup mode: checking")).toBeInTheDocument();
	});

	it("renders the wrapped story when sessions already exist", () => {
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 3,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate
					isPending={false}
					publicId={null}
					session={session}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
	});
});
