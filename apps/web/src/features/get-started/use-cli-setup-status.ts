import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

const CLI_SETUP_STATUS_REFETCH_INTERVAL_MS = 500;

export function useCliSetupStatus({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) {
	const setupStatusQuery = useQuery({
		...orpc.cli.setupStatus.queryOptions(),
		enabled,
		refetchInterval: (query) => {
			if (!enabled || query.state.data?.hasCliLogin) {
				return false;
			}

			return CLI_SETUP_STATUS_REFETCH_INTERVAL_MS;
		},
	});

	return {
		hasCliLogin: setupStatusQuery.data?.hasCliLogin === true,
		isLoading:
			enabled && !setupStatusQuery.isFetched && setupStatusQuery.isPending,
	};
}
