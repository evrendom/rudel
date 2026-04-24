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

describe("WrappedGuestPage", () => {
	beforeEach(() => {
		clearWrappedGuestPreviewSnapshot();
		mockUseIsMobile.mockReset();
		mockUseIsMobile.mockReturnValue(false);
	});

	it("starts on the X handle step", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Drop in your X handle We'll tune the card first",
			}),
		).toBeInTheDocument();
		expect(screen.getByLabelText("X handle")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Use this handle" }),
		).toBeDisabled();
	});

	it("personalizes locally and continues into auth", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await user.type(screen.getByLabelText("X handle"), "@evren");

		expect(screen.getByText("Evren")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Use this handle" }));
		expect(readWrappedGuestPreviewSnapshot()?.profile.imageUrl).toBe(
			"https://unavatar.io/x/evren",
		);
		expect(
			screen.getByRole("heading", {
				name: "Your Claude/Codex Wrapped",
			}),
		).toBeInTheDocument();
		expect(screen.getAllByText("$182").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Smooth Operator").length).toBeGreaterThan(0);
		expect(screen.getAllByText("32%").length).toBeGreaterThan(0);
		expect(screen.getAllByText("68%").length).toBeGreaterThan(0);
		expect(screen.getAllByText("142").length).toBeGreaterThan(0);
		expect(screen.getAllByText("46").length).toBeGreaterThan(0);
		expect(screen.getAllByText("860K").length).toBeGreaterThan(0);
		expect(screen.getAllByText("9").length).toBeGreaterThan(0);
		expect(
			screen.getByRole("button", { name: "Create account" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Go back")).toBeNull();
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

	it("upgrades stale local snapshots with a fallback avatar", () => {
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

		expect(readWrappedGuestPreviewSnapshot()?.profile.imageUrl).toBe(
			"https://unavatar.io/x/storeduser",
		);
	});

	it("lets the shared auth forms switch between login and signup", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await user.type(screen.getByLabelText("X handle"), "@evren");
		await user.click(screen.getByRole("button", { name: "Use this handle" }));
		await user.click(screen.getByRole("button", { name: "Log in" }));
		expect(await screen.findByText("Wrapped login form")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Switch to signup" }));
		expect(await screen.findByText("Wrapped signup form")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Switch to login" }));
		expect(await screen.findByText("Wrapped login form")).toBeInTheDocument();
	});

	it("continues into the setup preview after wrapped email auth submits locally", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await user.type(screen.getByLabelText("X handle"), "@evren");
		await user.click(screen.getByRole("button", { name: "Use this handle" }));
		await user.click(screen.getByRole("button", { name: "Log in" }));
		await user.click(
			await screen.findByRole("button", {
				name: "Preview wrapped email submit",
			}),
		);

		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
	});

	it("continues into the mobile handoff preview on mobile after wrapped email auth submits locally", async () => {
		mockUseIsMobile.mockReturnValue(true);
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await user.type(screen.getByLabelText("X handle"), "@evren");
		await user.click(screen.getByRole("button", { name: "Use this handle" }));
		await user.click(screen.getByRole("button", { name: "Log in" }));
		await user.click(
			await screen.findByRole("button", {
				name: "Preview wrapped email submit",
			}),
		);

		expect(
			screen.getByText("Wrapped mobile handoff preview"),
		).toBeInTheDocument();
	});
});
