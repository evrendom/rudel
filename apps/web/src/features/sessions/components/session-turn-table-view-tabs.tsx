import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type SessionTurnTableView = "model" | "member" | "both";

type SessionTurnTableNavigationKey =
	| "ArrowLeft"
	| "ArrowRight"
	| "Home"
	| "End";

const SESSION_TURN_TABLE_VIEWS: readonly {
	label: string;
	value: SessionTurnTableView;
}[] = [
	{ label: "Model", value: "model" },
	{ label: "Member", value: "member" },
	{ label: "Both", value: "both" },
];

function isSessionTurnTableNavigationKey(
	key: string,
): key is SessionTurnTableNavigationKey {
	return (
		key === "ArrowLeft" ||
		key === "ArrowRight" ||
		key === "Home" ||
		key === "End"
	);
}

export function getNextSessionTurnTableView(
	currentView: SessionTurnTableView,
	key: SessionTurnTableNavigationKey,
) {
	if (key === "Home") {
		return SESSION_TURN_TABLE_VIEWS[0]?.value ?? currentView;
	}
	if (key === "End") {
		return SESSION_TURN_TABLE_VIEWS.at(-1)?.value ?? currentView;
	}

	const currentIndex = SESSION_TURN_TABLE_VIEWS.findIndex(
		(option) => option.value === currentView,
	);
	const direction = key === "ArrowRight" ? 1 : -1;
	const nextIndex =
		(currentIndex + direction + SESSION_TURN_TABLE_VIEWS.length) %
		SESSION_TURN_TABLE_VIEWS.length;
	return SESSION_TURN_TABLE_VIEWS[nextIndex]?.value ?? currentView;
}

export function SessionTurnTableViewTabs({
	activeView,
	className,
	onViewChange,
	panelId,
	tabIdPrefix,
}: {
	activeView: SessionTurnTableView;
	className: string | undefined;
	onViewChange: (view: SessionTurnTableView) => void;
	panelId: string;
	tabIdPrefix: string;
}) {
	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (!isSessionTurnTableNavigationKey(event.key)) {
			return;
		}

		event.preventDefault();
		const nextView = getNextSessionTurnTableView(activeView, event.key);
		onViewChange(nextView);
		event.currentTarget
			.querySelector<HTMLButtonElement>(`[data-turn-table-view="${nextView}"]`)
			?.focus();
	}

	return (
		<div
			role="tablist"
			aria-label="Turn table view"
			className={cn(
				"flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-md bg-(--session-overview-hover) p-0.5",
				className,
			)}
			onKeyDown={handleKeyDown}
		>
			{SESSION_TURN_TABLE_VIEWS.map((option) => {
				const selected = option.value === activeView;

				return (
					<button
						type="button"
						key={option.value}
						role="tab"
						id={`${tabIdPrefix}-${option.value}`}
						aria-controls={panelId}
						aria-selected={selected}
						tabIndex={selected ? 0 : -1}
						className={cn(
							"relative h-7 shrink-0 rounded-sm px-2.5 text-sm font-medium tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
							selected
								? "bg-(--session-overview-surface) text-(--session-overview-text)"
								: "text-(--session-overview-muted) hover:text-(--session-overview-text)",
						)}
						data-turn-table-view={option.value}
						onClick={() => onViewChange(option.value)}
					>
						{option.label}
						<span
							aria-hidden="true"
							className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
						/>
					</button>
				);
			})}
		</div>
	);
}
