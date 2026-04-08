import { createContext, type ReactNode, useContext, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type { WorkspaceContextValue } from "@/features/workspace/organization/types";
import { authClient } from "@/lib/auth-client";

const OrganizationContext = createContext<WorkspaceContextValue | undefined>(
	undefined,
);

function OrganizationAutoSelectMount({
	onAttempted,
	onSettled,
	organizationId,
}: {
	onAttempted: (organizationId: string) => void;
	onSettled: () => void;
	organizationId: string;
}) {
	useMountEffect(() => {
		let isCancelled = false;

		onAttempted(organizationId);
		void authClient.organization.setActive({ organizationId }).finally(() => {
			if (isCancelled) {
				return;
			}

			onSettled();
		});

		return () => {
			isCancelled = true;
		};
	});

	return null;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
	const { data: activeOrg, isPending: activeLoading } =
		authClient.useActiveOrganization();
	const { data: orgs, isPending: listLoading } =
		authClient.useListOrganizations();
	const { data: activeMember } = authClient.useActiveMember();
	const [switching, setSwitching] = useState(false);
	const [attemptedAutoSelectOrgId, setAttemptedAutoSelectOrgId] = useState<
		string | null
	>(null);

	const firstOrganizationId = orgs?.[0]?.id ?? null;
	const shouldAutoSelect =
		!activeLoading &&
		!listLoading &&
		!activeOrg &&
		!switching &&
		firstOrganizationId !== null &&
		attemptedAutoSelectOrgId !== firstOrganizationId;

	const switchOrganization = async (orgId: string) => {
		setSwitching(true);
		try {
			await authClient.organization.setActive({ organizationId: orgId });
		} finally {
			setSwitching(false);
		}
	};

	const memberRole = activeMember?.role;
	const contextValue: WorkspaceContextValue = {
		state: {
			activeOrg: activeOrg ?? null,
			organizations: orgs ?? [],
			isLoading: activeLoading || listLoading || switching,
		},
		actions: {
			switchOrganization,
		},
		meta: {
			isOrgAdmin:
				!activeOrg || memberRole === "owner" || memberRole === "admin",
		},
	};

	return (
		<>
			{shouldAutoSelect ? (
				<OrganizationAutoSelectMount
					key={firstOrganizationId}
					organizationId={firstOrganizationId}
					onAttempted={(organizationId) => {
						setAttemptedAutoSelectOrgId(organizationId);
						setSwitching(true);
					}}
					onSettled={() => setSwitching(false)}
				/>
			) : null}
			<OrganizationContext.Provider value={contextValue}>
				{children}
			</OrganizationContext.Provider>
		</>
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
	return useContext(OrganizationContext);
}
