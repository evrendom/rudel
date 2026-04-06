export const SIDEBAR_SHELL_DEBUG_QUERY_PARAM = "__sidebar_shell_debug";
export const SIDEBAR_SHELL_VARIANT_QUERY_PARAM = "__sidebar_shell";
export const SIDEBAR_SHELL_BORDERS_QUERY_PARAM = "__sidebar_shell_borders";
export const SIDEBAR_SHELL_FORCE_LABELS_QUERY_PARAM =
	"__sidebar_shell_force_labels";

export type SidebarShellDebugVariant = "baseline" | "geometry-trace";

const DEFAULT_VARIANT: SidebarShellDebugVariant = "baseline";
const DEFAULT_SHOW_BORDERS = true;

const numericTuningConfig = {
	collapsedWidth: {
		key: "__sidebar_tune_collapsed_width",
		defaultValue: 3.5,
	},
	expandedWidth: {
		key: "__sidebar_tune_expanded_width",
		defaultValue: 13,
	},
	sectionMarginTop: {
		key: "__sidebar_tune_section_margin_top",
		defaultValue: 0.8,
	},
	railInsetLeft: {
		key: "__sidebar_tune_rail_inset_left",
		defaultValue: 0.375,
	},
	railInsetRight: {
		key: "__sidebar_tune_rail_inset_right",
		defaultValue: 0.375,
	},
	collapsedSectionPaddingX: {
		key: "__sidebar_tune_collapsed_section_px",
		defaultValue: 0.25,
	},
	expandedSectionPaddingX: {
		key: "__sidebar_tune_expanded_section_px",
		defaultValue: 0,
	},
	collapsedFooterPaddingX: {
		key: "__sidebar_tune_collapsed_footer_px",
		defaultValue: 0.25,
	},
	expandedFooterPaddingX: {
		key: "__sidebar_tune_expanded_footer_px",
		defaultValue: 0,
	},
	expandedFooterPaddingBottom: {
		key: "__sidebar_tune_expanded_footer_pb",
		defaultValue: 0.375,
	},
	collapsedStackGap: {
		key: "__sidebar_tune_collapsed_gap",
		defaultValue: 0.25,
	},
	expandedStackGap: {
		key: "__sidebar_tune_expanded_gap",
		defaultValue: 0.25,
	},
	rowHeight: {
		key: "__sidebar_tune_row_height",
		defaultValue: 2.25,
	},
	rowRadius: {
		key: "__sidebar_tune_row_radius",
		defaultValue: 0.5,
	},
	collapsedRowPaddingLeft: {
		key: "__sidebar_tune_collapsed_row_pl",
		defaultValue: 0,
	},
	collapsedRowPaddingRight: {
		key: "__sidebar_tune_collapsed_row_pr",
		defaultValue: 0,
	},
	rowPaddingLeft: {
		key: "__sidebar_tune_row_pl",
		defaultValue: 0.25,
	},
	rowPaddingRight: {
		key: "__sidebar_tune_row_pr",
		defaultValue: 0.25,
	},
	rowGap: {
		key: "__sidebar_tune_row_gap",
		defaultValue: 0.5,
	},
	iconLaneSize: {
		key: "__sidebar_tune_icon_lane",
		defaultValue: 2.25,
	},
	iconSize: {
		key: "__sidebar_tune_icon_size",
		defaultValue: 1.25,
	},
	avatarSize: {
		key: "__sidebar_tune_avatar_size",
		defaultValue: 1.5,
	},
	labelFontSize: {
		key: "__sidebar_tune_label_size",
		defaultValue: 0.875,
	},
	shortcutFontSize: {
		key: "__sidebar_tune_shortcut_size",
		defaultValue: 0.6875,
	},
} as const;

const stringTuningConfig = {
	rowIdleBg: {
		key: "__sidebar_tune_idle_bg",
		defaultValue: "transparent",
	},
	rowHoverBg: {
		key: "__sidebar_tune_hover_bg",
		defaultValue: "var(--dashboard-01-rail-hover)",
	},
	rowActiveBg: {
		key: "__sidebar_tune_active_bg",
		defaultValue: "white",
	},
	rowFg: {
		key: "__sidebar_tune_fg",
		defaultValue: "var(--dashboard-01-rail-icon)",
	},
	rowActiveFg: {
		key: "__sidebar_tune_active_fg",
		defaultValue: "var(--dashboard-01-rail-icon-active)",
	},
} as const;

export type SidebarShellTuningState = {
	[K in keyof typeof numericTuningConfig]: number;
} & {
	[K in keyof typeof stringTuningConfig]: string;
};

const defaultSidebarShellTuningState = {
	...Object.fromEntries(
		Object.entries(numericTuningConfig).map(([key, config]) => [
			key,
			config.defaultValue,
		]),
	),
	...Object.fromEntries(
		Object.entries(stringTuningConfig).map(([key, config]) => [
			key,
			config.defaultValue,
		]),
	),
} as SidebarShellTuningState;

export type SidebarShellDebugState = {
	enabled: boolean;
	variant: SidebarShellDebugVariant;
	showBorders: boolean;
	alwaysShowLabels: boolean;
	tuning: SidebarShellTuningState;
};

export type SidebarShellDebugUpdate = {
	enabled?: boolean;
	variant?: SidebarShellDebugVariant;
	showBorders?: boolean;
	alwaysShowLabels?: boolean;
	tuning?: Partial<SidebarShellTuningState>;
};

