import { NavLink, Outlet } from "react-router-dom";
import { primarySettingsRoutes } from "@/features/settings/config/settings-routes";
import { useShellRoutePath } from "@/features/shell/hooks/use-shell-route-path";
import { cn } from "@/lib/utils";

export function SettingsLayout() {
	const getShellRoutePath = useShellRoutePath();

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<div className="overflow-x-auto px-4 lg:px-6">
				<nav
					aria-label="Settings sections"
					className="flex w-max min-w-full items-center"
				>
					<ul className="flex items-center gap-1 rounded-2xl bg-black/3 p-1 ring-1 ring-black/5 dark:bg-white/4 dark:ring-white/8">
						{primarySettingsRoutes.map((route) => (
							<li key={route.id}>
								<NavLink
									to={getShellRoutePath(route.path)}
									className={({ isActive }) =>
										cn(
											"flex h-8 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)]",
											isActive &&
												"bg-white text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-black/5 dark:bg-white/8 dark:shadow-none dark:ring-white/8",
										)
									}
								>
									{route.label}
								</NavLink>
							</li>
						))}
					</ul>
				</nav>
			</div>
			<Outlet />
		</div>
	);
}
