import { useEffect, useRef } from "react";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
	captureDashboardViewed,
	isDashboardPageName,
} from "@/lib/product-analytics";
import { useDashboardAnalytics } from "./useDashboardAnalytics";

export type DashboardSectionState = "populated" | "empty" | "error" | "hidden";

export type DashboardSection = {
	id: string;
	state: DashboardSectionState;
	itemCount?: number | null;
};

export type DashboardMetric = {
	id: string;
	value: number | null | undefined;
};

type DashboardSnapshot = {
	metrics: Record<string, number | null>;
};

type DashboardPayloadValue = string | number | boolean | null | undefined;

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
	sections: DashboardSection[],
): Record<string, DashboardPayloadValue> {
	if (sections.length === 0) {
		return {};
	}

	let populatedCount = 0;
	let emptyCount = 0;
	let errorCount = 0;
	let hiddenCount = 0;

	const payload: Record<string, DashboardPayloadValue> = {};

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

function buildMetricMap(metrics: DashboardMetric[]) {
	const metricMap: Record<string, number | null> = {};

	for (const metric of metrics) {
		metricMap[toAnalyticsKey(metric.id)] = normalizeMetricValue(metric.value);
	}

	return metricMap;
}

function buildMetricPayload(
	metrics: Record<string, number | null>,
	previousSnapshot: DashboardSnapshot | null,
): Record<string, DashboardPayloadValue> {
	const metricEntries = Object.entries(metrics);
	if (metricEntries.length === 0) {
		return {};
	}

	const payload: Record<string, DashboardPayloadValue> = {
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

function readSnapshot(storageKey: string): DashboardSnapshot | null {
	if (typeof window === "undefined") {
		return null;
	}

	const rawValue = window.localStorage.getItem(storageKey);
	if (!rawValue) {
		return null;
	}

	try {
		const parsed = JSON.parse(rawValue) as DashboardSnapshot;
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
			} satisfies DashboardSnapshot),
		);
	} catch {
		// Analytics snapshots are best-effort only.
	}
}

export function useTrackDashboardView(options: {
	isLoading: boolean;
	isError?: boolean;
	hasData: boolean;
	insightCount?: number;
	sections?: DashboardSection[];
	metrics?: DashboardMetric[];
}) {
	const { startDate, endDate, calculateDays } = useDateRange();
	const { organizationId, userId, pageName } = useDashboardAnalytics();
	const viewedRangeKeyRef = useRef<string | null>(null);
	const dateRangeDays = calculateDays();

	useEffect(() => {
		if (
			!organizationId ||
			!userId ||
			!isDashboardPageName(pageName) ||
			options.isLoading ||
			options.isError
		) {
			return;
		}

		const viewedRangeKey = `${userId}:${organizationId}:${pageName}:${startDate}:${endDate}`;
		if (viewedRangeKeyRef.current === viewedRangeKey) {
			return;
		}

		const sectionPayload = buildSectionPayload(options.sections ?? []);
		const metricMap = buildMetricMap(options.metrics ?? []);
		const snapshotStorageKey = getSnapshotStorageKey({
			organizationId,
			userId,
			pageName,
			startDate,
			endDate,
		});
		const previousSnapshot = readSnapshot(snapshotStorageKey);
		const metricPayload = buildMetricPayload(metricMap, previousSnapshot);

		viewedRangeKeyRef.current = viewedRangeKey;
		captureDashboardViewed({
			organization_id: organizationId,
			user_id: userId,
			page_name: pageName,
			has_data: options.hasData,
			date_range_days: dateRangeDays,
			insight_count: options.insightCount ?? 0,
			...sectionPayload,
			...metricPayload,
		});
		writeSnapshot(snapshotStorageKey, metricMap);
	}, [
		dateRangeDays,
		endDate,
		options.hasData,
		options.insightCount,
		options.isError,
		options.isLoading,
		options.metrics,
		options.sections,
		organizationId,
		pageName,
		startDate,
		userId,
	]);
}
