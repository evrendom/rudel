import { RailLink } from "@/features/shell/components/shell-rail";
import { UserRailButton } from "@/features/shell/components/UserRailButton";
import { WorkspaceMenuButton } from "@/features/shell/components/WorkspaceMenuButton";
import { shellRoutes } from "@/features/shell/config/shell-routes";
import { useShellRoutePath } from "@/features/shell/hooks/use-shell-route-path";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";

export function BottomRailNavigation() {
	const currentShellRoute = useCurrentShellRoute();
	const getShellRoutePath = useShellRoutePath();

	return (
		<footer className="dashboard-01-bottom-rail dashboard-01-chrome-frame flex min-w-0 shrink-0 items-center pb-[env(safe-area-inset-bottom)]">
			<div className="flex min-h-14 min-w-0 flex-1 items-center px-2">
				<div className="flex size-12 shrink-0 items-center justify-center">
					<WorkspaceMenuButton mode="collapsed" variant="bottom-rail" />
				</div>
				<nav
					aria-label="Primary"
					className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					<ul className="mx-auto flex w-max min-w-full list-none items-center justify-center">
						{shellRoutes.map((route) => (
							<RailLink
								key={route.id}
								to={getShellRoutePath(route.path)}
								label={route.navLabel}
								shortcut={route.shortcut}
								mode="collapsed"
								placement="bottom-rail"
								active={currentShellRoute.id === route.id}
							>
								{route.icon}
							</RailLink>
						))}
					</ul>
				</nav>
				<div className="flex size-12 shrink-0 items-center justify-center">
					<UserRailButton mode="collapsed" variant="bottom-rail" />
				</div>
			</div>
		</footer>
	);
}
