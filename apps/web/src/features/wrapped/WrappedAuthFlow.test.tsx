import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";
import {
	clearWrappedGuestPreviewSnapshot,
	readWrappedGuestPreviewSnapshot,
	writeWrappedGuestPreviewSnapshot,
} from "@/features/wrapped/wrapped-guest-preview";

const { mockUseIsMobile } = vi.hoisted(() => ({
	mockUseIsMobile: vi.fn(),
}));

vi.mock("@/app/hooks/use-mobile", () => ({
	useIsMobile: mockUseIsMobile,
}));

vi.mock("@/features/auth/LoginForm", () => ({
	LoginForm: ({
		onEmailPasswordPreviewSubmit,
		onSwitchToSignup,
	}: {
		onEmailPasswordPreviewSubmit?: (email: string) => void;
		onSwitchToSignup: () => void;
		variant: string;
	}) => (
		<div>
			<p>Wrapped login form</p>
			<button
				type="button"
				onClick={() => onEmailPasswordPreviewSubmit?.("preview@example.com")}
			>
				Preview wrapped email submit
			</button>
			<button type="button" onClick={onSwitchToSignup}>
				Switch to signup
			</button>
		</div>
	),
}));

vi.mock("@/features/auth/SignupForm", () => ({
	SignupForm: ({
		onEmailPasswordPreviewSubmit,
		onSwitchToLogin,
	}: {
		onEmailPasswordPreviewSubmit?: (email: string) => void;
		onSwitchToLogin: () => void;
		variant: string;
	}) => (
		<div>
			<p>Wrapped signup form</p>
			<button
				type="button"
				onClick={() => onEmailPasswordPreviewSubmit?.("preview@example.com")}
			>
				Preview wrapped email submit
			</button>
			<button type="button" onClick={onSwitchToLogin}>
				Switch to login
			</button>
		</div>
	),
}));

vi.mock("@/features/wrapped/WrappedDesktopResumePreviewStage", () => ({
	WrappedDesktopResumePreviewStage: () => (
		<div>Wrapped mobile handoff preview</div>
	),
}));

vi.mock("@/features/wrapped/WrappedSetupPage", () => ({
	WrappedSetupPage: () => <div>Wrapped setup page</div>,
}));

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		addListener: vi.fn(),
		dispatchEvent: vi.fn(),
		removeEventListener: vi.fn(),
		removeListener: vi.fn(),
	})),
});

const WRAPPED_UNKNOWN_CARD_CLASS_NAME =
	"bg-[linear-gradient(180deg,_#FFFFFF_0%,_#FBFCFE_48%,_#EEF2F7_100%)]";

async function openWrappedLoginForm(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Log in" }));
	expect(await screen.findByText("Wrapped login form")).toBeInTheDocument();
}

async function submitWrappedPreviewEmail(
	user: ReturnType<typeof userEvent.setup>,
) {
	await user.click(
		screen.getByRole("button", { name: "Preview wrapped email submit" }),
	);
}

