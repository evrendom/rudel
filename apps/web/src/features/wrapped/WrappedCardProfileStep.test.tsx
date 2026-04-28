import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedCardProfileStep } from "@/features/wrapped/WrappedCardProfileStep";
import type { WrappedGuestPreviewProfile } from "@/features/wrapped/wrapped-guest-preview";

const { mockCloseChatwoot, mockOpenChatwoot, mockSetChatwootBubbleVisibility } =
	vi.hoisted(() => ({
		mockCloseChatwoot: vi.fn(),
		mockOpenChatwoot: vi.fn(),
		mockSetChatwootBubbleVisibility: vi.fn(),
	}));

vi.mock("@/lib/chatwoot", () => ({
	CHATWOOT_CLOSED_EVENT: "chatwoot:closed",
	CHATWOOT_OPENED_EVENT: "chatwoot:opened",
	closeChatwoot: mockCloseChatwoot,
	openChatwoot: mockOpenChatwoot,
	setChatwootBubbleVisibility: mockSetChatwootBubbleVisibility,
}));

Object.defineProperty(window, "matchMedia", {
	value: vi.fn().mockImplementation((query: string) => ({
		addEventListener: vi.fn(),
		addListener: vi.fn(),
		dispatchEvent: vi.fn(),
		matches: false,
		media: query,
		onchange: null,
		removeEventListener: vi.fn(),
		removeListener: vi.fn(),
	})),
	writable: true,
});

const previewProfile: WrappedGuestPreviewProfile = {
	displayName: "Ada Lovelace",
	followerCount: null,
	imageUrl: null,
	source: "local",
	username: "ada",
	verified: false,
};

describe("WrappedCardProfileStep", () => {
	it("renders the shared onboarding progress for the card profile step", async () => {
		const user = userEvent.setup();
		const handleContinue = vi.fn();
		const handleDisplayNameChange = vi.fn();

		render(
			<MemoryRouter>
				<WrappedCardProfileStep
					displayName="Ada Lovelace"
					imageUrl={null}
					isComplete={true}
					onBack={vi.fn()}
					onContinue={handleContinue}
					onDisplayNameChange={handleDisplayNameChange}
					onImageChange={vi.fn()}
					previewProfile={previewProfile}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("navigation", { name: "Wrapped onboarding progress" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Onboarding step 2: Personalize card",
			}),
		).toHaveAttribute("aria-current", "step");

		await user.click(screen.getByRole("button", { name: "Save name" }));
		expect(
			screen.getByRole("button", { name: "Edit name" }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Edit name" }));
		expect(screen.getByRole("textbox", { name: "Name on card" })).toHaveValue(
			"Ada Lovelace",
		);

		await user.clear(screen.getByRole("textbox", { name: "Name on card" }));
		await user.type(
			screen.getByRole("textbox", { name: "Name on card" }),
			"Ada",
		);

		expect(handleDisplayNameChange).toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Save name" }));
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(handleContinue).toHaveBeenCalledTimes(1);
	});
});
