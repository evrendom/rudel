import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliSetupStepId } from "@/components/analytics/CliSetupHint";
import type { AppSession } from "@/features/auth/auth-route-utils";
import { WrappedRouteGate } from "@/features/wrapped/WrappedRouteGate";
import {
	clearWrappedGuestPreviewSnapshot,
	readWrappedGuestPreviewSnapshot,
	writeWrappedGuestPreviewSnapshot,
} from "@/features/wrapped/wrapped-guest-preview";
import { getWrappedSetupCompletionStorageKey } from "@/features/wrapped/wrapped-setup-state";

const {
	mockTrackWrappedActivationCompleted,
	mockTrackWrappedOnboardingStarted,
	mockTrackWrappedProfileCompleted,
	mockTrackWrappedReferredSignupCompleted,
	mockUseCliSetupStatus,
	mockUseIsMobile,
	mockUseSetupProgress,
} = vi.hoisted(() => ({
	mockTrackWrappedActivationCompleted: vi.fn(),
	mockTrackWrappedOnboardingStarted: vi.fn(),
	mockTrackWrappedProfileCompleted: vi.fn(),
	mockTrackWrappedReferredSignupCompleted: vi.fn(),
	mockUseCliSetupStatus: vi.fn(),
	mockUseIsMobile: vi.fn(),
	mockUseSetupProgress: vi.fn(),
}));

vi.mock("@/app/hooks/use-mobile", () => ({
	useIsMobile: mockUseIsMobile,
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackWrappedActivationCompleted: mockTrackWrappedActivationCompleted,
		trackWrappedOnboardingStarted: mockTrackWrappedOnboardingStarted,
		trackWrappedProfileCompleted: mockTrackWrappedProfileCompleted,
		trackWrappedReferredSignupCompleted:
			mockTrackWrappedReferredSignupCompleted,
	}),
}));

vi.mock("@/features/get-started/use-setup-progress", () => ({
	useSetupProgress: mockUseSetupProgress,
}));

vi.mock("@/features/get-started/use-cli-setup-status", () => ({
	useCliSetupStatus: mockUseCliSetupStatus,
}));

vi.mock("@/features/wrapped/WrappedPublicPage", () => ({
	WrappedPublicPage: ({ publicId }: { publicId: string }) => (
		<div>Public page: {publicId}</div>
	),
}));

vi.mock("@/features/wrapped/WrappedGuestPage", () => ({
	WrappedGuestPage: () => <div>Sign in to start your wrapped</div>,
}));

