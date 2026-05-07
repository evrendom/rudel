import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writePendingEmailLoginCodeDraft } from "./email-code-auth";
import { GuestApp } from "./GuestApp";

vi.mock("./LoginForm", () => ({
	LoginForm: () => <div>Login form</div>,
}));

vi.mock("./SignupForm", () => ({
	SignupForm: () => <div>Signup form</div>,
}));

describe("GuestApp", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
	});

	it("shows sign up first", () => {
		render(<GuestApp />);

		expect(screen.getByText("Signup form")).toBeInTheDocument();
		expect(screen.queryByText("Login form")).not.toBeInTheDocument();
	});

	it("shows login first when an email login code is pending", () => {
		writePendingEmailLoginCodeDraft("ada@example.com");

		render(<GuestApp />);

		expect(screen.getByText("Login form")).toBeInTheDocument();
		expect(screen.queryByText("Signup form")).not.toBeInTheDocument();
	});
});
