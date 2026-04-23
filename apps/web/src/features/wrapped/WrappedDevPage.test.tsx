import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedDevPage } from "@/features/wrapped/WrappedDevPage";

vi.mock("@/features/wrapped/WrappedGuestPage", () => ({
	WrappedGuestPage: () => <div>Wrapped guest page</div>,
}));

vi.mock("@/features/wrapped/WrappedSetupPage", () => ({
	WrappedSetupPage: () => <div>Wrapped setup page</div>,
}));

vi.mock("@/features/wrapped/WrappedSetupCompletePage", () => ({
	WrappedSetupCompletePage: () => <div>Wrapped setup complete page</div>,
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
		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Guide" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Uploaded" }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Uploaded" }));
		expect(
			await screen.findByText("Wrapped setup complete page"),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Story" }));
		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
	});

	it("renders the mobile handoff preview with simplified copy", () => {
		const { container } = render(
			<MemoryRouter initialEntries={["/dev/wrapped?stage=mobile"]}>
				<WrappedDevPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Continue setup on desktop" }),
		).toBeInTheDocument();
		expect(
			container.querySelector(".mymind-wrapped-top-tray__status"),
		).toBeNull();
		expect(
			screen.getByRole("navigation", { name: "Wrapped onboarding progress" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Mobile handoff")).toBeNull();
		expect(
			screen.getByText(
				"The next step will be to enable Rudel within the terminal on your desktop.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Send link to my mail" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Email sent")).toBeNull();

		const stageObject = container.querySelector(
			".mymind-wrapped-entry-stage__object",
		);
		expect(
			stageObject?.querySelector(".mymind-wrapped-entry-card"),
		).not.toBeNull();
		expect(stageObject?.querySelector("ol")).toBeNull();
		expect(stageObject?.querySelectorAll("svg")).toHaveLength(2);
		expect(screen.getByText("OR")).toBeInTheDocument();
		expect(screen.getByText("app.rudel.ai/wrapped")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
		expect(stageObject?.querySelector("a")).toBeNull();

		const dock = container.querySelector(".mymind-wrapped-dock");
		expect(dock).toBeNull();
	});
});
