import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	captureDashboardViewed,
	isDashboardPageName,
} from "@/lib/product-analytics";
import { useAnalyticsContext } from "@/features/analytics/tracking/useAnalyticsTracking";

export type PageSectionState = "populated" | "empty" | "error" | "hidden";

export type PageSection = {
	id: string;
	state: PageSectionState;
	itemCount?: number | null;
};

export type PageMetric = {
	id: string;
	value: number | null | undefined;
};

type PageSnapshot = {
	metrics: Record<string, number | null>;
};

type AnalyticsPayloadValue = string | number | boolean | null | undefined;

type PageViewTrackingMountProps = {
	isLoading: boolean;
	isError?: boolean;
	hasData: boolean;
	insightCount?: number;
	sections?: PageSection[];
	metrics?: PageMetric[];
};

const SNAPSHOT_STORAGE_PREFIX = "product_analytics.dashboard_view";

function toAnalyticsKey(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function roundValue(value: number) {
	return Math.round(value * 100) / 100;
}

function normalizeMetricValue(value: number | null | undefined) {
	if (value == null || !Number.isFinite(value)) {
		return null;
	}

	return roundValue(value);
}

function buildSectionPayload(
	sections: PageSection[],
): Record<string, AnalyticsPayloadValue> {
	if (sections.length === 0) {
		return {};
	}

	let populatedCount = 0;
	let emptyCount = 0;
	let errorCount = 0;
	let hiddenCount = 0;
	const payload: Record<string, AnalyticsPayloadValue> = {};

	for (const section of sections) {
		const sectionKey = toAnalyticsKey(section.id);
		payload[`${sectionKey}_state`] = section.state;

		if (section.itemCount != null) {
			payload[`${sectionKey}_item_count`] = section.itemCount;
		}

		if (section.state === "populated") {
			populatedCount += 1;
			continue;
		}

		if (section.state === "empty") {
			emptyCount += 1;
			continue;
		}

		if (section.state === "error") {
			errorCount += 1;
			continue;
		}

		hiddenCount += 1;
	}

	payload.section_count_total = sections.length;
	payload.section_count_populated = populatedCount;
	payload.section_count_empty = emptyCount;
	payload.section_count_error = errorCount;
	payload.section_count_hidden = hiddenCount;

	return payload;
}

function buildMetricMap(metrics: PageMetric[]) {
	const metricMap: Record<string, number | null> = {};

	for (const metric of metrics) {
		metricMap[toAnalyticsKey(metric.id)] = normalizeMetricValue(metric.value);
	}

	return metricMap;
}

function buildMetricPayload(
	metrics: Record<string, number | null>,
	previousSnapshot: PageSnapshot | null,
): Record<string, AnalyticsPayloadValue> {
	const metricEntries = Object.entries(metrics);

	if (metricEntries.length === 0) {
		return {};
	}

	const payload: Record<string, AnalyticsPayloadValue> = {
		comparison_status: previousSnapshot ? "comparable" : "no_previous_view",
	};

	for (const [metricKey, currentValue] of metricEntries) {
		payload[`${metricKey}_value`] = currentValue;

		if (!previousSnapshot) {
			payload[`${metricKey}_delta_abs`] = null;
			payload[`${metricKey}_delta_pct`] = null;
			continue;
		}

		const previousValue = previousSnapshot.metrics[metricKey];

		if (currentValue == null || previousValue == null) {
			payload[`${metricKey}_delta_abs`] = null;
			payload[`${metricKey}_delta_pct`] = null;
			continue;
		}

		const deltaAbs = roundValue(currentValue - previousValue);
		payload[`${metricKey}_delta_abs`] = deltaAbs;

		if (previousValue === 0) {
			payload[`${metricKey}_delta_pct`] = null;
			continue;
		}

		payload[`${metricKey}_delta_pct`] = roundValue(
			(deltaAbs / previousValue) * 100,
		);
	}

	return payload;
}

function getSnapshotStorageKey(input: {
	organizationId: string;
	userId: string;
	pageName: string;
	startDate: string;
	endDate: string;
}) {
	return [
		SNAPSHOT_STORAGE_PREFIX,
		input.userId,
		input.organizationId,
		input.pageName,
		input.startDate,
		input.endDate,
	].join(":");
}

function readSnapshot(storageKey: string): PageSnapshot | null {
	if (typeof window === "undefined") {
		return null;
	}

	const rawValue = window.localStorage.getItem(storageKey);

	if (!rawValue) {
		return null;
	}

	try {
		const parsed = JSON.parse(rawValue) as PageSnapshot;

		if (
			typeof parsed !== "object" ||
			parsed === null ||
			typeof parsed.metrics !== "object" ||
			parsed.metrics === null
		) {
			return null;
		}

		return parsed;
	} catch {
		window.localStorage.removeItem(storageKey);
		return null;
	}
}

function writeSnapshot(
	storageKey: string,
	metrics: Record<string, number | null>,
) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			storageKey,
			JSON.stringify({
				metrics,
			} satisfies PageSnapshot),
		);
	} catch {
		// Analytics snapshots are best-effort only.
	}
}

function PageViewTrackingCommit({
	dateRangeDays,
	endDate,
	hasData,
	insightCount,
	metrics,
	organizationId,
	pageName,
	sections,
	startDate,
	userId,
}: {
	dateRangeDays: number;
	endDate: string;
	hasData: boolean;
	insightCount?: number;
	metrics?: PageMetric[];
	organizationId: string;
	pageName: string;
	sections?: PageSection[];
	startDate: string;
	userId: string;
}) {
	useMountEffect(() => {
		const sectionPayload = buildSectionPayload(sections ?? []);
		const metricMap = buildMetricMap(metrics ?? []);
		const snapshotStorageKey = getSnapshotStorageKey({
			organizationId,
			userId,
			pageName,
			startDate,
			endDate,
		});
		const previousSnapshot = readSnapshot(snapshotStorageKey);
		const metricPayload = buildMetricPayload(metricMap, previousSnapshot);

		captureDashboardViewed({
			organization_id: organizationId,
			user_id: userId,
			page_name: pageName,
			has_data: hasData,
			date_range_days: dateRangeDays,
			insight_count: insightCount ?? null,
			...sectionPayload,
			...metricPayload,
		});

		writeSnapshot(snapshotStorageKey, metricMap);
	});

	return null;
}

export function PageViewTrackingMount({
	hasData,
	insightCount,
	isError,
	isLoading,
	metrics,
	sections,
}: PageViewTrackingMountProps) {
	const { state, meta } = useDateRange();
	const { organizationId, pageName, userId } = useAnalyticsContext();

	if (
		!organizationId ||
		!userId ||
		!isDashboardPageName(pageName) ||
		isLoading ||
		isError
	) {
		return null;
	}

	const trackingKey = `${userId}:${organizationId}:${pageName}:${state.startDate}:${state.endDate}`;

	return (
		<PageViewTrackingCommit
			key={trackingKey}
			dateRangeDays={meta.dayCount}
			endDate={state.endDate}
			hasData={hasData}
			insightCount={insightCount}
			metrics={metrics}
			organizationId={organizationId}
			pageName={pageName}
			sections={sections}
			startDate={state.startDate}
			userId={userId}
		/>
	);
}
