import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WrappedDesktopResumePromptPage } from "./WrappedDesktopResumePromptPage";

const { mockTrackUtilityUsed } = vi.hoisted(() => ({
	mockTrackUtilityUsed: vi.fn(),
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackUtilityUsed: mockTrackUtilityUsed,
	}),
}));

describe("WrappedDesktopResumePromptPage", () => {
	it("renders the shared mobile handoff layout", () => {
		render(
			<MemoryRouter>
				<WrappedDesktopResumePromptPage
					email="ada@example.com"
					shareId={null}
					createResumeLink={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Continue setup on desktop" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"The next step will be to enable Rudel within the terminal on your desktop.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Send link to my mail" }),
		).toBeInTheDocument();
		expect(screen.getByText("OR")).toBeInTheDocument();
		expect(screen.getByText("app.rudel.ai/wrapped")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
		expect(screen.queryByText("ada@example.com")).toBeNull();
	});

	it("keeps the same layout while sending the desktop link", async () => {
		const createResumeLink = vi.fn();
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<WrappedDesktopResumePromptPage
					email="ada@example.com"
					shareId={null}
					createResumeLink={createResumeLink}
				/>
			</MemoryRouter>,
		);

		await user.click(
			screen.getByRole("button", { name: "Send link to my mail" }),
		);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Email sent!" }),
			).toBeInTheDocument();
		});

		expect(createResumeLink).not.toHaveBeenCalled();
		expect(
			screen.queryByText("We sent the desktop link to ada@example.com."),
		).toBeNull();
	});

	it("still supports the real email flow when preview bypass is disabled", async () => {
		const createResumeLink = vi.fn().mockResolvedValue({
			email_sent: true,
			expires_at: "2026-04-24T12:00:00.000Z",
			resume_url: "https://app.rudel.ai/resume/test-token",
		});
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<WrappedDesktopResumePromptPage
					email="ada@example.com"
					shareId={null}
					createResumeLink={createResumeLink}
					shouldBypassEmailSendForMotionPreview={false}
				/>
			</MemoryRouter>,
		);

		await user.click(
			screen.getByRole("button", { name: "Send link to my mail" }),
		);

		await waitFor(() => {
			expect(createResumeLink).toHaveBeenCalledWith({
				shareId: null,
			});
		});

		expect(
			screen.getByText("We sent the desktop link to ada@example.com."),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Email sent!" }),
		).toBeInTheDocument();
		expect(screen.getByText("app.rudel.ai/wrapped")).toBeInTheDocument();
		expect(mockTrackUtilityUsed).toHaveBeenCalledWith(
			expect.objectContaining({
				utilityName: "desktopLinkSent",
				utilityState: "emailSent",
			}),
		);
	});
});
