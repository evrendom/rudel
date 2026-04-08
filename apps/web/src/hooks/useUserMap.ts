import { useMemo } from "react";
import { useFullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";

export function useUserMap() {
	const { state } = useOrganization();
	const { data: fullOrg, isLoading } = useFullOrganization(state.activeOrg?.id);

	const userMap = useMemo(() => {
		const record: Record<string, string> = {};
		if (fullOrg?.members) {
			for (const member of fullOrg.members) {
				record[member.userId] = member.user.name;
			}
		}
		return record;
	}, [fullOrg]);

	return { userMap, isLoading };
}
