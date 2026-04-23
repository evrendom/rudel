import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";

vi.mock("@/features/auth/LoginForm", () => ({
	LoginForm: ({
		onSwitchToSignup,
	}: {
		onSwitchToSignup: () => void;
		variant: string;
	}) => (
		<div>
			<p>Wrapped login form</p>
			<button type="button" onClick={onSwitchToSignup}>
				Switch to signup
			</button>
		</div>
	),
}));

vi.mock("@/features/auth/SignupForm", () => ({
	SignupForm: ({
		onSwitchToLogin,
	}: {
		onSwitchToLogin: () => void;
		variant: string;
	}) => (
		<div>
			<p>Wrapped signup form</p>
			<button type="button" onClick={onSwitchToLogin}>
				Switch to login
			</button>
		</div>
	),
}));

describe("WrappedAuthFlow", () => {
	it("starts on the intent screen", () => {
		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Find out what your Claude Code / Codex sessions tell about you",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("region", { name: "Wrapped player card preview" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Create account" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Go back")).toBeNull();
	});

	it("opens the signup form from the intent screen", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Create account" }));

		expect(
			screen.getByRole("heading", { name: "Create account" }),
		).toBeInTheDocument();
		expect(screen.getByText("Wrapped signup form")).toBeInTheDocument();
		expect(screen.getByLabelText("Go back")).toBeInTheDocument();
	});

	it("lets the shared forms switch between login and signup", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped"]}>
				<WrappedGuestPage />
			</MemoryRouter>,
		);

		await user.click(screen.getByRole("button", { name: "Log in" }));
		expect(screen.getByText("Wrapped login form")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Switch to signup" }));
		expect(screen.getByText("Wrapped signup form")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Switch to login" }));
		expect(screen.getByText("Wrapped login form")).toBeInTheDocument();
	});
});
