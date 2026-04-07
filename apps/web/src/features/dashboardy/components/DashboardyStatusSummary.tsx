import {
	ArrowRightIcon,
	CloudSunIcon,
	PlaneLandingIcon,
	PlaneTakeoffIcon,
} from "lucide-react";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import type { DashboardyAirportSnapshot } from "@/features/dashboardy/data/dashboardy-static-data";

function getSummaryIcon(label: string) {
	if (label === "Departures") {
		return <PlaneTakeoffIcon />;
	}

	if (label === "Arrivals") {
		return <PlaneLandingIcon />;
	}

	return <CloudSunIcon />;
}

export function DashboardyStatusSummary({
	status,
}: {
	status: DashboardyAirportSnapshot["status"];
}) {
	return (
		<Card
			size="sm"
			className="dashboardy-status-card h-full gap-0 overflow-hidden rounded-[1.4rem] py-0 shadow-none"
		>
			<CardHeader className="px-6 pt-6 sm:px-7 sm:pt-7">
				<div className="flex items-center gap-3">
					<span className="dashboardy-status-indicator">
						<span className="dashboardy-status-indicator-middle">
							<span className="dashboardy-status-indicator-inner" />
						</span>
					</span>
					<CardTitle className="dashboardy-section-title text-xl">
						{status.label}
					</CardTitle>
				</div>
			</CardHeader>

			<CardContent className="dashboardy-status-content px-6 pb-5 pt-5 sm:px-7">
				<div className="dashboardy-status-scroll">
					{status.summaries.map((item) => (
						<div key={item.label} className="dashboardy-status-row">
							<div className="dashboardy-status-row-icon">
								{getSummaryIcon(item.label)}
							</div>
							<div className="dashboardy-status-row-copy">
								<p className="dashboardy-status-row-title">{item.label}</p>
								<p className="dashboardy-status-row-description">
									{item.description}
								</p>
							</div>
						</div>
					))}
				</div>
			</CardContent>

			<CardFooter className="border-t-0 bg-black/4 px-6 py-0 sm:px-7">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="dashboardy-status-footer group h-[4.125rem] w-full justify-start px-0 text-[color:#c67409] hover:bg-transparent hover:text-[color:#c67409]"
				>
					{status.reportLabel}
					<ArrowRightIcon data-icon="inline-end" />
				</Button>
			</CardFooter>
		</Card>
	);
}
