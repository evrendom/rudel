import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedDevPage } from "@/features/wrapped/WrappedDevPage";

vi.mock("@/features/wrapped/WrappedGuestPage", () => ({
	WrappedGuestPage: () => <div>Wrapped guest page</div>,
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

		expect(screen.getByText("Wrapped guest page")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Setup" }));
		expect(screen.getByText("Wrapped setup mode: setup")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Waiting" }));
		expect(screen.getByText("Wrapped setup mode: waiting")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Story" }));
		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
	});

	it("renders the mobile handoff preview with simplified copy", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<MemoryRouter initialEntries={["/dev/wrapped?stage=mobile"]}>
				<WrappedDevPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Continue on desktop" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Continue setup on desktop")).toBeNull();
		expect(screen.queryByText("What happens next")).toBeNull();

		const stageObject = container.querySelector(
			".mymind-wrapped-entry-stage__object",
		);
		expect(stageObject).toHaveClass("mymind-wrapped-entry-card");
		expect(stageObject?.querySelector(".mymind-wrapped-entry-card")).toBeNull();
		expect(
			stageObject?.querySelector(".mymind-wrapped-entry-card__section"),
		).toBeNull();
		expect(stageObject?.querySelector("button")).toBeNull();

		const dock = container.querySelector(".mymind-wrapped-dock");
		expect(dock).not.toBeNull();
		expect(dock?.querySelector("button")).not.toBeNull();
		expect(
			screen.getByRole("button", { name: "Preview desktop link sent" }),
		).toHaveClass("mymind-wrapped-primary-action");

		await user.click(
			screen.getByRole("button", { name: "Preview desktop link sent" }),
		);
		expect(
			screen.getByText(
				"Dev preview only. In the real flow this state appears after the desktop link is created.",
			),
		).toBeInTheDocument();
	});
});
