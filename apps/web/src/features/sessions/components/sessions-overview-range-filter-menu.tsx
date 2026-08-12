import { useId } from "react";
import { Input } from "@/app/ui/input";
import type { SessionOverviewRangeFilter } from "@/features/sessions/components/sessions-overview-table-utils";

type RangeBounds = {
	minimum: number;
	maximum: number;
	step: number;
};

export function SessionOverviewRangeFilterPanel({
	bounds,
	formatValue,
	label,
	onChange,
	value,
}: {
	bounds: RangeBounds;
	formatValue: (value: number) => string;
	label: string;
	onChange: (value: SessionOverviewRangeFilter) => void;
	value: SessionOverviewRangeFilter;
}) {
	const controlId = useId();
	const boundedMinimum = clamp(
		value.minimum ?? bounds.minimum,
		bounds.minimum,
		bounds.maximum,
	);
	const boundedMaximum = clamp(
		value.maximum ?? bounds.maximum,
		bounds.minimum,
		bounds.maximum,
	);
	const effectiveMinimum = Math.min(boundedMinimum, boundedMaximum);
	const effectiveMaximum = Math.max(boundedMinimum, boundedMaximum);
	const rangeSize = bounds.maximum - bounds.minimum;
	const minimumPercent =
		rangeSize === 0
			? 0
			: ((effectiveMinimum - bounds.minimum) / rangeSize) * 100;
	const maximumPercent =
		rangeSize === 0
			? 100
			: ((effectiveMaximum - bounds.minimum) / rangeSize) * 100;
	const isDisabled = bounds.minimum === bounds.maximum;

	function setMinimum(nextValue: number) {
		if (!Number.isFinite(nextValue)) {
			return;
		}

		const nextMinimum = clamp(nextValue, bounds.minimum, effectiveMaximum);
		onChange({
			...value,
			minimum: nextMinimum <= bounds.minimum ? null : nextMinimum,
		});
	}

	function setMaximum(nextValue: number) {
		if (!Number.isFinite(nextValue)) {
			return;
		}

		const nextMaximum = clamp(nextValue, effectiveMinimum, bounds.maximum);
		onChange({
			...value,
			maximum: nextMaximum >= bounds.maximum ? null : nextMaximum,
		});
	}

	return (
		<div className="space-y-3 p-3">
			<div className="grid grid-cols-2 gap-2">
				<label
					htmlFor={`${controlId}-minimum-number`}
					className="space-y-1 text-xs font-medium text-muted-foreground"
				>
					<span>Min</span>
					<Input
						id={`${controlId}-minimum-number`}
						name={`${controlId}-minimum-number`}
						type="number"
						aria-label={`Minimum ${label}`}
						className="h-9 rounded-lg bg-muted/60 px-2 text-base tabular-nums sm:text-sm"
						disabled={isDisabled}
						max={effectiveMaximum}
						min={bounds.minimum}
						step={bounds.step}
						value={effectiveMinimum}
						onChange={(event) => {
							if (event.target.value.length > 0) {
								setMinimum(event.target.valueAsNumber);
							}
						}}
					/>
				</label>
				<label
					htmlFor={`${controlId}-maximum-number`}
					className="space-y-1 text-xs font-medium text-muted-foreground"
				>
					<span>Max</span>
					<Input
						id={`${controlId}-maximum-number`}
						name={`${controlId}-maximum-number`}
						type="number"
						aria-label={`Maximum ${label}`}
						className="h-9 rounded-lg bg-muted/60 px-2 text-base tabular-nums sm:text-sm"
						disabled={isDisabled}
						max={bounds.maximum}
						min={effectiveMinimum}
						step={bounds.step}
						value={effectiveMaximum}
						onChange={(event) => {
							if (event.target.value.length > 0) {
								setMaximum(event.target.valueAsNumber);
							}
						}}
					/>
				</label>
			</div>
			<div className="relative h-8 rounded-md outline-none focus-within:ring-2 focus-within:ring-ring/40">
				<div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
				<div
					className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-(--session-overview-accent)"
					style={{
						left: `${minimumPercent}%`,
						right: `${100 - maximumPercent}%`,
					}}
				/>
				<input
					name={`${controlId}-minimum-range`}
					type="range"
					aria-label={`Minimum ${label} slider`}
					className="pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none bg-transparent outline-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-(--session-overview-surface) [&::-moz-range-thumb]:bg-(--session-overview-accent) [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-(--session-overview-surface) [&::-webkit-slider-thumb]:bg-(--session-overview-accent)"
					disabled={isDisabled}
					max={bounds.maximum}
					min={bounds.minimum}
					step={bounds.step}
					value={effectiveMinimum}
					onChange={(event) => setMinimum(event.target.valueAsNumber)}
				/>
				<input
					name={`${controlId}-maximum-range`}
					type="range"
					aria-label={`Maximum ${label} slider`}
					className="pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none bg-transparent outline-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-(--session-overview-surface) [&::-moz-range-thumb]:bg-(--session-overview-accent) [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-(--session-overview-surface) [&::-webkit-slider-thumb]:bg-(--session-overview-accent)"
					disabled={isDisabled}
					max={bounds.maximum}
					min={bounds.minimum}
					step={bounds.step}
					value={effectiveMaximum}
					onChange={(event) => setMaximum(event.target.valueAsNumber)}
				/>
			</div>
			<div className="flex items-center justify-between gap-3 text-xs tabular-nums text-muted-foreground">
				<span>{formatValue(bounds.minimum)}</span>
				<span>{formatValue(bounds.maximum)}</span>
			</div>
		</div>
	);
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), maximum);
}
