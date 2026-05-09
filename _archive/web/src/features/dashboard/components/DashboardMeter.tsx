export function DashboardMeter({ value }: { value: number }) {
	const clampedValue = Math.max(0, Math.min(100, value));

	return (
		<div className="dashboardy-metric-bar w-full" aria-hidden="true">
			<span
				className="dashboardy-metric-bar-fill"
				style={{ width: `${clampedValue}%` }}
			/>
		</div>
	);
}
