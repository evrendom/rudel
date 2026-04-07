import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { DashboardMeter } from "@/features/dashboard/components/DashboardMeter";
import type { DashboardWorkTypeStat } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardWorkTypeCards({
	items,
}: {
	items: DashboardWorkTypeStat[];
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{items.map((item) => (
				<Card key={item.label} size="sm">
					<CardHeader className="gap-1">
						<CardDescription>{item.label}</CardDescription>
						<CardTitle className="text-xl tabular-nums">
							{item.commits} commits
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="text-sm text-muted-foreground">
							{item.sessions} sessions
						</div>
						<DashboardMeter value={item.commitRate} />
						<div className="text-sm font-medium tabular-nums text-foreground">
							{item.commitRate}% commit rate
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
