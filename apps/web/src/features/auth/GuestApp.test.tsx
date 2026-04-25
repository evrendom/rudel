import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuestApp } from "./GuestApp";

vi.mock("./LoginForm", () => ({
	LoginForm: () => <div>Login form</div>,
}));

vi.mock("./SignupForm", () => ({
	SignupForm: () => <div>Signup form</div>,
}));

describe("GuestApp", () => {
	it("shows sign up first", () => {
		render(<GuestApp />);

		expect(screen.getByText("Signup form")).toBeInTheDocument();
		expect(screen.queryByText("Login form")).not.toBeInTheDocument();
	});
});
