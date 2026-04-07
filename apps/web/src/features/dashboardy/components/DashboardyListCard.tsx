import { ArrowUpRightIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/app/ui/avatar";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import type {
	DashboardyAirlineShare,
	DashboardyRankedRoute,
	DashboardyStatItem,
} from "@/features/dashboardy/data/dashboardy-static-data";

type DashboardyListCardProps =
	| {
			title: string;
			actionLabel?: string;
			kind: "routes";
			items: DashboardyRankedRoute[];
	  }
	| {
			title: string;
			actionLabel?: string;
			kind: "airlines";
			items: DashboardyAirlineShare[];
	  }
	| {
			title: string;
			kind: "stats";
			items: DashboardyStatItem[];
			activeRange: string;
			rangeOptions: string[];
	  };

function RouteRows({ items }: { items: DashboardyRankedRoute[] }) {
	return (
		<ul className="flex flex-col">
			{items.map((item) => (
				<li key={`${item.code}-${item.name}`} className="dashboardy-list-row">
					<div className="flex min-w-0 items-center gap-3">
						<Badge variant="outline" className="dashboardy-route-badge">
							{item.code}
						</Badge>
						<div className="min-w-0">
							<p className="dashboardy-list-primary">{item.name}</p>
						</div>
					</div>
					<span className="dashboardy-list-value">{item.valueLabel}</span>
				</li>
			))}
		</ul>
	);
}

function AirlineRows({ items }: { items: DashboardyAirlineShare[] }) {
	return (
		<ul className="flex flex-col">
			{items.map((item) => (
				<li
					key={`${item.code}-${item.valueLabel}`}
					className="dashboardy-list-row"
				>
					<div className="flex min-w-0 items-center gap-3">
						<Avatar size="sm" className="dashboardy-airline-avatar">
							<AvatarFallback className="dashboardy-airline-avatar-fallback">
								{item.code}
							</AvatarFallback>
						</Avatar>
						<p className="dashboardy-list-primary">{item.code}</p>
					</div>
					<div className="flex items-center gap-3">
						{item.percentLabel ? (
							<span className="dashboardy-list-secondary">
								{item.percentLabel}
							</span>
						) : null}
						<span className="dashboardy-list-value">{item.valueLabel}</span>
					</div>
				</li>
			))}
		</ul>
	);
}

function StatRows({ items }: { items: DashboardyStatItem[] }) {
	return (
		<ul className="grid gap-3 sm:grid-cols-2">
			{items.map((item) => (
				<li key={item.label} className="dashboardy-stat-tile">
					<p className="dashboardy-label">{item.label}</p>
					<p className="dashboardy-stat-value">{item.valueLabel}</p>
				</li>
			))}
		</ul>
	);
}

export function DashboardyListCard(props: DashboardyListCardProps) {
	return (
		<Card
			size="sm"
			className="dashboardy-card overflow-hidden rounded-[1.9rem] py-0 shadow-none"
		>
			<CardHeader className="border-b border-[color:var(--dashboardy-border)] px-5 py-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle className="dashboardy-section-title text-[15px]">
						{props.title}
					</CardTitle>
					{props.kind === "stats" ? (
						<ToggleGroup
							value={[props.activeRange]}
							onValueChange={() => {}}
							variant="outline"
							size="sm"
							spacing={0}
							aria-label={`${props.title} range`}
							className="dashboardy-toggle-group"
						>
							{props.rangeOptions.map((option) => (
								<ToggleGroupItem
									key={option}
									value={option}
									className="dashboardy-toggle-item"
								>
									{option}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					) : props.actionLabel ? (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							disabled
							className="dashboardy-link-button h-7 px-0 text-xs"
						>
							{props.actionLabel}
							<ArrowUpRightIcon data-icon="inline-end" />
						</Button>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="px-5 py-3">
				{props.kind === "routes" ? <RouteRows items={props.items} /> : null}
				{props.kind === "airlines" ? <AirlineRows items={props.items} /> : null}
				{props.kind === "stats" ? <StatRows items={props.items} /> : null}
			</CardContent>
		</Card>
	);
}
