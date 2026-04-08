import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { ChatwootBootstrap } from "@/components/support/ChatwootBootstrap";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { FilterProvider } from "@/contexts/FilterContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { AppSidebar } from "@/features/shell/components/AppSidebar";
import { SiteHeader } from "@/features/shell/components/SiteHeader";

export function AppShellLayout() {
	return (
		<OrganizationProvider>
			<DateRangeProvider>
				<FilterProvider>
					<div className="fixed inset-0 flex overflow-hidden bg-surface">
						<Toaster richColors position="bottom-right" />
						<ChatwootBootstrap />
						<AppSidebar />
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
							<SiteHeader />
							<main className="min-h-0 flex-1 overflow-y-auto">
								<Outlet />
							</main>
						</div>
					</div>
				</FilterProvider>
			</DateRangeProvider>
		</OrganizationProvider>
	);
}
