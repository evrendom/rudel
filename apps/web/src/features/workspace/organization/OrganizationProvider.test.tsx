import assert from "node:assert/strict";
import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
	OrganizationProvider,
	useOrganization,
} from "@/features/workspace/organization/OrganizationProvider";

const {
	mockSetActive,
	mockUseActiveMember,
	mockUseActiveOrganization,
	mockUseListOrganizations,
	mockUseSession,
} = vi.hoisted(() => ({
	mockSetActive: vi.fn(),
	mockUseActiveMember: vi.fn(),
	mockUseActiveOrganization: vi.fn(),
	mockUseListOrganizations: vi.fn(),
	mockUseSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		organization: {
			setActive: mockSetActive,
		},
		useActiveMember: mockUseActiveMember,
		useActiveOrganization: mockUseActiveOrganization,
		useListOrganizations: mockUseListOrganizations,
		useSession: mockUseSession,
	},
}));

const organization = {
	id: "org-1",
	logo: null,
	name: "Rudel",
	slug: "rudel",
};

function OrganizationStateProbe() {
	const { state } = useOrganization();

	return (
		<output>
			{state.activeOrg?.id ?? "no-organization"}:
			{state.isLoading ? "pending" : "ready"}
		</output>
	);
}

it("recovers after full-organization is rate limited and auto-select succeeds", async () => {
	mockUseSession.mockReturnValue({ data: { user: { id: "user-1" } } });
	let resolveSetActive:
		| ((result: { data: typeof organization; error: null }) => void)
		| undefined;
	const setActivePromise = new Promise<{
		data: typeof organization;
		error: null;
	}>((resolve) => {
		resolveSetActive = resolve;
	});

	mockUseActiveOrganization.mockReturnValue({
		data: null,
		error: { status: 429 },
		isPending: false,
	});
	mockUseListOrganizations.mockReturnValue({
		data: [organization],
		error: null,
		isPending: false,
	});
	mockUseActiveMember.mockReturnValue({ data: null });
	mockSetActive.mockReturnValue(setActivePromise);

	render(
		<OrganizationProvider>
			<OrganizationStateProbe />
		</OrganizationProvider>,
	);

	await waitFor(() => {
		expect(mockSetActive).toHaveBeenCalledWith({ organizationId: "org-1" });
		expect(screen.getByText("no-organization:pending")).toBeInTheDocument();
	});

	assert(resolveSetActive);
	const completeSetActive = resolveSetActive;
	await act(async () => {
		completeSetActive({ data: organization, error: null });
		await setActivePromise;
	});

	await waitFor(() => {
		expect(screen.getByText("org-1:ready")).toBeInTheDocument();
	});
});

it("does not request organization data before authentication", () => {
	mockUseSession.mockReturnValue({ data: null, isPending: false });
	mockUseActiveOrganization.mockClear();
	mockUseListOrganizations.mockClear();
	mockUseActiveMember.mockClear();

	render(
		<OrganizationProvider>
			<OrganizationStateProbe />
		</OrganizationProvider>,
	);

	expect(screen.getByText("no-organization:ready")).toBeInTheDocument();
	expect(mockUseActiveOrganization).not.toHaveBeenCalled();
	expect(mockUseListOrganizations).not.toHaveBeenCalled();
	expect(mockUseActiveMember).not.toHaveBeenCalled();
});
