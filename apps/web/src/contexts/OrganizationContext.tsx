import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { authClient } from "../lib/auth-client";

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
	/** Whether the current user is an owner or admin of the active org */
	isOrgAdmin: boolean;
}

const ACTIVE_ORG_CACHE_KEY = "rudel:activeOrg";

function getCachedOrg(): Organization | null {
	try {
		const raw = localStorage.getItem(ACTIVE_ORG_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.id === "string") return parsed;
	} catch {
		// Corrupted cache, ignore
	}
	return null;
}

function setCachedOrg(org: Organization | null) {
	try {
		if (org) {
			localStorage.setItem(ACTIVE_ORG_CACHE_KEY, JSON.stringify(org));
		} else {
			localStorage.removeItem(ACTIVE_ORG_CACHE_KEY);
		}
	} catch {
		// Storage full or unavailable, ignore
	}
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(
	undefined,
);

export function OrganizationProvider({ children }: { children: ReactNode }) {
	const { data: activeOrg, isPending: activeLoading } =
		authClient.useActiveOrganization();
	const { data: orgs, isPending: listLoading } =
		authClient.useListOrganizations();
	const { data: activeMember } = authClient.useActiveMember();
	const [switching, setSwitching] = useState(false);
	const [autoSetFailed, setAutoSetFailed] = useState(false);
	const prevOrgsRef = useRef(orgs);
	const [cachedOrg] = useState(getCachedOrg);

	// Persist active org to localStorage whenever it changes
	useEffect(() => {
		if (activeOrg) {
			setCachedOrg({
				id: activeOrg.id,
				name: activeOrg.name,
				slug: activeOrg.slug,
				logo: activeOrg.logo,
			});
		}
	}, [activeOrg]);

	// Auto-set active org if none is set but user has orgs
	useEffect(() => {
		// Reset autoSetFailed when the org list changes (e.g. user joins a new org)
		if (prevOrgsRef.current !== orgs) {
			prevOrgsRef.current = orgs;
			if (autoSetFailed) {
				setAutoSetFailed(false);
				return;
			}
		}

		if (
			!activeLoading &&
			!listLoading &&
			!activeOrg &&
			orgs &&
			orgs.length > 0 &&
			!switching &&
			!autoSetFailed
		) {
			setSwitching(true);
			authClient.organization
				.setActive({ organizationId: orgs[0].id })
				.catch(() => {
					setAutoSetFailed(true);
				})
				.finally(() => setSwitching(false));
		}
	}, [activeOrg, orgs, activeLoading, listLoading, switching, autoSetFailed]);

	const switchOrg = async (orgId: string) => {
		setSwitching(true);
		try {
			await authClient.organization.setActive({ organizationId: orgId });
		} finally {
			setSwitching(false);
		}
	};

	// Use cached org as optimistic value while better-auth is still loading
	const resolvedOrg = activeOrg ?? (activeLoading ? cachedOrg : null);

	// Personal workspace (no active org) means you're the owner.
	// For real orgs, check the member role.
	const memberRole = activeMember?.role;
	const isOrgAdmin =
		!resolvedOrg || memberRole === "owner" || memberRole === "admin";

	return (
		<OrganizationContext.Provider
			value={{
				activeOrg: resolvedOrg,
				organizations: orgs ?? [],
				switchOrg,
				isLoading: activeLoading || listLoading || switching,
				isOrgAdmin,
			}}
		>
			{children}
		</OrganizationContext.Provider>
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
