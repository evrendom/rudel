import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedDevPage } from "@/features/wrapped/WrappedDevPage";

vi.mock("@/features/wrapped/WrappedGuestPage", () => ({
	WrappedGuestPage: ({ debugControls }: { debugControls?: ReactNode }) => (
		<div>
			{debugControls}
			<div>Wrapped guest page</div>
		</div>
	),
}));

vi.mock("@/features/wrapped/WrappedSetupPage", () => ({
	WrappedSetupPage: ({ debugControls }: { debugControls?: ReactNode }) => (
		<div>
			{debugControls}
			<div>Wrapped setup page</div>
		</div>
	),
}));

vi.mock("@/features/wrapped/WrappedSetupCompletePage", () => ({
	WrappedSetupCompletePage: ({
		debugControls,
		onBack,
	}: {
		debugControls?: ReactNode;
		onBack?: () => void;
	}) => (
		<div>
			{debugControls}
			<div>Wrapped setup complete page</div>
			<button type="button" onClick={onBack}>
				Back to setup
			</button>
		</div>
	),
}));

vi.mock("@/features/wrapped/team-card/page", () => ({
	WrappedTeamCardPage: ({
		devPreviewArchetype,
		devPreviewPublicId,
		devPreviewUserEmail,
		devPreviewUserId,
		isDecimalEntitled,
		onBackFromFirstStep,
		variant,
	}: {
		devPreviewArchetype?: { displayLabel: string };
		devPreviewPublicId?: string;
		devPreviewUserEmail?: string;
		devPreviewUserId?: string;
		isDecimalEntitled?: boolean;
		onBackFromFirstStep?: () => void;
		variant?: string;
	}) => (
		<div>
			<div>Wrapped story</div>
			<div>
				Dev preview archetype: {devPreviewArchetype?.displayLabel ?? "none"}
			</div>
			<div>Dev preview public id: {devPreviewPublicId ?? "none"}</div>
			<div>Dev preview email: {devPreviewUserEmail ?? "none"}</div>
			<div>Dev preview user id: {devPreviewUserId ?? "none"}</div>
			<div>Story variant: {variant ?? "normal"}</div>
			<div>Decimal entitled: {isDecimalEntitled ? "yes" : "no"}</div>
			<button type="button" onClick={onBackFromFirstStep}>
				Back to upload
			</button>
		</div>
	),
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
		expect(screen.getByRole("button", { name: "Low" })).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Low" }));
		expect(
			await screen.findByText("Wrapped setup complete page"),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Story" }));
		expect(screen.getByText("Wrapped story")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Back to upload" }));
		expect(screen.getByText("Wrapped setup complete page")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Back to setup" }));
		expect(screen.getByText("Wrapped setup page")).toBeInTheDocument();
	});

	it("renders the mobile handoff preview with simplified copy", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<MemoryRouter initialEntries={["/dev/wrapped?stage=mobile"]}>
				<WrappedDevPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Continue setup on desktop" }),
		).toBeInTheDocument();
		expect(
			container.querySelector(".rudel-wrapped-top-tray__status"),
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
			".rudel-wrapped-entry-stage__object",
		);
		expect(
			stageObject?.querySelector(".rudel-wrapped-entry-card"),
		).not.toBeNull();
		expect(stageObject?.querySelector("ol")).toBeNull();
		expect(stageObject?.querySelectorAll("svg")).toHaveLength(2);
		expect(screen.getByText("OR")).toBeInTheDocument();
		expect(screen.getByText("app.rudel.ai/wrapped")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Story" })).toBeInTheDocument();
		expect(stageObject?.querySelector("a")).toBeNull();

		await user.click(
			screen.getByRole("button", { name: "Send link to my mail" }),
		);

		expect(
			await screen.findByRole(
				"button",
				{ name: "Email sent!" },
				{ timeout: 2000 },
			),
		).toBeInTheDocument();

		const dock = container.querySelector(".rudel-wrapped-dock");
		expect(dock).toBeNull();
	});

	it("defaults the dev story route to Evren's Decimal preview without auth", () => {
		render(
			<MemoryRouter initialEntries={["/dev/wrapped?stage=story"]}>
				<WrappedDevPage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Wrapped story")).toBeInTheDocument();
		expect(
			screen.getByText("Dev preview archetype: Smooth Operator"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Dev preview email: e.k.dombak@gmail.com"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Dev preview public id: evren"),
		).toBeInTheDocument();
		expect(screen.getByText("Dev preview user id: evren")).toBeInTheDocument();
		expect(screen.getByText("Story variant: decimal")).toBeInTheDocument();
		expect(screen.getByText("Decimal entitled: yes")).toBeInTheDocument();
	});
});
