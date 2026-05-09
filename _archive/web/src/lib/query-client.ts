import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0,
			gcTime: 10 * 60 * 1000,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});
