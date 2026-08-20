import { Fragment } from "react";
import {
	SESSION_OVERVIEW_COLUMNS,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { cn } from "@/lib/utils";

export function SessionsOverviewFooter({
	sessionCountLabel,
}: {
	sessionCountLabel: number;
}) {
	return (
		<div
			className={cn(
				"sticky bottom-0 z-30 grid h-9 shrink-0 bg-(--session-overview-surface)",
				SESSION_OVERVIEW_GRID_CLASS_NAME,
			)}
		>
			{SESSION_OVERVIEW_COLUMNS.map((column, index) => (
				<Fragment key={column.key}>
					<div
						className={cn(
							"flex items-center border-r border-y border-(--session-overview-border) bg-(--session-overview-surface) px-3 [border-right-color:transparent]",
							index === 1 && "justify-end",
						)}
					>
						{index === 1 ? (
							<p className="flex min-w-0 items-center gap-1 text-base font-medium tracking-[-0.01em] text-(--session-overview-text) tabular-nums sm:text-sm">
								{sessionCountLabel.toLocaleString()}
								<span className="font-normal text-(--session-overview-muted)">
									count
								</span>
							</p>
						) : null}
					</div>
					{column.key === "time" ? (
						<div className="bg-(--session-overview-surface)" />
					) : null}
				</Fragment>
			))}
		</div>
	);
}
