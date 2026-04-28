import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliSetupStepId } from "@/components/analytics/CliSetupHint";
import type { AppSession } from "@/features/auth/auth-route-utils";
import { WrappedRouteGate } from "@/features/wrapped/WrappedRouteGate";
import { getWrappedSetupCompletionStorageKey } from "@/features/wrapped/wrapped-setup-state";

const { mockTrackUtilityUsed, mockUseIsMobile, mockUseSetupProgress } =
	vi.hoisted(() => ({
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

vi.mock("@/features/wrapped/WrappedGuestPage", () => ({
	WrappedGuestPage: () => <div>Sign in to start your wrapped</div>,
}));

vi.mock("@/features/wrapped/WrappedDesktopResumePromptPage", () => ({
	WrappedDesktopResumePromptPage: ({ email }: { email: string }) => (
		<div>Wrapped mobile handoff: {email}</div>
	),
}));

vi.mock("@/features/wrapped/WrappedSetupPage", () => ({
	WrappedSetupPage: ({
		completedStepIdsOverride,
		currentStepIdOverride,
		initialStepId,
	}: {
		completedStepIdsOverride?: readonly CliSetupStepId[];
		currentStepIdOverride?: CliSetupStepId | null;
		initialStepId?: CliSetupStepId;
	}) => (
		<div>
			<div>Wrapped setup page</div>
			<div>Setup initial step: {initialStepId ?? "none"}</div>
			<div>Setup current step: {currentStepIdOverride ?? "none"}</div>
			<div>
				Setup completed steps: {completedStepIdsOverride?.join(",") ?? "none"}
			</div>
		</div>
	),
}));

vi.mock("@/features/wrapped/WrappedSetupCompletePage", () => ({
	WrappedSetupCompletePage: ({
		onBack,
		onContinue,
	}: {
		onBack?: () => void;
		onContinue: () => void;
	}) => (
		<div>
			<div>Wrapped setup complete page</div>
			<button type="button" onClick={onBack}>
				Back to setup
			</button>
			<button type="button" onClick={onContinue}>
				Start story
			</button>
		</div>
	),
}));

vi.mock("@/features/wrapped/team-card/page", () => ({
	WrappedTeamCardPage: ({
		onBackFromFirstStep,
	}: {
		onBackFromFirstStep?: () => void;
	}) => {
		const [searchParams] = useSearchParams();

		return (
			<div>
				<div>Wrapped story</div>
				<div>Story step: {searchParams.get("step") ?? "none"}</div>
				<button type="button" onClick={onBackFromFirstStep}>
					Back to upload
				</button>
			</div>
		);
	},
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
		window.localStorage.clear();

		mockUseIsMobile.mockReturnValue(false);
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: false,
			isLoading: false,
			totalSessionCount: 0,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders the public page before auth branching when a public id exists", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped/share-123"]}>
				<WrappedRouteGate
					isPending={true}
					publicId="share-123"
					session={null}
				/>
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
		expect(
			screen.getByRole("navigation", { name: "Wrapped onboarding progress" }),
		).toBeInTheDocument();
	});

	it("renders auth when the viewer is not signed in", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={null} />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("Sign in to start your wrapped"),
		).toBeInTheDocument();
	});

	it("renders mobile handoff for signed-in mobile viewers without uploads", () => {
		mockUseIsMobile.mockReturnValue(true);

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("Wrapped mobile handoff: ada@example.com"),
		).toBeInTheDocument();
	});

	it("renders setup for signed-in desktop viewers without uploads", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(
			screen.getByText("Setup current step: enable-auto-upload"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Setup completed steps: install-and-login"),
		).toBeInTheDocument();
	});

	it("keeps showing setup while uploaded sessions are still being checked", () => {
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: false,
			isLoading: true,
			totalSessionCount: 0,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(
			screen.getByText("Setup current step: enable-auto-upload"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Setup completed steps: install-and-login"),
		).toBeInTheDocument();
	});

	it("renders setup completion when sessions already exist but setup is not finished yet", () => {
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 3,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup complete page")).toBeInTheDocument();
	});

	it("briefly marks upload complete before showing uploaded sessions when sessions land during setup", async () => {
		vi.useFakeTimers();
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: false,
			isLoading: false,
			totalSessionCount: 0,
		});

		const { rerender } = render(
			<MemoryRouter initialEntries={["/wrapped?flow=sessions-landed"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(
			screen.getByText("Setup current step: enable-auto-upload"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Setup completed steps: install-and-login"),
		).toBeInTheDocument();

		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 1,
		});

		rerender(
			<MemoryRouter initialEntries={["/wrapped?flow=sessions-landed"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(screen.getByText("Setup current step: none")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Setup completed steps: install-and-login,enable-auto-upload",
			),
		).toBeInTheDocument();

		await act(async () => {
			vi.advanceTimersByTime(900);
		});

		expect(screen.getByText("Wrapped setup complete page")).toBeInTheDocument();
	});

	it("renders the wrapped story when setup completion was already acknowledged", () => {
		const storageKey = getWrappedSetupCompletionStorageKey(session.user.id);

		if (storageKey === null) {
			throw new Error("Expected wrapped setup completion storage key");
		}

		window.localStorage.setItem(storageKey, "true");
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 3,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
	});

	it("honors the sessions-landed flow even after setup completion was acknowledged", () => {
		const storageKey = getWrappedSetupCompletionStorageKey(session.user.id);

		if (storageKey === null) {
			throw new Error("Expected wrapped setup completion storage key");
		}

		window.localStorage.setItem(storageKey, "true");
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 3,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped?flow=sessions-landed"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup complete page")).toBeInTheDocument();
	});

	it("returns from the first story page to the upload screen", async () => {
		const user = userEvent.setup();
		const storageKey = getWrappedSetupCompletionStorageKey(session.user.id);

		if (storageKey === null) {
			throw new Error("Expected wrapped setup completion storage key");
		}

		window.localStorage.setItem(storageKey, "true");
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 3,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped?flow=story"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to upload" }));
		expect(screen.getByText("Wrapped setup complete page")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to setup" }));
		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(
			screen.getByText("Setup current step: enable-auto-upload"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Setup completed steps: install-and-login"),
		).toBeInTheDocument();
	});

	it("restarts the story from scale when continuing from sessions landed", async () => {
		const user = userEvent.setup();

		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 3,
		});

		render(
			<MemoryRouter
				initialEntries={[
					"/wrapped?flow=sessions-landed&step=intro&preview-scale=million",
				]}
			>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup complete page")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Start story" }));
		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
		expect(screen.getByText("Story step: none")).toBeInTheDocument();
	});
});
