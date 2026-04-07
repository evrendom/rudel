import { BellIcon, CloudSunIcon, DownloadIcon, Share2Icon } from "lucide-react";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/app/ui/card";
import { Separator } from "@/app/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/app/ui/tabs";
import type { DashboardyAirportSnapshot } from "@/features/dashboardy/data/dashboardy-static-data";

export function DashboardyHero({
	snapshot,
	onShare,
}: {
	snapshot: DashboardyAirportSnapshot;
	onShare: () => void;
}) {
	return (
		<section className="dashboardy-hero flex flex-col">
			<Card
				size="sm"
				className="dashboardy-hero-card overflow-hidden rounded-none border-none bg-transparent py-0 shadow-none ring-0"
			>
				<CardContent className="px-0">
					<div className="dashboardy-identity-row">
						<Badge variant="ghost" className="dashboardy-identity-code-badge">
							{snapshot.airportCode}
						</Badge>
						<Separator
							orientation="vertical"
							className="dashboardy-identity-separator hidden sm:block"
						/>
						<div className="dashboardy-identity-meta">
							<CardTitle className="dashboardy-identity-name">
								{snapshot.airportName}
							</CardTitle>
							<CardDescription className="dashboardy-identity-location">
								{snapshot.airportLocation}
							</CardDescription>
							<div className="dashboardy-identity-subrow">
								<time className="dashboardy-identity-time">
									{snapshot.localTime}
								</time>
								<div className="dashboardy-identity-weather">
									<CloudSunIcon data-icon="inline-start" />
									<Badge
										variant="ghost"
										className="dashboardy-weather-badge-inline"
									>
										{snapshot.heroTemperature}
									</Badge>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="dashboardy-sticky-nav">
				<div className="dashboardy-sticky-nav-shell">
					<Tabs
						value="overview"
						onValueChange={() => {}}
						className="dashboardy-sticky-tabs"
					>
						<TabsList className="dashboardy-sticky-tabs-list">
							<TabsTrigger value="overview" className="dashboardy-sticky-tab">
								Overview
							</TabsTrigger>
							<TabsTrigger value="departures" className="dashboardy-sticky-tab">
								Departures
							</TabsTrigger>
							<TabsTrigger value="arrivals" className="dashboardy-sticky-tab">
								Arrivals
							</TabsTrigger>
						</TabsList>
					</Tabs>

					<div className="dashboardy-sticky-actions">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="dashboardy-sticky-action"
						>
							<BellIcon data-icon="inline-start" />
							Email Alerts
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="dashboardy-sticky-action hidden sm:inline-flex"
						>
							<DownloadIcon data-icon="inline-start" />
							Download Flighty
						</Button>
						<Button
							type="button"
							size="sm"
							variant="default"
							className="dashboardy-sticky-share"
							onClick={onShare}
						>
							<Share2Icon data-icon="inline-start" />
							Share
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
