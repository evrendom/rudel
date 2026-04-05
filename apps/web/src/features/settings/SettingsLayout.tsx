import { Outlet } from "react-router-dom";
import { Card, CardContent } from "@/app/ui/card";
import { SettingsTabsNav } from "@/features/settings/SettingsTabsNav";

export function SettingsLayout() {
	return (
		<>
			<div className="px-4 lg:px-6">
				<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
					<CardContent>
						<SettingsTabsNav />
					</CardContent>
				</Card>
			</div>
			<Outlet />
		</>
	);
}
