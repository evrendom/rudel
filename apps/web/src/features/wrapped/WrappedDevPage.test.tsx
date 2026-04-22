import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedDevPage } from "@/features/wrapped/WrappedDevPage";

vi.mock("@/features/auth/GuestApp", () => ({
	GuestApp: ({ title }: { title?: string }) => <div>{title ?? "Guest App"}</div>,
}));

vi.mock("@/features/wrapped/WrappedSetupPage", () => ({
	WrappedSetupPage: ({ mode }: { mode: string }) => (
		<div>Wrapped setup mode: {mode}</div>
	),
}));

vi.mock("@/features/wrapped/team-card/page", () => ({
	WrappedTeamCardPage: () => <div>Wrapped story</div>,
}));

describe("WrappedDevPage", () => {
	it("switches between the outer wrapped preview stages", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/dev/wrapped"]}>
				<WrappedDevPage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Sign in to start your wrapped")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Setup" }));
		expect(screen.getByText("Wrapped setup mode: setup")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Waiting" }));
		expect(screen.getByText("Wrapped setup mode: waiting")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Story" }));
		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
	});
});
