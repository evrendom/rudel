import { format, parseISO } from "date-fns";
import type { DashboardOutputSnapshot } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

type DailyPoint = DashboardOutputSnapshot["dailyPattern"][number];

function getRateTone(point: DailyPoint) {
	if (point.commitRate == null) {
		return "regular";
	}

	if (point.commitRate >= 60) {
		return "green";
	}

	if (point.commitRate >= 45) {
		return "orange";
	}

	return "red";
}

function getStatusLine(point: DailyPoint) {
	if (point.commits == null || point.sessions == null) {
		return "Awaiting activity";
	}

	return `${point.commits} committed sessions from ${point.sessions} sessions`;
}

function getStatusToneClassName(tone: ReturnType<typeof getRateTone>) {
	return cn("dashboardy-preview-status-copy", "dashboardy-board-status-copy", {
		"dashboardy-board-status-copy--orange": tone === "orange",
		"dashboardy-board-status-copy--red": tone === "red",
	});
}

function getDotToneClassName(tone: ReturnType<typeof getRateTone>) {
	return cn("dashboardy-board-status-dot", {
		"dashboardy-board-status-dot--orange": tone === "orange",
		"dashboardy-board-status-dot--red": tone === "red",
	});
}

function getSecondaryTimeClassName(tone: ReturnType<typeof getRateTone>) {
	return cn("dashboardy-mono dashboardy-preview-time", {
		"dashboardy-board-actual": tone === "regular",
		"dashboardy-board-actual--green": tone === "green",
		"dashboardy-board-actual--orange": tone === "orange",
		"dashboardy-board-actual--red": tone === "red",
	});
}

export function DashboardDailyRateStrip({
	data,
}: {
	data: DashboardOutputSnapshot["dailyPattern"];
}) {
	return (
		<ul className="flex flex-col">
			{data.map((point) => {
				const tone = getRateTone(point);

				return (
					<li key={point.date} className="dashboardy-preview-feed-row">
						<div className="dashboardy-preview-primary">
							<div className="dashboardy-preview-times">
								<p className="dashboardy-mono dashboardy-preview-time">
									{point.axisLabel}
								</p>
								<p className={getSecondaryTimeClassName(tone)}>
									{format(parseISO(point.date), "MMM d")}
								</p>
							</div>
							<div className="min-w-0 flex flex-col gap-1">
								<p className="dashboardy-preview-city">
									{point.commitRate == null
										? "No rate yet"
										: `${point.commitRate}% commit rate`}
								</p>
								<div className="dashboardy-preview-status">
									<span className={getDotToneClassName(tone)} />
									<p className={getStatusToneClassName(tone)}>
										{getStatusLine(point)}
									</p>
								</div>
							</div>
						</div>
						<div className="dashboardy-preview-meta">
							<p className="dashboardy-preview-flight-code">
								{point.commits == null
									? "No committed sessions"
									: `${point.commits} committed`}
							</p>
							<p className="dashboardy-preview-detail">
								{point.sessions == null
									? "Future day"
									: `${point.sessions} sessions`}
							</p>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
