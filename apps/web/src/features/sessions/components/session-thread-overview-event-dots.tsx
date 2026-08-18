import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import type {
	SessionThreadOverviewTimelineEvent,
	SessionThreadOverviewTimelineEventKind,
} from "./session-thread-overview-events";
import {
	getLivelineCallAtX,
	getLivelineCallY,
} from "./session-thread-overview-liveline-geometry";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";
import { getChartX } from "./session-thread-overview-strip-utils";

type EventCluster = {
	errorEvents: SessionThreadOverviewTimelineEvent[];
	fileEditEvents: SessionThreadOverviewTimelineEvent[];
	fileReadEvents: SessionThreadOverviewTimelineEvent[];
	fileWriteEvents: SessionThreadOverviewTimelineEvent[];
	skillEvents: SessionThreadOverviewTimelineEvent[];
	subagentEvents: SessionThreadOverviewTimelineEvent[];
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
			fileEditEvents: [],
			fileReadEvents: [],
			fileWriteEvents: [],
			skillEvents: [],
			subagentEvents: [],
			xRatio: event.xRatio,
		};
		switch (event.kind) {
			case "error":
				cluster.errorEvents.push(event);
				break;
			case "file-edit":
				cluster.fileEditEvents.push(event);
				break;
			case "file-read":
				cluster.fileReadEvents.push(event);
				break;
			case "file-write":
				cluster.fileWriteEvents.push(event);
				break;
			case "skill":
				cluster.skillEvents.push(event);
				break;
			case "subagent":
				cluster.subagentEvents.push(event);
				break;
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

export function getSessionOverviewEventDotColorClassName(
	kind: SessionThreadOverviewTimelineEventKind,
) {
	return cn(
		kind === "error" && "bg-red-600 dark:bg-red-400",
		kind === "file-edit" && "bg-amber-600 dark:bg-amber-400",
		kind === "file-read" && "bg-sky-600 dark:bg-sky-400",
		kind === "file-write" && "bg-emerald-600 dark:bg-emerald-400",
		kind === "skill" && "bg-(--session-overview-accent)",
		kind === "subagent" && "bg-fuchsia-600 dark:bg-fuchsia-400",
	);
}

export function getSessionOverviewEventDotClassName(
	kind: SessionThreadOverviewTimelineEventKind,
) {
	return cn(
		"size-1.5 shrink-0 rounded-full ring-1 ring-(--session-overview-chart-surface)",
		getSessionOverviewEventDotColorClassName(kind),
	);
}

function SessionOverviewEventDot({
	events,
	kind,
}: {
	events: readonly SessionThreadOverviewTimelineEvent[];
	kind: SessionThreadOverviewTimelineEventKind;
}) {
	if (events.length === 0) {
		return null;
	}

	return (
		<span
			className={getSessionOverviewEventDotClassName(kind)}
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
		...cluster.fileEditEvents,
		...cluster.fileReadEvents,
		...cluster.fileWriteEvents,
		...cluster.skillEvents,
		...cluster.subagentEvents,
	]);
	const errorCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "error"),
	);
	const skillCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "skill"),
	);
	const readCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "file-read"),
	);
	const writeCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "file-write"),
	);
	const editCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "file-edit"),
	);
	const subagentCount = getEventCount(
		visibleEvents.filter((event) => event.kind === "subagent"),
	);

	return (
		<div
			aria-label={`${errorCount.toLocaleString()} errors, ${skillCount.toLocaleString()} skill uses, ${readCount.toLocaleString()} file reads, ${writeCount.toLocaleString()} file writes, ${editCount.toLocaleString()} file edits, and ${subagentCount.toLocaleString()} subagents on the chart`}
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
					<SessionOverviewEventDot
						events={cluster.fileReadEvents}
						kind="file-read"
					/>
					<SessionOverviewEventDot
						events={cluster.fileWriteEvents}
						kind="file-write"
					/>
					<SessionOverviewEventDot
						events={cluster.fileEditEvents}
						kind="file-edit"
					/>
					<SessionOverviewEventDot
						events={cluster.subagentEvents}
						kind="subagent"
					/>
				</span>
			))}
		</div>
	);
}
