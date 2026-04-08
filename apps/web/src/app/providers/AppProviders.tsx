import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/providers/ThemeProvider";

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<ThemeProvider>{children}</ThemeProvider>
			</BrowserRouter>
		</QueryClientProvider>
	);
}