vi.mock("@/features/wrapped/WrappedCardProfileStep", () => ({
	WrappedCardProfileStep: ({
		displayName,
		onContinue,
		onDisplayNameChange,
	}: {
		displayName: string;
		onContinue: () => void;
		onDisplayNameChange: (value: string) => void;
	}) => (
		<div>
			<div>Wrapped card profile step</div>
			<div>Profile display name: {displayName}</div>
			<button type="button" onClick={() => onDisplayNameChange("Grace Hopper")}>
				Set profile name
			</button>
			<button type="button" onClick={onContinue}>
				Continue profile
			</button>
		</div>
	),
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
		onBack,
		onContinue,
	}: {
		completedStepIdsOverride?: readonly CliSetupStepId[];
		currentStepIdOverride?: CliSetupStepId | null;
		initialStepId?: CliSetupStepId;
		onBack?: () => void;
		onContinue?: () => void;
	}) => {
		const [searchParams] = useSearchParams();
		const completedStepIds = new Set(completedStepIdsOverride ?? []);
		const isSetupComplete =
			completedStepIds.has("install-and-login") &&
			completedStepIds.has("enable-auto-upload");

		return (
			<div>
				<div>Wrapped setup page</div>
				{onBack ? (
					<button type="button" onClick={onBack}>
						Back to card setup
					</button>
				) : null}
				<div>Setup flow: {searchParams.get("flow") ?? "none"}</div>
				<div>Setup initial step: {initialStepId ?? "none"}</div>
				<div>Setup current step: {currentStepIdOverride ?? "none"}</div>
				<div>
					Setup completed steps:{" "}
					{completedStepIdsOverride && completedStepIdsOverride.length > 0
						? completedStepIdsOverride.join(",")
						: "none"}
				</div>
				{onContinue ? (
					<button
						type="button"
						disabled={!isSetupComplete}
						onClick={onContinue}
					>
						Continue
					</button>
				) : null}
			</div>
		);
	},
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

function markWrappedCardProfileComplete() {
	writeWrappedGuestPreviewSnapshot({
		cardProfileCompletedUserId: "user-1",
		profile: {
			displayName: "Ada Lovelace",
			followerCount: null,
			imageUrl: null,
			source: "local",
			username: "ada",
			verified: false,
		},
		step: "auth",
	});
}

describe("WrappedRouteGate", () => {
	beforeEach(() => {
		mockTrackWrappedActivationCompleted.mockReset();
		mockTrackWrappedOnboardingStarted.mockReset();
		mockTrackWrappedProfileCompleted.mockReset();
		mockTrackWrappedReferredSignupCompleted.mockReset();
		mockUseIsMobile.mockReset();
		mockUseCliSetupStatus.mockReset();
		mockUseSetupProgress.mockReset();
		window.localStorage.clear();

		mockUseIsMobile.mockReturnValue(false);
		mockUseCliSetupStatus.mockReturnValue({
			hasCliLogin: false,
			isLoading: false,
		});
		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: false,
			isLoading: false,
			totalSessionCount: 0,
		});
		window.sessionStorage.clear();
		markWrappedCardProfileComplete();
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

	it("renders card profile setup after auth before upload routing", async () => {
		const user = userEvent.setup();
		clearWrappedGuestPreviewSnapshot();

		render(
			<MemoryRouter initialEntries={["/wrapped?flow=card-profile"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped card profile step")).toBeInTheDocument();
		expect(
			screen.getByText("Profile display name: Ada Lovelace"),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Set profile name" }));
		await user.click(screen.getByRole("button", { name: "Continue profile" }));

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(screen.getByText("Setup flow: desktop-ready")).toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: "Back to card setup" }),
		);

		expect(screen.getByText("Wrapped card profile step")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Continue profile" }));
		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(readWrappedGuestPreviewSnapshot()).toMatchObject({
			cardProfileCompletedUserId: "user-1",
			profile: {
				displayName: "Grace Hopper",
			},
			step: "auth",
		});
	});

	it("does not show card profile for signed-in viewers without the new-account flow", () => {
		clearWrappedGuestPreviewSnapshot();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.queryByText("Wrapped card profile step")).toBeNull();
		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
	});

	it("does not treat the guest auth snapshot as completed card setup", () => {
		writeWrappedGuestPreviewSnapshot({
			profile: {
				displayName: "Stored User",
				followerCount: null,
				imageUrl: null,
				source: "local",
				username: "storeduser",
				verified: false,
			},
			step: "auth",
		});

		render(
			<MemoryRouter initialEntries={["/wrapped?flow=card-profile"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped card profile step")).toBeInTheDocument();
		expect(screen.queryByText("Wrapped setup page")).toBeNull();
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
			screen.getByText("Setup current step: install-and-login"),
		).toBeInTheDocument();
		expect(screen.getByText("Setup completed steps: none")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
	});

	it("tracks onboarding start from a source share redirect", async () => {
		render(
			<MemoryRouter initialEntries={["/wrapped?share_id=source-share-1"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(mockTrackWrappedOnboardingStarted).toHaveBeenCalledWith({
				activationState: "upload_required",
				entrySource: "share_redirect",
				isNewUser: false,
				resolvedEntryRoute: "/wrapped",
				sourceComponent: "wrapped_route_gate",
				sourceShareId: "source-share-1",
			});
		});
	});

	it("tracks referred signup completion when a source share creates a new user", async () => {
		clearWrappedGuestPreviewSnapshot();

		render(
			<MemoryRouter
				initialEntries={["/wrapped?flow=card-profile&share_id=source-share-1"]}
			>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(mockTrackWrappedReferredSignupCompleted).toHaveBeenCalledWith({
				activationState: "signup_completed",
				entrySource: "share_redirect",
				isNewUser: true,
				resolvedEntryRoute: "/wrapped",
				sourceComponent: "wrapped_route_gate",
				sourceShareId: "source-share-1",
			});
		});
	});

	it("tracks profile completion with source share attribution", async () => {
		const user = userEvent.setup();
		clearWrappedGuestPreviewSnapshot();

		render(
			<MemoryRouter
				initialEntries={["/wrapped?flow=card-profile&share_id=source-share-1"]}
			>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Continue profile" }));

		expect(mockTrackWrappedProfileCompleted).toHaveBeenCalledWith({
			activationState: "profile_completed",
			entrySource: "share_redirect",
			isNewUser: true,
			resolvedEntryRoute: "/wrapped",
			sourceComponent: "wrapped_route_gate",
			sourceShareId: "source-share-1",
		});
	});

	it("renders upload setup when CLI login is complete but no sessions were uploaded", () => {
		mockUseCliSetupStatus.mockReturnValue({
			hasCliLogin: true,
			isLoading: false,
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
		expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
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
			screen.getByText("Setup current step: install-and-login"),
		).toBeInTheDocument();
		expect(screen.getByText("Setup completed steps: none")).toBeInTheDocument();
	});

	it("marks both setup steps complete when sessions already exist", async () => {
		const user = userEvent.setup();

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

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(screen.getByText("Setup current step: none")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Setup completed steps: install-and-login,enable-auto-upload",
			),
		).toBeInTheDocument();
		const continueButton = screen.getByRole("button", { name: "Continue" });
		expect(continueButton).toBeEnabled();

		await user.click(continueButton);

		expect(screen.getByText("Wrapped setup complete page")).toBeInTheDocument();
	});

	it("enables setup continue when sessions land during setup", async () => {
		const user = userEvent.setup();

		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: false,
			isLoading: false,
			totalSessionCount: 0,
		});

		const { rerender } = render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(
			screen.getByText("Setup current step: install-and-login"),
		).toBeInTheDocument();
		expect(screen.getByText("Setup completed steps: none")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 1,
		});

		rerender(
			<MemoryRouter initialEntries={["/wrapped"]}>
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
		const continueButton = screen.getByRole("button", { name: "Continue" });
		expect(continueButton).toBeEnabled();

		await user.click(continueButton);

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
		expect(screen.getByText("Setup current step: none")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Setup completed steps: install-and-login,enable-auto-upload",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
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

	it("tracks setup activation completion with source share attribution", async () => {
		const user = userEvent.setup();

		mockUseSetupProgress.mockReturnValue({
			hasUploadedSessions: true,
			isLoading: false,
			totalSessionCount: 3,
		});

		render(
			<MemoryRouter
				initialEntries={[
					"/wrapped?flow=sessions-landed&share_id=source-share-1",
				]}
			>
				<WrappedRouteGate isPending={false} publicId={null} session={session} />
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Start story" }));

		expect(mockTrackWrappedActivationCompleted).toHaveBeenCalledWith({
			activationState: "setup_completed",
			entrySource: "share_redirect",
			isNewUser: false,
			resolvedEntryRoute: "/wrapped",
			sourceComponent: "wrapped_route_gate",
			sourceShareId: "source-share-1",
		});
	});
});
