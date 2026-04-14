import type { ReactNode } from "react";
import {
	useOptionalOrganization as useOptionalWorkspaceOrganization,
	OrganizationProvider as WorkspaceOrganizationProvider,
} from "@/features/workspace/organization/OrganizationProvider";

interface Organization {
	id: string;
	name: string;
	slug: string;
	logo?: string | null | undefined;
}

interface OrganizationContextType {
	activeOrg: Organization | null;
	organizations: readonly Organization[];
	switchOrg: (orgId: string) => Promise<void>;
	isLoading: boolean;
	isOrgAdmin: boolean;
}

function toLegacyOrganizationContext(
	context: ReturnType<typeof useOptionalWorkspaceOrganization>,
): OrganizationContextType | undefined {
	if (context === undefined) {
		return undefined;
	}

	return {
		activeOrg: context.state.activeOrg,
		organizations: context.state.organizations,
		switchOrg: context.actions.switchOrganization,
		isLoading: context.state.isLoading,
		isOrgAdmin: context.meta.isOrgAdmin,
	};
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
	return (
		<WorkspaceOrganizationProvider>{children}</WorkspaceOrganizationProvider>
	);
}

export function useOrganization() {
	const context = useOptionalOrganization();
	if (context === undefined) {
		throw new Error(
			"useOrganization must be used within an OrganizationProvider",
		);
	}
	return context;
}

export function useOptionalOrganization() {
	return toLegacyOrganizationContext(useOptionalWorkspaceOrganization());
}
