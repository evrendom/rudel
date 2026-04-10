import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { CliSetupHint } from "@/components/analytics/CliSetupHint";
import { cn } from "@/lib/utils";
import "@/features/dashboard/dashboard-theme.css";

export function DashboardGetStartedPage() {
	return (
		<div className="dashboardy-page px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
			<div className="@container/dashboard-page mx-auto flex w-full max-w-4xl flex-col gap-6">
				<div className="dashboardy-card rounded-[1.75rem] border px-6 py-7 sm:px-8 sm:py-8">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<p className="text-[11px] font-semibold tracking-[0.26em] text-[color:var(--dashboardy-subtle)] uppercase">
								Get started
							</p>
							<h1 className="dashboardy-section-title text-3xl font-semibold tracking-[-0.04em]">
								Set up uploads before you open the dashboard
							</h1>
							<p className="dashboardy-summary-copy max-w-2xl text-sm leading-6 sm:text-[15px]">
								Your workspace is ready. Run these commands once so Rudel can
								start ingesting sessions, then come back to the dashboard.
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<Link
								to={appRoutes.dashboard()}
								className={cn(buttonVariants({ size: "sm" }))}
							>
								Go to dashboard
							</Link>
						</div>
					</div>
				</div>
				<CliSetupHint />
			</div>
		</div>
	);
}
