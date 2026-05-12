import { buildWorkspaceSettingsViewModel } from "@/features/settings/workspace/workspace-settings-view-model";
import { useFullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";

function readSessionUserId(value: unknown) {
	return typeof value === "string" ? value : "";
}

export function useWorkspaceSettingsData() {
	const { state, meta } = useOrganization();
	const { data: session } = authClient.useSession();
	const {
		data: fullOrg,
		isLoading: isFullOrgPending,
		isError,
		invalidate,
	} = useFullOrganization(state.activeOrg?.id);

	const currentUserId = readSessionUserId(session?.user?.id);
	const viewModel = buildWorkspaceSettingsViewModel({
		activeOrg: state.activeOrg,
		organizations: state.organizations,
		fullOrg,
		currentUserId,
		isOrgAdmin: meta.isOrgAdmin,
		isWorkspacePending: state.isLoading,
		isFullOrgPending,
		isError,
	});

	return {
		...viewModel,
		invalidate,
	};
}
