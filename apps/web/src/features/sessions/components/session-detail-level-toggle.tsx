import { useId } from "react";
import type { SessionDetailLevel } from "./session-detail-level";

const DETAIL_LEVEL_OPTIONS: readonly {
	label: string;
	value: SessionDetailLevel;
}[] = [
	{ label: "Request level", value: "request" },
	{ label: "Normal level", value: "normal" },
];

export function SessionDetailLevelToggle({
	onChange,
	value,
}: {
	onChange: (level: SessionDetailLevel) => void;
	value: SessionDetailLevel;
}) {
	const name = useId();

	return (
		<fieldset className="flex shrink-0 items-center rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) p-0.5">
			<legend className="sr-only">Session detail level</legend>
			{DETAIL_LEVEL_OPTIONS.map((option) => (
				<label
					key={option.value}
					className="relative flex h-7 cursor-pointer items-center rounded-sm px-2 text-sm font-medium whitespace-nowrap text-(--session-overview-muted) outline-none hover:text-(--session-overview-text) has-checked:bg-(--session-overview-hover) has-checked:text-(--session-overview-text) has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-(--session-overview-accent)"
				>
					<input
						checked={value === option.value}
						className="absolute inset-0 appearance-none outline-none"
						name={name}
						onChange={() => onChange(option.value)}
						type="radio"
						value={option.value}
					/>
					{option.label}
				</label>
			))}
		</fieldset>
	);
}
