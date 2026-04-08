import type { ReactNode } from "react";
import { DateRangeProvider } from "@/features/analytics/date-range/DateRangeProvider";
import { ChatwootBootstrap } from "@/features/support/chatwoot/ChatwootBootstrap";
import { OrganizationProvider } from "@/features/workspace/organization/OrganizationProvider";

type AppProvidersProps = {
	children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<OrganizationProvider>
			<DateRangeProvider>
				<ChatwootBootstrap />
				{children}
			</DateRangeProvider>
		</OrganizationProvider>
	);
}
