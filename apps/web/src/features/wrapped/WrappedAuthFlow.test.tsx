import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";
import {
	clearWrappedGuestPreviewSnapshot,
	readWrappedGuestPreviewSnapshot,
	writeWrappedGuestPreviewSnapshot,
} from "@/features/wrapped/wrapped-guest-preview";

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

const WRAPPED_UNKNOWN_CARD_OVERLAY_CLASS_NAME =
	"rudel-wrapped-auth-card-preview--unknown-overlay";
const WRAPPED_UNKNOWN_TO_DEFAULT_CARD_OVERLAY_CLASS_NAME =
	"rudel-wrapped-auth-card-preview--unknown-appearance-overlay";
const WRAPPED_UNKNOWN_CARD_CLASS_NAME =
	"rudel-wrapped-auth-card-preview--unknown";

async function openWrappedLoginForm(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Log in" }));
	expect(await screen.findByText("Wrapped login form")).toBeInTheDocument();
}

async function openWrappedSignupForm(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Create account" }));
	expect(await screen.findByText("Wrapped signup form")).toBeInTheDocument();
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
			screen.getByRole("navigation", { name: "Rudel launch links" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "View Rudel on GitHub" }),
		).toHaveAttribute("href", "https://github.com/obsessiondb/rudel");
		expect(
			screen.getByRole("link", { name: "View Rudel on Hacker News" }),
		).toHaveAttribute("href", "https://news.ycombinator.com/item?id=47350416");
		expect(
			screen.getByRole("link", { name: "View Rudel on Product Hunt" }),
		).toHaveAttribute(
			"href",
			"https://www.producthunt.com/products/rudel?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-claude-code-codex-usage-trading-cards-by-rudel",
		);
		expect(
			screen.getByAltText(
				"Claude Code & Codex Usage Trading Cards by Rudel - Get your trading card based on your CC & codex usage | Product Hunt",
			),
		).toHaveAttribute(
			"src",
			"https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1135782&theme=light&t=1777898459345",
		);
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

	it("still restores the auth intro when an older snapshot was left on the profile step", () => {
		writeWrappedGuestPreviewSnapshot({
			profile: {
				displayName: "Stored User",
				followerCount: null,
				imageUrl: null,
				source: "local",
				username: "storeduser",
				verified: false,
			},
			step: "profile",
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

	it("uses an unknown neutral card after the signup card moves into place", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await openWrappedSignupForm(user);
		await waitFor(() => {
			expect(screen.getAllByText("Unknown Archetype").length).toBeGreaterThan(
				0,
			);
		});
		expect(screen.getAllByText("???").length).toBeGreaterThan(0);
		expect(
			screen.getByRole("region", { name: "Wrapped player card preview" }),
		).toHaveClass(WRAPPED_UNKNOWN_CARD_OVERLAY_CLASS_NAME);
		expect(
			screen.getByRole("region", { name: "Wrapped player card preview" }),
		).toHaveClass(WRAPPED_UNKNOWN_CARD_CLASS_NAME);
	});

	it("restores the default card after backing out of signup", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await openWrappedSignupForm(user);
		await waitFor(() => {
			expect(
				screen.getByRole("region", { name: "Wrapped player card preview" }),
			).toHaveClass(WRAPPED_UNKNOWN_CARD_CLASS_NAME);
		});

		await user.click(screen.getByLabelText("Go back"));
		expect(
			await screen.findByRole("button", { name: "Create account" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
		await waitFor(() => {
			expect(
				screen.getByRole("region", { name: "Wrapped player card preview" }),
			).toHaveClass(WRAPPED_UNKNOWN_TO_DEFAULT_CARD_OVERLAY_CLASS_NAME);
		});
		await waitFor(() => {
			expect(
				screen.getByRole("region", { name: "Wrapped player card preview" }),
			).not.toHaveClass(WRAPPED_UNKNOWN_CARD_CLASS_NAME);
		});
	});

	it("keeps wrapped auth in place when the preview-only submit callback is absent", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await openWrappedLoginForm(user);
		await submitWrappedPreviewEmail(user);

		expect(screen.getByText("Wrapped login form")).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Make the card yours" }),
		).toBeNull();
		expect(screen.queryByText("Wrapped setup page")).toBeNull();
		expect(readWrappedGuestPreviewSnapshot()).toBeNull();
	});
});
