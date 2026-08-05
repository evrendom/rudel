import { Link, useLocation } from "react-router-dom";
import { isSessionDetailPath } from "@/app/routes";
import { Kbd } from "@/app/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { UserRailButton } from "@/features/shell/components/UserRailButton";
import { shellRoutes } from "@/features/shell/config/shell-routes";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";
import { cn } from "@/lib/utils";

const bottomNavigationSurfaceClassName =
	"[--dock-padding:--spacing(1)] [--dock-radius:var(--radius-2xl)] flex min-w-0 items-center rounded-(--dock-radius) bg-white p-(--dock-padding) shadow-[0_10px_28px_-16px_rgba(15,23,42,0.34),0_2px_7px_rgba(15,23,42,0.08)] ring-1 ring-black/8 dark:bg-neutral-900 dark:shadow-none dark:ring-white/10";

const bottomNavigationTouchTargetClassName =
	"pointer-fine:hidden absolute top-1/2 left-1/2 size-12 -translate-1/2";

export function BottomNavigation({
	setPortalHost,
}: {
	setPortalHost: (element: HTMLElement | null) => void;
}) {
	const location = useLocation();
	const currentShellRoute = useCurrentShellRoute();
	const isSessionDetail = isSessionDetailPath(location.pathname);

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-2">
			{isSessionDetail ? (
				<div
					className={cn(
						bottomNavigationSurfaceClassName,
						"shell-bottom-navigation pointer-events-auto min-h-11 min-w-56 max-w-[calc(100vw-1rem)] justify-center",
					)}
				>
					<div ref={setPortalHost} className="flex min-w-0 justify-center" />
				</div>
			) : (
				<div className="shell-bottom-navigation shell-dock-content pointer-events-auto flex min-w-0 items-center gap-2">
					<nav
						aria-label="Primary"
						className={bottomNavigationSurfaceClassName}
					>
						<ul className="flex min-w-0 list-none items-center gap-0.5">
							{shellRoutes.map((route) => {
								const isActive = currentShellRoute.id === route.id;

								return (
									<li key={route.id}>
										<Tooltip>
											<TooltipTrigger asChild>
												<Link
													to={route.path}
													aria-current={isActive ? "page" : undefined}
													aria-label={route.navLabel}
													className={cn(
														"relative flex size-9 shrink-0 scale-100 items-center justify-center rounded-[calc(var(--dock-radius)-var(--dock-padding))] text-[color:var(--dashboard-01-rail-icon)] outline-none transition-transform duration-150 ease-out hover:bg-neutral-950/4 hover:text-[color:var(--dashboard-01-rail-icon-active)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/6 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 [&_svg]:ease-out hover:[&_svg]:-translate-y-px active:[&_svg]:translate-y-0 motion-reduce:[&_svg]:transition-none",
														isActive &&
															"bg-neutral-950/6 text-[color:var(--dashboard-01-rail-icon-active)] hover:bg-neutral-950/7 dark:bg-white/10 dark:hover:bg-white/12",
													)}
												>
													{route.icon}
													<span
														aria-hidden="true"
														className={bottomNavigationTouchTargetClassName}
													/>
												</Link>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={10}>
												<span>{route.navLabel}</span>
												<Kbd className="size-5 min-w-0 rounded-full border-0 p-0 text-[10px]">
													{route.shortcut}
												</Kbd>
											</TooltipContent>
										</Tooltip>
									</li>
								);
							})}
						</ul>
					</nav>
					<div className={bottomNavigationSurfaceClassName}>
						<UserRailButton variant="dock" />
					</div>
				</div>
			)}
		</div>
	);
}
