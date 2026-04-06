import * as React from "react";
import type { CSSProperties } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { AppProviders } from "@/app/providers/AppProviders";
import { AppToaster } from "@/app/ui/AppToaster";
import "@/app/app-surface.css";
import { SidebarInset, SidebarProvider } from "@/app/ui/sidebar";
import { TooltipProvider } from "@/app/ui/tooltip";
import { AppSidebar } from "@/features/shell/components/AppSidebar";
import { SidebarShellDebugPanel } from "@/features/shell/components/SidebarShellDebugPanel";
import { SiteHeader } from "@/features/shell/components/SiteHeader";
import { shellRoutes } from "@/features/shell/config/shell-routes";
import { SHOW_SIDEBAR_NEWS_MODE } from "@/features/shell/config/sidebar-news";
import {
	appendSidebarShellDebugParams,
	getSidebarShellDebugState,
} from "@/features/shell/config/sidebar-shell-debug";

const defaultDashboardChromeValues = {
	turbulence: {
		opacity: 0.18,
		highlightOpacity: 0.15,
		largeSize: 130,
		smallSize: 136,
		contrast: 190,
		darkness: 0.8,
	},
	shadow: {
		x: 0,
		y: 0,
		blur: 4,
		spread: 0,
		color: "#000000",
		opacity: 0.13,
	},
} as const;

function hexToRgba(hex: string, alpha: number) {
	const sanitized = hex.replace("#", "").trim();
	const normalized =
		sanitized.length === 3
			? sanitized
					.split("")
					.map((char) => `${char}${char}`)
					.join("")
			: sanitized;

	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
		return `rgba(0, 0, 0, ${alpha})`;
	}

	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const defaultChromeStyle = {
	"--dashboard-01-chrome-turbulence-opacity": `${defaultDashboardChromeValues.turbulence.opacity}`,
	"--dashboard-01-chrome-highlight-opacity": `${defaultDashboardChromeValues.turbulence.highlightOpacity}`,
	"--dashboard-01-chrome-noise-large-size": `${defaultDashboardChromeValues.turbulence.largeSize}px`,
	"--dashboard-01-chrome-noise-small-size": `${defaultDashboardChromeValues.turbulence.smallSize}px`,
	"--dashboard-01-chrome-turbulence-contrast": `${defaultDashboardChromeValues.turbulence.contrast}%`,
	"--dashboard-01-chrome-turbulence-darkness": `${defaultDashboardChromeValues.turbulence.darkness}`,
	"--dashboard-01-window-shadow": `${defaultDashboardChromeValues.shadow.x}px ${defaultDashboardChromeValues.shadow.y}px ${defaultDashboardChromeValues.shadow.blur}px ${defaultDashboardChromeValues.shadow.spread}px ${hexToRgba(defaultDashboardChromeValues.shadow.color, defaultDashboardChromeValues.shadow.opacity)}`,
} as CSSProperties;

const shellShortcutRouteByKey = Object.fromEntries(
	shellRoutes.map((route) => [route.shortcut.toLowerCase(), route.path]),
) as Record<string, string>;

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	if (target.isContentEditable) {
		return true;
	}

	const editableContainer = target.closest(
		'input, textarea, select, [contenteditable="true"], [role="textbox"]',
	);
	return editableContainer instanceof HTMLElement;
}

