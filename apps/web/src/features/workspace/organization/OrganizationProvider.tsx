import { createContext, type ReactNode, useContext, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type { WorkspaceContextValue } from "@/features/workspace/organization/types";
import { authClient } from "@/lib/auth-client";

const OrganizationContext = createContext<WorkspaceContextValue | undefined>(
	undefined,
);

function OrganizationAutoSelectMount({
	onAttempted,
	onSucceeded,
	onSettled,
	organizationId,
}: {
	onAttempted: (organizationId: string) => void;
	onSucceeded: (organizationId: string) => void;
	onSettled: () => void;
	organizationId: string;
}) {
	useMountEffect(() => {
		onAttempted(organizationId);
		void authClient.organization
			.setActive({ organizationId })
			.then((result) => {
				if (!result.error) {
					onSucceeded(organizationId);
				}
			})
			.finally(() => {
				onSettled();
			});
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
	const [optimisticActiveOrgId, setOptimisticActiveOrgId] = useState<
		string | null
	>(null);

	const firstOrganizationId = orgs?.[0]?.id ?? null;
	const optimisticActiveOrg =
		orgs?.find((organization) => organization.id === optimisticActiveOrgId) ??
		null;
	const resolvedActiveOrg = activeOrg ?? optimisticActiveOrg;
	const shouldAutoSelect =
		!activeLoading &&
		!listLoading &&
		!resolvedActiveOrg &&
		!switching &&
		firstOrganizationId !== null &&
		attemptedAutoSelectOrgId !== firstOrganizationId;

	const switchOrganization = async (orgId: string) => {
		setSwitching(true);
		try {
			const result = await authClient.organization.setActive({
				organizationId: orgId,
			});
			if (!result.error) {
				setOptimisticActiveOrgId(orgId);
			}
		} finally {
			setSwitching(false);
		}
	};

	const memberRole = activeMember?.role;
	const contextValue: WorkspaceContextValue = {
		state: {
			activeOrg: resolvedActiveOrg,
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
					onSucceeded={(organizationId) =>
						setOptimisticActiveOrgId(organizationId)
					}
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
