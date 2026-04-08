import { useLocation } from "react-router-dom";
import { Separator } from "@/app/ui/separator";
import { SidebarTrigger } from "@/app/ui/sidebar";
import {
	getActiveSettingsRouteId,
	settingsRouteMap,
} from "@/features/settings/config/settings-routes";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";

export function SiteHeader() {
	const location = useLocation();
	const currentShellRoute = useCurrentShellRoute();
	const title =
		currentShellRoute.id === "settings"
			? settingsRouteMap[getActiveSettingsRouteId(location.pathname)].label
			: currentShellRoute.title;

	return (
		<header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-[var(--dashboard-01-content-background)] px-4 lg:px-6">
			<div className="flex min-w-0 items-center gap-2">
				<SidebarTrigger className="-ml-1 size-9 rounded-lg text-[color:var(--dashboard-01-rail-icon)] hover:bg-[color:var(--dashboard-01-rail-hover)] hover:text-[color:var(--dashboard-01-rail-icon-active)] md:hidden" />
				<Separator
					orientation="vertical"
					className="data-vertical:h-4 data-vertical:self-auto md:hidden"
				/>
				<h1 className="truncate text-base font-medium [font-family:var(--app-font-heading)]">
					{title}
				</h1>
			</div>
		</header>
	);
}
