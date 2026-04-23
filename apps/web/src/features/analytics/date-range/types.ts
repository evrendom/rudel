export type DateRangeSource = "url" | "storage" | "default";

export interface DateRangeState {
	startDate: string;
	endDate: string;
}

export interface DateRangeActions {
	setStartDate: (date: string) => void;
	setEndDate: (date: string) => void;
	setDateRange: (startDate: string, endDate: string) => void;
}

export interface DateRangeMeta {
	dayCount: number;
	source: DateRangeSource;
}

export interface DateRangeContextValue {
	state: DateRangeState;
	actions: DateRangeActions;
	meta: DateRangeMeta;
}
