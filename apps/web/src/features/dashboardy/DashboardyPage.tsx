import {
	CloudSunIcon,
	PlaneLandingIcon,
	PlaneTakeoffIcon,
	Share2Icon,
} from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import { DashboardyDelayCard } from "@/features/dashboardy/components/DashboardyDelayCard";
import { DashboardyFlightBoard } from "@/features/dashboardy/components/DashboardyFlightBoard";
import { DashboardyHero } from "@/features/dashboardy/components/DashboardyHero";
import { DashboardyListCard } from "@/features/dashboardy/components/DashboardyListCard";
import { DashboardyStatusSummary } from "@/features/dashboardy/components/DashboardyStatusSummary";
import { dashboardySfoSnapshot } from "@/features/dashboardy/data/dashboardy-static-data";
import "@/features/dashboardy/dashboardy.css";

function WeatherCard() {
	const snapshot = dashboardySfoSnapshot;

	return (
		<Card
			size="sm"
			className="dashboardy-card overflow-hidden rounded-[1.9rem] py-0 shadow-none"
		>
			<CardHeader className="border-b border-[color:var(--dashboardy-border)] px-5 py-4">
				<CardTitle className="dashboardy-section-title text-[15px]">
					Current Weather
				</CardTitle>
			</CardHeader>
			<CardContent className="px-5 py-4">
				<div className="flex items-center justify-between gap-4 rounded-[1.3rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] p-4">
					<span className="dashboardy-icon-badge">
						<CloudSunIcon className="size-4.5 text-[color:var(--dashboardy-accent)]" />
					</span>
					<div className="flex-1">
						<p className="dashboardy-bucket-percentage text-[2rem]">
							{snapshot.weather.temperature}
						</p>
						<p className="dashboardy-list-primary mt-1">
							{snapshot.weather.condition}
						</p>
						<p className="dashboardy-footnote mt-1">
							{snapshot.weather.reportedAt}
						</p>
					</div>
					<Badge variant="secondary" className="dashboardy-weather-badge">
						{snapshot.weather.metrics[0].value}
					</Badge>
				</div>
				<div className="mt-4 grid gap-3 sm:grid-cols-2">
					{snapshot.weather.metrics.map((metric) => (
						<div key={metric.label} className="dashboardy-bucket-card">
							<p className="dashboardy-label">{metric.label}</p>
							<p className="dashboardy-list-primary mt-2">{metric.value}</p>
							<Badge
								variant="outline"
								className="dashboardy-weather-metric-badge mt-2"
							>
								{metric.statusLabel}
							</Badge>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function DailyPerformanceCard() {
	const snapshot = dashboardySfoSnapshot;

	return (
		<Card
			size="sm"
			className="dashboardy-card overflow-hidden rounded-[1.9rem] py-0 shadow-none"
		>
			<CardHeader className="border-b border-[color:var(--dashboardy-border)] px-5 py-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle className="dashboardy-section-title text-[15px]">
						Daily Performance
					</CardTitle>
					<ToggleGroup
						value={[snapshot.dailyPerformance.activeTab]}
						onValueChange={() => {}}
						variant="outline"
						size="sm"
						spacing={0}
						aria-label="Daily performance view"
						className="dashboardy-toggle-group"
					>
						<ToggleGroupItem
							value="Departures"
							className="dashboardy-toggle-item"
						>
							Departures
						</ToggleGroupItem>
						<ToggleGroupItem
							value="Arrivals"
							className="dashboardy-toggle-item"
						>
							Arrivals
						</ToggleGroupItem>
						<ToggleGroupItem value="Totals" className="dashboardy-toggle-item">
							Totals
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</CardHeader>
			<CardContent className="px-5 py-4">
				<div className="dashboardy-bucket-card">
					<Badge variant="outline" className="dashboardy-inline-badge">
						{snapshot.dailyPerformance.totalLabel}
					</Badge>
					<p className="dashboardy-bucket-percentage mt-2 text-[2.3rem]">
						{snapshot.dailyPerformance.totalValue}
					</p>
					<p className="dashboardy-list-secondary mt-1">
						{snapshot.dailyPerformance.activeTab}
					</p>
				</div>
				<div
					className="dashboardy-delay-meter dashboardy-performance-meter mt-4"
					aria-hidden="true"
				>
					{snapshot.dailyPerformance.metrics.map((metric) => (
						<span
							key={metric.label}
							className="dashboardy-delay-meter-segment dashboardy-delay-meter-segment--ontime"
							style={{ flexGrow: Number.parseInt(metric.percentLabel, 10) }}
						/>
					))}
				</div>
				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					{snapshot.dailyPerformance.metrics.map((metric) => (
						<div key={metric.label} className="dashboardy-bucket-card">
							<p className="dashboardy-label">{metric.label}</p>
							<p className="dashboardy-list-primary mt-2 text-[1.2rem]">
								{metric.percentLabel}
							</p>
							<p className="dashboardy-list-secondary mt-1">
								{metric.valueLabel}
							</p>
							<div className="dashboardy-metric-bar mt-3" aria-hidden="true">
								<span
									className="dashboardy-metric-bar-fill"
									style={{ width: metric.percentLabel }}
								/>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function DashboardyCta() {
	const snapshot = dashboardySfoSnapshot;

	return (
		<Card
			size="sm"
			className="dashboardy-card overflow-hidden rounded-[2rem] py-0 shadow-none"
		>
			<CardContent className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-col gap-2">
					<Badge
						variant="outline"
						className="border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] text-[color:var(--dashboardy-muted)]"
					>
						{snapshot.cta.eyebrow}
					</Badge>
					<h3 className="dashboardy-section-title text-[1.5rem]">
						{snapshot.cta.title}
					</h3>
					<p className="max-w-2xl text-sm text-[color:var(--dashboardy-muted)]">
						{snapshot.cta.description}
					</p>
				</div>
				<div className="flex flex-col items-start gap-2 md:items-end">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled
						className="dashboardy-action-button h-9 rounded-full border-[color:var(--dashboardy-border-strong)] bg-white/85 px-4 text-[color:var(--dashboardy-heading)]"
					>
						{snapshot.cta.buttonLabel}
					</Button>
					<p className="dashboardy-footnote">{snapshot.cta.secondaryLabel}</p>
				</div>
			</CardContent>
		</Card>
	);
}

export function DashboardyPage() {
	const previewLabelId = useId();

	async function handleShare() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success("Dashboardy link copied");
		} catch {
			toast.error("Could not copy the Dashboardy link");
		}
	}

	return (
		<div className="dashboardy-page px-4 pb-3 pt-2 lg:px-6">
			<div className="mx-auto flex max-w-[1180px] flex-col gap-4 lg:gap-5">
				<DashboardyHero
					snapshot={dashboardySfoSnapshot}
					onShare={handleShare}
				/>

				<section className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
					<div className="lg:col-span-2 xl:col-span-1">
						<DashboardyStatusSummary status={dashboardySfoSnapshot.status} />
					</div>
					<DashboardyDelayCard
						card={dashboardySfoSnapshot.delayCards[0]}
						icon={<PlaneTakeoffIcon className="size-4.5" />}
					/>
					<DashboardyDelayCard
						card={dashboardySfoSnapshot.delayCards[1]}
						icon={<PlaneLandingIcon className="size-4.5" />}
					/>
				</section>

				<section
					className="grid w-full grid-cols-1 gap-10 lg:grid-cols-2"
					aria-labelledby={previewLabelId}
				>
					<h2 id={previewLabelId} className="sr-only">
						Board previews
					</h2>
					<DashboardyFlightBoard
						mode="preview"
						title="Departures Board"
						actionLabel="View all departures"
						rows={dashboardySfoSnapshot.departuresBoard}
					/>
					<DashboardyFlightBoard
						mode="preview"
						title="Arrivals Board"
						actionLabel="View all arrivals"
						rows={dashboardySfoSnapshot.arrivalsBoard}
					/>
				</section>

				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
					<WeatherCard />
					<DailyPerformanceCard />
				</div>

				<div className="grid gap-4 xl:grid-cols-2">
					<DashboardyListCard
						kind="routes"
						title="Most Disrupted Routes"
						actionLabel="Show more"
						items={dashboardySfoSnapshot.disruptedRoutes}
					/>
					<DashboardyListCard
						kind="airlines"
						title="Most Disrupted Airlines"
						actionLabel="Show more"
						items={dashboardySfoSnapshot.disruptedAirlines}
					/>
				</div>

				<div className="grid gap-4 xl:grid-cols-3">
					<DashboardyListCard
						kind="stats"
						title="Airport Stats"
						activeRange={dashboardySfoSnapshot.airportStats.activeRange}
						rangeOptions={dashboardySfoSnapshot.airportStats.rangeOptions}
						items={dashboardySfoSnapshot.airportStats.items}
					/>
					<DashboardyListCard
						kind="routes"
						title="Busiest Routes"
						actionLabel="Show more"
						items={dashboardySfoSnapshot.busiestRoutes}
					/>
					<DashboardyListCard
						kind="airlines"
						title="Busiest Airlines"
						actionLabel="Show more"
						items={dashboardySfoSnapshot.busiestAirlines}
					/>
				</div>

				<DashboardyCta />

				<div className="grid gap-4">
					<DashboardyFlightBoard
						title="Departures Board"
						actionLabel="View all departures"
						rows={dashboardySfoSnapshot.departuresBoard}
					/>
					<DashboardyFlightBoard
						title="Arrivals Board"
						actionLabel="View all arrivals"
						rows={dashboardySfoSnapshot.arrivalsBoard}
					/>
				</div>

				<div className="flex items-center justify-end">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={handleShare}
						className="dashboardy-link-button h-8 rounded-full px-3 text-[color:var(--dashboardy-muted)]"
					>
						<Share2Icon data-icon="inline-start" />
						Share this snapshot
					</Button>
				</div>
			</div>
		</div>
	);
}