describe("WrappedGuestPage", () => {
	beforeEach(() => {
		clearWrappedGuestPreviewSnapshot();
		mockUseIsMobile.mockReset();
		mockUseIsMobile.mockReturnValue(false);
	});

	it("starts on the auth intro step", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Your Claude Wrapped",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("region", {
				name: "Wrapped player card preview",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("Jon Doe")).toBeInTheDocument();
		expect(screen.getAllByText("Maniac").length).toBeGreaterThan(0);
		expect(
			screen.getByRole("button", { name: "Create account" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Go back")).toBeNull();
	});

	it("shows the intro card metrics and back face", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		expect(screen.getAllByText("$347").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Maniac").length).toBeGreaterThan(0);
		expect(screen.getAllByText("43%").length).toBeGreaterThan(0);
		expect(screen.getAllByText("57%").length).toBeGreaterThan(0);
		expect(screen.getAllByText("219").length).toBeGreaterThan(0);
		expect(screen.getAllByText("58").length).toBeGreaterThan(0);
		expect(screen.getAllByText("1.9M").length).toBeGreaterThan(0);
		expect(screen.getAllByText("12").length).toBeGreaterThan(0);

		await user.click(screen.getByRole("button", { name: "Show back of card" }));
		expect(await screen.findByText("Input/output tokens")).toBeInTheDocument();
	});

	it("restores the auth step from session storage", () => {
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
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("button", { name: "Create account" }),
		).toBeInTheDocument();
		expect(screen.getByText("Stored User")).toBeInTheDocument();
	});

	it("keeps image-less local snapshots ready for the animal avatar fallback", () => {
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
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		expect(readWrappedGuestPreviewSnapshot()?.profile.imageUrl).toBeNull();
	});

	it("lets the shared auth forms switch between login and signup", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await openWrappedLoginForm(user);
		expect(screen.getByLabelText("Go back")).toBeInTheDocument();
		expect(screen.getByLabelText("Open support")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Switch to signup" }));
		expect(await screen.findByText("Wrapped signup form")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Switch to login" }));
		expect(await screen.findByText("Wrapped login form")).toBeInTheDocument();

		await user.click(screen.getByLabelText("Go back"));
		expect(
			await screen.findByRole("button", { name: "Create account" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
	});

	it("uses an unknown neutral card while the user creates an account", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("Wrapped signup form")).toBeInTheDocument();
		expect(screen.getAllByText("Unknown Archetype").length).toBeGreaterThan(0);
		expect(screen.getAllByText("???").length).toBeGreaterThan(0);
		expect(
			screen
				.getByRole("region", { name: "Wrapped player card preview" })
				.querySelector(".team-lineup-featured-card"),
		).toHaveClass(WRAPPED_UNKNOWN_CARD_CLASS_NAME);
	});

	it("opens card profile setup after wrapped email auth submits locally", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await openWrappedLoginForm(user);
		await submitWrappedPreviewEmail(user);

		expect(
			screen.getByRole("heading", { name: "Make the card yours" }),
		).toBeInTheDocument();
		expect(screen.queryByText(/stays local/i)).not.toBeInTheDocument();
		expect(screen.getByLabelText("Name on card")).toHaveValue("Preview");
		await vi.waitFor(() => {
			expect(screen.getByLabelText("Name on card")).toHaveFocus();
		});
		expect(screen.getByRole("button", { name: "Save name" })).toBeEnabled();
		expect(readWrappedGuestPreviewSnapshot()?.profile.imageUrl).toBeNull();
		expect(screen.getAllByText("Unknown Archetype").length).toBeGreaterThan(0);
		expect(screen.getAllByText("???").length).toBeGreaterThan(0);
		expect(
			screen
				.getByRole("region", { name: "Wrapped player card preview" })
				.querySelector(".team-lineup-featured-card"),
		).toHaveClass(WRAPPED_UNKNOWN_CARD_CLASS_NAME);
		expect(
			screen.queryByRole("group", { name: "Card image export actions" }),
		).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Share card" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
		expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Save name" }));
		expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
		expect(screen.queryByText("Wrapped setup page")).not.toBeInTheDocument();
	});

	it("continues into the setup preview after card profile setup", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await openWrappedLoginForm(user);
		await submitWrappedPreviewEmail(user);
		await user.clear(screen.getByLabelText("Name on card"));
		await user.type(screen.getByLabelText("Name on card"), "Ada Lovelace");
		expect(screen.getByLabelText("Name on card")).toHaveValue("Ada Lovelace");
		await user.click(screen.getByRole("button", { name: "Save name" }));
		expect(screen.queryByLabelText("Name on card")).toBeNull();
		expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(readWrappedGuestPreviewSnapshot()?.profile.displayName).toBe(
			"Ada Lovelace",
		);
	});

	it("continues into the mobile handoff preview after card profile setup on mobile", async () => {
		mockUseIsMobile.mockReturnValue(true);
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await openWrappedLoginForm(user);
		await submitWrappedPreviewEmail(user);
		expect(
			screen.getByRole("heading", { name: "Make the card yours" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Save name" }));
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(
			screen.getByText("Wrapped mobile handoff preview"),
		).toBeInTheDocument();
	});
});
