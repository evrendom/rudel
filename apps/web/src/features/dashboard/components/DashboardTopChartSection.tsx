import type { ReactNode } from "react";
import { DashboardHeadlineMetricGrid } from "@/features/dashboard/components/DashboardHeadlineMetricGrid";
import {
	type DashboardHighlightChangeHandler,
	type DashboardHighlightSource,
	useDashboardHighlightState,
} from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

export type DashboardTopChartRenderProps = {
	highlightSource: DashboardHighlightSource;
	highlightedItemId: string | null;
	onHighlightItemChange: DashboardHighlightChangeHandler;
};

export function DashboardTopChartSection({
	chart,
	className,
	detail,
	isMetricsLoading = false,
	metrics,
	showDelta = false,
}: {
	chart: ReactNode;
	className?: string;
	detail: ReactNode;
	isMetricsLoading?: boolean;
	metrics: DashboardHeadlineMetric[];
	showDelta?: boolean;
}) {
	return (
		<div className={cn("flex flex-col gap-8", className)}>
			<div className="flex flex-1 flex-col border-b border-[color:var(--dashboardy-divider)] lg:flex-row lg:items-center lg:gap-0">
				<div className="flex flex-1 flex-col justify-center pb-4 pt-0 lg:pb-4">
					<DashboardHeadlineMetricGrid
						metrics={metrics}
						className="pb-0"
						isLoading={isMetricsLoading}
						showDelta={showDelta}
					/>
				</div>
				<div className="flex flex-1 items-center pt-0 lg:max-w-[760px] 2xl:max-w-[820px]">
					{chart}
				</div>
			</div>
			{detail}
		</div>
	);
}

export function DashboardInteractiveTopChartSection({
	className,
	isMetricsLoading = false,
	metrics,
	renderChart,
	renderDetail,
	showDelta = false,
}: {
	className?: string;
	isMetricsLoading?: boolean;
	metrics: DashboardHeadlineMetric[];
	renderChart: (props: DashboardTopChartRenderProps) => ReactNode;
	renderDetail: (props: DashboardTopChartRenderProps) => ReactNode;
	showDelta?: boolean;
}) {
	const { highlightSource, highlightedItemId, setHighlight } =
		useDashboardHighlightState();

	const renderProps: DashboardTopChartRenderProps = {
		highlightSource,
		highlightedItemId,
		onHighlightItemChange: setHighlight,
	};

	return (
		<DashboardTopChartSection
			chart={renderChart(renderProps)}
			className={className}
			detail={renderDetail(renderProps)}
			isMetricsLoading={isMetricsLoading}
			metrics={metrics}
			showDelta={showDelta}
		/>
	);
}
