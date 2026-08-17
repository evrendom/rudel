import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import type { SessionThreadOverviewTimelineEvent } from "./session-thread-overview-events";
import {
	getLivelineCallAtX,
	getLivelineCallY,
} from "./session-thread-overview-liveline-geometry";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";
import { getChartX } from "./session-thread-overview-strip-utils";

type EventCluster = {
	errorEvents: SessionThreadOverviewTimelineEvent[];
	skillEvents: SessionThreadOverviewTimelineEvent[];
	xRatio: number;
};

interface EventDotStyle extends CSSProperties {
	"--session-event-x": string;
	"--session-event-y": string;
}

function buildEventClusters(
	events: readonly SessionThreadOverviewTimelineEvent[],
	config: SessionThreadOverviewStripConfig,
) {
	const clusters = new Map<string, EventCluster>();
	for (const event of events) {
		if (
			event.xRatio < config.xDomainStartRatio ||
			event.xRatio > config.xDomainEndRatio
		) {
			continue;
		}

		const clusterKey = event.xRatio.toFixed(6);
		const cluster = clusters.get(clusterKey) ?? {
			errorEvents: [],
			skillEvents: [],
			xRatio: event.xRatio,
		};
		if (event.kind === "error") {
			cluster.errorEvents.push(event);
		} else {
			cluster.skillEvents.push(event);
		}
		clusters.set(clusterKey, cluster);
	}
	return [...clusters.entries()];
}

function getEventPosition(
	xRatio: number,
	config: SessionThreadOverviewStripConfig,
	series: SessionOverviewCallSeries,
): EventDotStyle {
	const x = getChartX(xRatio, config);
	const hit = getLivelineCallAtX(series, config, x);
	const y = hit ? getLivelineCallY(series, config, hit.call) : config.axisY;
	return {
		"--session-event-x": `${(x / config.chartWidth) * 100}%`,
		"--session-event-y": `${(y / config.chartHeight) * 100}%`,
	};
}

function getEventCount(events: readonly SessionThreadOverviewTimelineEvent[]) {
	return events.reduce((total, event) => total + event.count, 0);
}

function SessionOverviewEventDot({
	events,
	kind,
}: {
	events: readonly SessionThreadOverviewTimelineEvent[];
	kind: "error" | "skill";
}) {
	if (events.length === 0) {
		return null;
	}

	return (
		<span
			className={cn(
				"size-1.5 shrink-0 rounded-full ring-1 ring-(--session-overview-surface)",
				kind === "error"
					? "bg-red-600 dark:bg-red-400"
					: "bg-(--session-overview-accent)",
			)}
			data-count={getEventCount(events)}
			data-session-overview-event={kind}
			title={events.map((event) => event.label).join(", ")}
		/>
	);
}

export function SessionThreadOverviewEventDots({
	config,
	events,
	series,
}: {
	config: SessionThreadOverviewStripConfig;
	events: readonly SessionThreadOverviewTimelineEvent[];
	series: SessionOverviewCallSeries;
}) {
	const clusters = buildEventClusters(events, config);
	const visibleEvents = clusters.flatMap(([, cluster]) => [
		...cluster.errorEvents,
		...cluster.skillEvents,
	]);
	const errorCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "error"),
	);
	const skillCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "skill"),
	);

	return (
		<div
			aria-label={`${errorCount.toLocaleString()} errors and ${skillCount.toLocaleString()} skill uses on the chart`}
			className="pointer-events-none absolute inset-0 z-30"
			data-session-overview-event-dots
			role="img"
		>
			{clusters.map(([clusterKey, cluster]) => (
				<span
					key={clusterKey}
					className="absolute left-(--session-event-x) top-(--session-event-y) flex -translate-1/2 items-center gap-0.5"
					data-session-overview-event-cluster
					style={getEventPosition(cluster.xRatio, config, series)}
				>
					<SessionOverviewEventDot events={cluster.errorEvents} kind="error" />
					<SessionOverviewEventDot events={cluster.skillEvents} kind="skill" />
				</span>
			))}
		</div>
	);
}
