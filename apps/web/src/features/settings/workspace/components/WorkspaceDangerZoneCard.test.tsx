import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceDangerZoneCard } from "./WorkspaceDangerZoneCard";

const {
	mockClientDeleteOrganization,
	mockGetOrganizationSessionCount,
	mockRefreshAuthClientState,
	mockSwitchOrganization,
	mockToastSuccess,
} = vi.hoisted(() => ({
	mockClientDeleteOrganization: vi.fn(
		async (_: { organizationId: string }) => ({ success: true as const }),
	),
	mockGetOrganizationSessionCount: vi.fn(
		async (_: { organizationId: string }) => ({ count: 0 }),
	),
	mockRefreshAuthClientState: vi.fn(),
	mockSwitchOrganization: vi.fn(async (_: string) => {}),
	mockToastSuccess: vi.fn(),
}));

const mockUseOrganizationState = {
	state: {
		activeOrg: { id: "org-1", name: "Workspace One", slug: "workspace-one" },
		organizations: [
			{ id: "org-1", name: "Workspace One", slug: "workspace-one" },
			{ id: "org-2", name: "Workspace Two", slug: "workspace-two" },
		],
		isLoading: false,
	},
	actions: { switchOrganization: mockSwitchOrganization },
	meta: { isOrgAdmin: true },
};

vi.mock("@/features/workspace/organization/useOrganization", () => ({
	useOrganization: () => mockUseOrganizationState,
}));

vi.mock("@/lib/orpc", () => ({
	client: {
		deleteOrganization: mockClientDeleteOrganization,
		getOrganizationSessionCount: mockGetOrganizationSessionCount,
	},
}));

vi.mock("@/lib/auth-client", () => ({
	refreshAuthClientState: mockRefreshAuthClientState,
}));

vi.mock("sonner", () => ({
	toast: { success: mockToastSuccess },
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackOrganizationAction: vi.fn(),
	}),
}));

function renderCard(
	props: Partial<React.ComponentProps<typeof WorkspaceDangerZoneCard>> = {},
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<WorkspaceDangerZoneCard
				canManage={true}
				organization={{ id: "org-1", name: "Workspace One" }}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

describe("WorkspaceDangerZoneCard", () => {
	it("renders a destructive delete button for managers", () => {
		renderCard();

		const button = screen.getByRole("button", { name: /delete workspace/i });
		expect(button).not.toBeDisabled();
	});

	it("disables the delete button when the caller cannot manage", () => {
		renderCard({ canManage: false });

		const button = screen.getByRole("button", { name: /delete workspace/i });
		expect(button).toBeDisabled();
	});

	it("opens the confirmation dialog when the delete button is clicked", async () => {
		const user = userEvent.setup();
		renderCard();

		await user.click(screen.getByRole("button", { name: /delete workspace/i }));

		expect(
			await screen.findByText(/this permanently deletes/i),
		).toBeInTheDocument();
	});

	it("switches to a remaining workspace, refreshes auth, and toasts on successful delete", async () => {
		const user = userEvent.setup();
		mockClientDeleteOrganization.mockClear();
		mockSwitchOrganization.mockClear();
		mockRefreshAuthClientState.mockClear();
		mockToastSuccess.mockClear();

		renderCard();

		await user.click(screen.getByRole("button", { name: /delete workspace/i }));

		const confirmInput = await screen.findByLabelText(
			/type workspace one to confirm/i,
		);
		await user.type(confirmInput, "Workspace One");

		const confirmButton = screen.getAllByRole("button", {
			name: /delete workspace/i,
		});
		// The second button is the dialog's confirm CTA (first is the card trigger).
		await user.click(confirmButton[confirmButton.length - 1]);

		await waitFor(() => {
			expect(mockClientDeleteOrganization).toHaveBeenCalledWith({
				organizationId: "org-1",
			});
		});
		await waitFor(() => {
			expect(mockSwitchOrganization).toHaveBeenCalledWith("org-2");
		});
		expect(mockRefreshAuthClientState).toHaveBeenCalled();
		expect(mockToastSuccess).toHaveBeenCalledWith(
			'Workspace "Workspace One" deleted',
		);
	});
});