export function AppShellLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const isSidebarNewsModeEnabled = SHOW_SIDEBAR_NEWS_MODE;
	const sidebarShellDebugState = getSidebarShellDebugState(searchParams);
	const sidebarTuning = sidebarShellDebugState.tuning;
	const handleShellShortcutKeyDown = React.useEffectEvent(
		(event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.shiftKey ||
				event.repeat ||
				isEditableTarget(event.target)
			) {
				return;
			}

			const nextPath = shellShortcutRouteByKey[event.key.toLowerCase()];
			if (!nextPath || location.pathname === nextPath) {
				return;
			}

			event.preventDefault();
			navigate(appendSidebarShellDebugParams(nextPath, searchParams));
		},
	);

	useMountEffect(() => {
		window.addEventListener("keydown", handleShellShortcutKeyDown);
		return () =>
			window.removeEventListener("keydown", handleShellShortcutKeyDown);
	});

	return (
		<AppProviders>
			<TooltipProvider>
				<div className="dashboard-01-preview h-dvh overflow-hidden text-foreground">
					<SidebarProvider
						defaultOpen={isSidebarNewsModeEnabled}
						open={isSidebarNewsModeEnabled ? true : undefined}
						onOpenChange={isSidebarNewsModeEnabled ? () => {} : undefined}
						className="dashboard-01-chrome-frame h-full overflow-hidden"
						style={
							{
								"--sidebar-width": `${sidebarTuning.expandedWidth}rem`,
								"--sidebar-width-icon": `${sidebarTuning.collapsedWidth}rem`,
								"--header-height": "calc(var(--spacing) * 12)",
								"--sidebar-section-first-margin-top": `${sidebarTuning.sectionMarginTop}rem`,
								"--sidebar-rail-inset-left": `${sidebarTuning.railInsetLeft}rem`,
								"--sidebar-rail-inset-right": `${sidebarTuning.railInsetRight}rem`,
								"--sidebar-collapsed-section-padding-x": `${sidebarTuning.collapsedSectionPaddingX}rem`,
								"--sidebar-expanded-section-padding-x": `${sidebarTuning.expandedSectionPaddingX}rem`,
								"--sidebar-collapsed-footer-padding-x": `${sidebarTuning.collapsedFooterPaddingX}rem`,
								"--sidebar-expanded-footer-padding-x": `${sidebarTuning.expandedFooterPaddingX}rem`,
								"--sidebar-expanded-footer-padding-bottom": `${sidebarTuning.expandedFooterPaddingBottom}rem`,
								"--sidebar-collapsed-stack-gap": `${sidebarTuning.collapsedStackGap}rem`,
								"--sidebar-expanded-stack-gap": `${sidebarTuning.expandedStackGap}rem`,
								"--sidebar-row-height": `${sidebarTuning.rowHeight}rem`,
								"--sidebar-row-radius": `${sidebarTuning.rowRadius}rem`,
								"--sidebar-collapsed-row-padding-left": `${sidebarTuning.collapsedRowPaddingLeft}rem`,
								"--sidebar-collapsed-row-padding-right": `${sidebarTuning.collapsedRowPaddingRight}rem`,
								"--sidebar-row-padding-left": `${sidebarTuning.rowPaddingLeft}rem`,
								"--sidebar-row-padding-right": `${sidebarTuning.rowPaddingRight}rem`,
								"--sidebar-row-gap": `${sidebarTuning.rowGap}rem`,
								"--sidebar-icon-lane-size": `${sidebarTuning.iconLaneSize}rem`,
								"--sidebar-icon-size": `${sidebarTuning.iconSize}rem`,
								"--sidebar-avatar-size": `${sidebarTuning.avatarSize}rem`,
								"--sidebar-label-font-size": `${sidebarTuning.labelFontSize}rem`,
								"--sidebar-shortcut-font-size": `${sidebarTuning.shortcutFontSize}rem`,
								"--sidebar-row-idle-bg": sidebarTuning.rowIdleBg,
								"--sidebar-row-hover-bg": sidebarTuning.rowHoverBg,
								"--sidebar-row-active-bg": sidebarTuning.rowActiveBg,
								"--sidebar-row-fg": sidebarTuning.rowFg,
								"--sidebar-row-active-fg": sidebarTuning.rowActiveFg,
								...defaultChromeStyle,
							} as CSSProperties
						}
					>
						<AppSidebar
							shellMotionShowBorders={sidebarShellDebugState.showBorders}
							shellMotionVariant={sidebarShellDebugState.variant}
							shellMotionForceLabels={sidebarShellDebugState.alwaysShowLabels}
						/>
						<SidebarInset className="dashboard-01-window min-h-0 overflow-hidden overscroll-none bg-[var(--dashboard-01-content-background)] md:m-2 md:ml-0 md:rounded-[12px] md:shadow-[0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]">
							<SiteHeader />
							<div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-none">
								<div className="@container/main flex min-h-0 flex-1 flex-col gap-2">
									<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
										<Outlet />
									</div>
								</div>
							</div>
						</SidebarInset>
					</SidebarProvider>
				</div>
				<SidebarShellDebugPanel debugState={sidebarShellDebugState} />
				<AppToaster richColors position="bottom-right" />
			</TooltipProvider>
		</AppProviders>
	);
}
