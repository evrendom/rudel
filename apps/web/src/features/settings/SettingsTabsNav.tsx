import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/app/ui/tabs";
import {
	getActiveSettingsRouteId,
	settingsRoutes,
} from "@/features/settings/config/settings-routes";
import { appendSidebarShellDebugParams } from "@/features/shell/config/sidebar-shell-debug";

export function SettingsTabsNav() {
	const location = useLocation();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const activeTab = getActiveSettingsRouteId(location.pathname);

	return (
		<Tabs
			value={activeTab}
			onValueChange={(nextValue) => {
				const nextTab = settingsRoutes.find((tab) => tab.id === nextValue);
				if (!nextTab || nextTab.id === activeTab) {
					return;
				}

				navigate(appendSidebarShellDebugParams(nextTab.path, searchParams));
			}}
		>
			<TabsList className="w-full justify-start overflow-x-auto">
				{settingsRoutes.map((tab) => (
					<TabsTrigger key={tab.id} value={tab.id}>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
