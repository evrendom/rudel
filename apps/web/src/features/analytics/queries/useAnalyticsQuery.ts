import {
	type UseQueryOptions,
	type UseQueryResult,
	useQuery,
} from "@tanstack/react-query";
import { useOrganization } from "@/features/workspace/organization/useOrganization";

export function useAnalyticsQuery<TData>(
	options: UseQueryOptions<TData>,
): UseQueryResult<TData> {
	const { state } = useOrganization();

	return useQuery({
		...options,
		queryKey: ["org", state.activeOrg?.id, ...(options.queryKey ?? [])],
		enabled: !!state.activeOrg?.id && options.enabled !== false,
	});
}
