import { useMemo } from "react";
import { useFullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";

export function useUserMap() {
	const { state } = useOrganization();
	const { data: fullOrg, isLoading } = useFullOrganization(state.activeOrg?.id);

	const { userMap, avatarMap } = useMemo(() => {
		const names: Record<string, string> = {};
		const avatars: Record<string, string> = {};

		for (const member of fullOrg?.members ?? []) {
			names[member.userId] = member.user.name;

			if (member.user.image) {
				avatars[member.userId] = member.user.image;
			}
		}

		return { userMap: names, avatarMap: avatars };
	}, [fullOrg]);

	return { userMap, avatarMap, isLoading };
}
