import {
	type UseQueryOptions,
	type UseQueryResult,
	useQuery,
} from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";

export function useAnalyticsQuery<TData>(
	options: UseQueryOptions<TData>,
): UseQueryResult<TData> {
	const { activeOrg } = useOrganization();
	return useQuery({
		...options,
		queryKey: ["org", activeOrg?.id, ...(options.queryKey ?? [])],
		enabled: !!activeOrg?.id && options.enabled !== false,
	});
}
