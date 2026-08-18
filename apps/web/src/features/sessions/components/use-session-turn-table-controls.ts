import { useMemo, useState } from "react";
import type { SessionTurnTableOption } from "./session-turn-table";
import { DEFAULT_SESSION_TURN_TABLE_COLUMNS } from "./session-turn-table-column-options";
import {
	getInitialSessionTurnTableSortDirection,
	type SessionTurnTableSortKey,
	type SessionTurnTableSortState,
	sortSessionTurnTableOptions,
} from "./session-turn-table-filters";

export function useSessionTurnTableControls<
	TOption extends SessionTurnTableOption,
>({ options }: { options: readonly TOption[] }) {
	const [sort, setSort] = useState<SessionTurnTableSortState>({
		direction: "asc",
		key: "time",
	});
	const effectiveVisibleColumnKeys = useMemo(
		() => new Set(DEFAULT_SESSION_TURN_TABLE_COLUMNS),
		[],
	);
	const visibleMatches = useMemo(
		() =>
			sortSessionTurnTableOptions(
				options.map((option, index) => ({ index, option })),
				sort,
			),
		[options, sort],
	);

	function handleSort(sortKey: SessionTurnTableSortKey) {
		setSort((currentSort) => ({
			direction:
				currentSort.key === sortKey
					? currentSort.direction === "asc"
						? "desc"
						: "asc"
					: getInitialSessionTurnTableSortDirection(sortKey),
			key: sortKey,
		}));
	}

	return {
		effectiveVisibleColumnKeys,
		handleSort,
		sort,
		visibleMatches,
	};
}