function getNumericTuningValue(
	searchParams: URLSearchParams,
	key: string,
	defaultValue: number,
) {
	const rawValue = searchParams.get(key);
	if (rawValue == null) {
		return defaultValue;
	}

	const parsedValue = Number.parseFloat(rawValue);
	return Number.isFinite(parsedValue) ? parsedValue : defaultValue;
}

function getStringTuningValue(
	searchParams: URLSearchParams,
	key: string,
	defaultValue: string,
) {
	return searchParams.get(key) ?? defaultValue;
}

export function getSidebarShellDebugState(
	searchParams: URLSearchParams,
): SidebarShellDebugState {
	const enabled =
		searchParams.get(SIDEBAR_SHELL_DEBUG_QUERY_PARAM)?.toLowerCase() === "true";
	const variant = enabled ? "geometry-trace" : DEFAULT_VARIANT;
	const rawShowBorders = searchParams.get(SIDEBAR_SHELL_BORDERS_QUERY_PARAM);
	const showBorders =
		rawShowBorders == null
			? DEFAULT_SHOW_BORDERS
			: rawShowBorders.toLowerCase() !== "false";
	const alwaysShowLabels =
		searchParams.get(SIDEBAR_SHELL_FORCE_LABELS_QUERY_PARAM)?.toLowerCase() ===
		"true";

	const tuning = {
		...Object.fromEntries(
			Object.entries(numericTuningConfig).map(([key, config]) => [
				key,
				getNumericTuningValue(searchParams, config.key, config.defaultValue),
			]),
		),
		...Object.fromEntries(
			Object.entries(stringTuningConfig).map(([key, config]) => [
				key,
				getStringTuningValue(searchParams, config.key, config.defaultValue),
			]),
		),
	} as SidebarShellTuningState;

	return {
		enabled,
		variant,
		showBorders,
		alwaysShowLabels,
		tuning,
	};
}

function applyTuningSearchParams(
	searchParams: URLSearchParams,
	tuning: SidebarShellTuningState,
) {
	for (const [stateKey, config] of Object.entries(numericTuningConfig)) {
		searchParams.set(
			config.key,
			`${tuning[stateKey as keyof SidebarShellTuningState]}`,
		);
	}

	for (const [stateKey, config] of Object.entries(stringTuningConfig)) {
		searchParams.set(
			config.key,
			`${tuning[stateKey as keyof SidebarShellTuningState]}`,
		);
	}
}

export function appendSidebarShellDebugParams(
	to: string,
	searchParams: URLSearchParams,
) {
	const debugState = getSidebarShellDebugState(searchParams);

	if (!debugState.enabled) {
		return to;
	}

	const url = new URL(to, "http://sidebar-debug.local");

	url.searchParams.set(SIDEBAR_SHELL_DEBUG_QUERY_PARAM, "true");
	url.searchParams.set(SIDEBAR_SHELL_VARIANT_QUERY_PARAM, debugState.variant);
	url.searchParams.set(
		SIDEBAR_SHELL_BORDERS_QUERY_PARAM,
		`${debugState.showBorders}`,
	);
	url.searchParams.set(
		SIDEBAR_SHELL_FORCE_LABELS_QUERY_PARAM,
		`${debugState.alwaysShowLabels}`,
	);
	applyTuningSearchParams(url.searchParams, debugState.tuning);

	return `${url.pathname}${url.search}${url.hash}`;
}

export function getSidebarShellDebugSearchParams(
	searchParams: URLSearchParams,
	nextState: SidebarShellDebugUpdate,
) {
	const currentState = getSidebarShellDebugState(searchParams);
	const debugState: SidebarShellDebugState = {
		...currentState,
		...nextState,
		tuning: {
			...currentState.tuning,
			...nextState.tuning,
		},
	};
	const nextSearchParams = new URLSearchParams(searchParams);

	if (!debugState.enabled) {
		nextSearchParams.delete(SIDEBAR_SHELL_DEBUG_QUERY_PARAM);
		nextSearchParams.delete(SIDEBAR_SHELL_VARIANT_QUERY_PARAM);
		nextSearchParams.delete(SIDEBAR_SHELL_BORDERS_QUERY_PARAM);
		nextSearchParams.delete(SIDEBAR_SHELL_FORCE_LABELS_QUERY_PARAM);
		for (const config of Object.values(numericTuningConfig)) {
			nextSearchParams.delete(config.key);
		}
		for (const config of Object.values(stringTuningConfig)) {
			nextSearchParams.delete(config.key);
		}
		return nextSearchParams;
	}

	nextSearchParams.set(SIDEBAR_SHELL_DEBUG_QUERY_PARAM, "true");
	nextSearchParams.set(SIDEBAR_SHELL_VARIANT_QUERY_PARAM, debugState.variant);
	nextSearchParams.set(
		SIDEBAR_SHELL_BORDERS_QUERY_PARAM,
		`${debugState.showBorders}`,
	);
	nextSearchParams.set(
		SIDEBAR_SHELL_FORCE_LABELS_QUERY_PARAM,
		`${debugState.alwaysShowLabels}`,
	);
	applyTuningSearchParams(nextSearchParams, debugState.tuning);

	return nextSearchParams;
}

export function getDefaultSidebarShellTuningState() {
	return { ...defaultSidebarShellTuningState };
}
