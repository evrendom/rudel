export const SIDEBAR_NEWS_ACTIVE_ATTRIBUTE = "data-sidebar-news-card-active";

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
	newsCardTriggerZ: {
		key: "__sidebar_tune_news_card_trigger_z",
		defaultValue: 60,
	},
	newsBackdropZ: {
		key: "__sidebar_tune_news_backdrop_z",
		defaultValue: 50,
	},
	newsPopupZ: {
		key: "__sidebar_tune_news_popup_z",
		defaultValue: 51,
	},
	newsActiveSidebarZ: {
		key: "__sidebar_tune_news_active_sidebar_z",
		defaultValue: 10,
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

const booleanTuningConfig = {
	newsPromoteSidebar: {
		key: "__sidebar_tune_news_promote_sidebar",
		defaultValue: false,
	},
	newsSidebarOverflowVisible: {
		key: "__sidebar_tune_news_sidebar_overflow",
		defaultValue: false,
	},
	newsUseSharedLayout: {
		key: "__sidebar_tune_news_use_shared_layout",
		defaultValue: true,
	},
	newsUseMeasuredClose: {
		key: "__sidebar_tune_news_use_measured_close",
		defaultValue: true,
	},
	newsUsePlainFixedPopup: {
		key: "__sidebar_tune_news_use_plain_fixed_popup",
		defaultValue: true,
	},
	newsHidePerformanceChartWhileActive: {
		key: "__sidebar_tune_news_hide_performance_chart",
		defaultValue: false,
	},
	newsDisableChartInteractiveLayersWhileActive: {
		key: "__sidebar_tune_news_disable_chart_interactive_layers",
		defaultValue: false,
	},
	newsPromoteModalCompositorLayer: {
		key: "__sidebar_tune_news_promote_modal_compositor",
		defaultValue: false,
	},
} as const;

export type SidebarShellNumericTuningKey = keyof typeof numericTuningConfig;
export type SidebarShellStringTuningKey = keyof typeof stringTuningConfig;
export type SidebarShellBooleanTuningKey = keyof typeof booleanTuningConfig;

export type SidebarShellTuningState = Record<
	SidebarShellNumericTuningKey,
	number
> &
	Record<SidebarShellStringTuningKey, string> &
	Record<SidebarShellBooleanTuningKey, boolean>;

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
	...Object.fromEntries(
		Object.entries(booleanTuningConfig).map(([key, config]) => [
			key,
			config.defaultValue,
		]),
	),
} as SidebarShellTuningState;

export function getDefaultSidebarShellTuningState() {
	return { ...defaultSidebarShellTuningState };
}
